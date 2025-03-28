export { idb }
export { Collection } from "./collection.js"
export type * from "./types"

import { AsyncIDB } from "./idb.js"
import { AsyncIDBStore } from "./idbStore"
import type { AsyncIDBInstance, CollectionSchema } from "./types"

/**
 * Creates a new AsyncIDB instance
 * @param {string} name The name of the database
 * @param {CollectionSchema} schema Collection schema - `Record<string, Collection>`
 * @param {Number} version - Database version - increment this to trigger an [upgradeneeded](https://developer.mozilla.org/en-US/docs/Web/API/IDBOpenDBRequest/upgradeneeded_event) event
 * @param {typeof console.error} errHandler - Error handler - should accept multiple arguments as per `console.error`
 * @returns {AsyncIDBInstance<T>}
 */
function idb<T extends CollectionSchema>(
  name: string,
  schema: T,
  version = 1,
  errHandler = console.error
): AsyncIDBInstance<T> {
  const db = new AsyncIDB(name, schema, version, errHandler)
  const collections = db.stores as AsyncIDBInstance<T>["collections"]

  const transaction: AsyncIDBInstance<T>["transaction"] = async (callback, options) => {
    const idbInstance = await new Promise<IDBDatabase>((res) => db.getInstance(res))
    const tx = idbInstance.transaction(Object.keys(schema), "readwrite", options)

    const eventQueue: Function[] = []
    const txCollections = Object.keys(collections).reduce((acc, key) => {
      return {
        ...acc,
        [key]: AsyncIDBStore.cloneForTransaction(tx, collections[key], eventQueue),
      }
    }, {} as AsyncIDBInstance<T>["collections"])

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

  const getInstance: AsyncIDBInstance<T>["getInstance"] = () => {
    return new Promise((res) => db.getInstance(res))
  }

  return { collections, transaction, getInstance }
}
