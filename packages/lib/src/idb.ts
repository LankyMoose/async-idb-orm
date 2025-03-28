import type { CollectionSchema, DBInstanceCallback } from "./types"

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
    request.onupgradeneeded = () => this.initializeStores(request.result)
    request.onsuccess = () => {
      this.#db = request.result
      while (this.#instanceCallbacks.length) {
        this.#instanceCallbacks.shift()!(this.#db)
      }
    }
  }

  private initializeStores(db: IDBDatabase) {
    for (const store of Object.values(this.stores)) {
      if (db.objectStoreNames.contains(store.name)) {
        const collection = AsyncIDBStore.getCollection(store)
        collection.onCreationConflict?.()
        if (collection.creationConflictMode !== "delete") {
          continue
        }
        db.deleteObjectStore(store.name)
      }

      const { keyPath, indexes } = AsyncIDBStore.getCollection(store)
      const objectStore = db.createObjectStore(store.name, { keyPath })

      for (const { name, key, options } of indexes) {
        objectStore.createIndex(name, key, options)
      }
    }
  }
}
