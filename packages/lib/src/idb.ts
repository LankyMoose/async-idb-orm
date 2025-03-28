import type {
  AsyncIDBInstance,
  CollectionSchema,
  DBInstanceCallback,
  OnDBUpgradeCallback,
  OnDBUpgradeCallbackContext,
  TransactionOptions,
} from "./types"

import { Collection } from "./collection.js"
import { AsyncIDBStore } from "./idbStore.js"

/**
 * @private
 * Internal usage only. Do not use directly.
 */
export class AsyncIDB<T extends CollectionSchema> {
  #db: IDBDatabase | null
  #instanceCallbacks: DBInstanceCallback[]
  stores: {
    [key in keyof T]: AsyncIDBStore<T[key]>
  }
  onUpgrade?: OnDBUpgradeCallback<T>
  constructor(
    private name: string,
    private schema: T,
    private version: number,
    private errHandler: typeof console.error
  ) {
    this.#db = null
    this.#instanceCallbacks = []
    this.stores = Object.keys(this.schema).reduce(
      (acc, name) => ({
        ...acc,
        [name]: new AsyncIDBStore(this, this.schema[name], name),
      }),
      {} as { [key in keyof T]: AsyncIDBStore<T[key]> }
    )
    this.init()
  }

  getInstance(instanceCallback: DBInstanceCallback): void {
    if (!this.#db) {
      this.#instanceCallbacks.push(instanceCallback)
      return
    }
    instanceCallback(this.#db)
  }

  private validateShema() {
    let schemaValid = true
    for (const [name, collection] of Object.entries(this.schema)) {
      Collection.validate(
        this,
        collection,
        (err) => (
          (schemaValid = false),
          this.errHandler(`[async-idb-orm]: encountered error with collection "${name}":`, err)
        )
      )
    }
    return schemaValid
  }

  private init() {
    if (!this.validateShema()) return
    for (const store of Object.values(this.stores)) {
      AsyncIDBStore.init(store)
    }
    for (const store of Object.values(this.stores)) {
      AsyncIDBStore.finalizeDependencies(this, store)
    }

    const request = indexedDB.open(this.name, this.version)
    request.onerror = this.errHandler
    request.onupgradeneeded = async (e) => {
      console.log("onupgradeneeded")
      await this.initializeStores(request, e)
    }

    request.onsuccess = () => {
      console.log("onsuccess")
      this.#db = request.result
      while (this.#instanceCallbacks.length) {
        this.#instanceCallbacks.shift()!(this.#db)
      }
    }
  }

  private async initializeStores(request: IDBOpenDBRequest, event: IDBVersionChangeEvent) {
    const dbInstance = request.result
    if (this.onUpgrade) {
      const ctx: OnDBUpgradeCallbackContext<T> = {
        db: dbInstance,
        getAll: (collectionName) => {
          const tx = request.transaction
          if (!tx || tx.mode !== "versionchange") {
            throw new Error("[async-idb-orm]: transaction mode must be versionchange")
          }
          return new Promise((resolve, reject) => {
            const { read: deserialize } = AsyncIDBStore.getCollection(
              this.stores[collectionName]
            ).serializationConfig

            const objectStore = tx.objectStore(collectionName)
            const getallReq = objectStore.getAll()
            getallReq.onerror = (err) => reject(err)
            getallReq.onsuccess = () => resolve(getallReq.result.map(deserialize))
          })
        },
        insert: (collectionName, records) => {
          const tx = request.transaction
          if (!tx || tx.mode !== "versionchange") {
            throw new Error("[async-idb-orm]: transaction mode must be versionchange")
          }
          return new Promise((resolve, reject) => {
            const { write: serialize } = AsyncIDBStore.getCollection(
              this.stores[collectionName]
            ).serializationConfig

            const objectStore = tx.objectStore(collectionName)
            Promise.all(
              records.map(async (record) => {
                const serialized = serialize(record)
                const req = objectStore.put(serialized)
                req.onerror = (err) => reject(err)
                await new Promise((res) => (req.onsuccess = res))
              })
            )
              .then(() => resolve())
              .catch((err) => reject(err))
          })
        },
        deleteStore: (name) => dbInstance.deleteObjectStore(name),
        createStore: (name) => this.createStore(dbInstance, name),
      }
      await this.onUpgrade(ctx, event)
    }
    for (const storeName of Object.keys(this.stores)) {
      if (dbInstance.objectStoreNames.contains(storeName)) {
        continue
      }
      this.createStore(dbInstance, storeName)
    }
  }

  private createStore(db: IDBDatabase, name: keyof T): IDBObjectStore {
    const store = this.stores[name]
    const { keyPath, indexes } = AsyncIDBStore.getCollection(store)
    const objectStore = db.createObjectStore(store.name, { keyPath })

    for (const { name, key, options } of indexes) {
      objectStore.createIndex(name, key, options)
    }
    return objectStore
  }
}
