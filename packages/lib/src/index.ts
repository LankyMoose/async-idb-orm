export { Collection } from "./collection.js"
export type * from "./types"

import { AsyncIDB } from "./idb.js"
import type { AsyncIDBStore } from "./idbStore"
import type { CollectionSchema } from "./types"

export type AsyncIDBInstance<T extends CollectionSchema> = {
  [key in keyof T]: AsyncIDBStore<T[key]>
} & {
  instance: IDBDatabase | null
}

/**
 *
 * @param {string} name The name of the database
 * @param {CollectionSchema} schema Collection schema - `Record<string, Collection>`
 * @param {Number} version - Database version - increment this to trigger an [upgradeneeded](https://developer.mozilla.org/en-US/docs/Web/API/IDBOpenDBRequest/upgradeneeded_event) event
 * @param {typeof console.error} errHandler - Error handler - should accept multiple arguments as per `console.error`
 * @returns {AsyncIDBInstance<T>}
 */
export function idb<T extends CollectionSchema>(
  name: string,
  schema: T,
  version = 1,
  /**
   * @description Error handler for AsyncIDB instance creation.
   * @default {console.error}
   */
  errHandler = console.error
): AsyncIDBInstance<T> {
  const db = new AsyncIDB(name, schema, version, errHandler)
  return Object.entries(schema).reduce(
    (acc, [key]) => {
      return {
        ...acc,
        [key]: db.stores[key],
      }
    },
    {
      get instance() {
        return db.db
      },
    } as AsyncIDBInstance<T>
  )
}
