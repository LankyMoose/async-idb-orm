import type { CollectionSchema, DBInstanceCallback } from "./types"

import { Collection } from "./collection.js"
import { AsyncIDBStore } from "./idbStore.js"

/**
 * @private
 * Internal usage only. Do not use directly.
 */
export class AsyncIDB {
  db: IDBDatabase | null = null
  stores: { [key: string]: AsyncIDBStore<any> }
  instanceCallbacks: DBInstanceCallback[] = []
  constructor(
    private name: string,
    schema: CollectionSchema,
    version: number,
    errHandler: typeof console.error
  ) {
    this.stores = Object.keys(schema).reduce(
      (acc, name) => ({
        ...acc,
        [name]: new AsyncIDBStore(this, schema[name], name),
      }),
      {}
    )

    let schemaValid = true
    for (const [name, collection] of Object.entries(schema)) {
      Collection.validate(
        this,
        collection,
        (err) => (
          (schemaValid = false),
          errHandler(`[async-idb-orm]: error encountered with collection "${name}"`, err)
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

    const request = indexedDB.open(this.name, version)
    request.onerror = errHandler
    request.onupgradeneeded = () => this.initializeStores(request.result)
    request.onsuccess = () => {
      this.db = request.result
      while (this.instanceCallbacks.length) {
        this.instanceCallbacks.shift()!(this.db)
      }
    }
  }

  getInstance(instanceCallback: DBInstanceCallback): void {
    if (!this.db) {
      this.instanceCallbacks.push(instanceCallback)
      return
    }
    instanceCallback(this.db)
  }

  initializeStores(db: IDBDatabase) {
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

      for (const { name, keyPath, options } of indexes) {
        objectStore.createIndex(name, keyPath, options)
      }
    }
  }
}
