import type {
  AsyncIDBInstance,
  CollectionSchema,
  DBInstanceCallback,
  AsyncIDBConfig,
  IDBTransactionCallback,
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
  constructor(private name: string, private config: AsyncIDBConfig<T>) {
    this.#db = null
    this.#instanceCallbacks = []
    this.stores = Object.entries(this.config.schema).reduce(
      (acc, [name, collection]) => ({
        ...acc,
        [name]: new AsyncIDBStore(this, collection, name),
      }),
      {} as AsyncIDBInstance<T>["collections"]
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

  cloneStoresForTransaction(tx: IDBTransaction, eventQueue: Function[]) {
    return Object.entries(this.stores).reduce((acc, [name, store]) => {
      return {
        ...acc,
        [name]: AsyncIDBStore.cloneForTransaction(tx, store, eventQueue),
      }
    }, {} as AsyncIDBInstance<T>["collections"])
  }

  async transaction(callback: IDBTransactionCallback<T>, options?: IDBTransactionOptions) {
    const idbInstance = await new Promise<IDBDatabase>((res) => this.getInstance(res))
    const tx = idbInstance.transaction(Object.keys(this.config.schema), "readwrite", options)

    const eventQueue: Function[] = []
    const txCollections = this.cloneStoresForTransaction(tx, eventQueue)

    let aborted = false
    tx.addEventListener("abort", () => (aborted = true))

    try {
      const res = (await await callback(txCollections, tx)) as any
      for (let i = 0; i < eventQueue.length; i++) eventQueue[i]()
      return res
    } catch (error) {
      if (!aborted) tx.abort()
      throw error
    }
  }

  private init() {
    let schemaValid = true
    for (const [name, collection] of Object.entries(this.config.schema)) {
      Collection.validate(
        this,
        collection,
        (err) => (
          (schemaValid = false),
          (this.config.onError ?? console.error)(
            `[async-idb-orm]: encountered error with collection "${name}":`,
            err
          )
        )
      )
    }
    if (!schemaValid) return

    for (const store of Object.values(this.stores)) {
      AsyncIDBStore.init(store)
    }
    for (const store of Object.values(this.stores)) {
      AsyncIDBStore.finalizeDependencies(this, store)
    }

    const request = indexedDB.open(this.name, this.config.version)
    request.onerror = this.config.onError ?? console.error
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
        collections: this.cloneStoresForTransaction(request.transaction!, []),
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
