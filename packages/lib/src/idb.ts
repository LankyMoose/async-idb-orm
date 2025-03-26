import type { CollectionSchema, DBTaskFn } from "./types"

import { Collection } from "./collection.js"
import { AsyncIDBStore } from "./idbStore.js"

/**
 * @private
 * Internal usage only. Do not use directly.
 */
export class AsyncIDB {
  db: IDBDatabase | null = null
  stores: { [key: string]: AsyncIDBStore<any> } = {}
  taskQueue: DBTaskFn[] = []
  constructor(
    private name: string,
    schema: CollectionSchema,
    version: number,
    errHandler: typeof console.error
  ) {
    let schemaValid = true
    for (const [name, collection] of Object.entries(schema)) {
      Collection.validate(
        collection,
        (err) => (
          (schemaValid = false),
          errHandler(`[async-idb-orm]: error encountered with collection "${name}"`, err)
        )
      )
      this.stores[name] = new AsyncIDBStore(this, collection, name)
    }
    if (!schemaValid) return
    const request = indexedDB.open(this.name, version)
    request.onerror = errHandler
    request.onupgradeneeded = () => this.initializeStores(request.result)
    request.onsuccess = () => {
      this.db = request.result
      while (this.taskQueue.length) {
        this.taskQueue.shift()!(this.db)
      }
    }
  }

  queueTask(taskFn: DBTaskFn) {
    if (!this.db) {
      return this.taskQueue.push(taskFn)
    }
    taskFn(this.db)
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
