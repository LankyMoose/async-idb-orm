export { Collection } from "./collection.js"
export type * from "./types"

import { AsyncIDB } from "./idb.js"
import type { AsyncIDBStore } from "./idbStore"
import type { CollectionSchema } from "./types"

const $SYMBOL_INTERNAL = Symbol.for("async-idb-orm.internal")

export type AsyncIDBInstance<T extends CollectionSchema> = {
  [key in keyof T]: AsyncIDBStore<T[key]>
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
      get [$SYMBOL_INTERNAL]() {
        return db.db
      },
    } as AsyncIDBInstance<T>
  )
}

/**
 * Gets the IDBDatabase instance from an AsyncIDB instance
 * @param {AsyncIDBInstance<CollectionSchema>} db
 * @returns {IDBDatabase | null}
 */
export function getIDBDatabase<T extends CollectionSchema>(
  db: AsyncIDBInstance<T>
): IDBDatabase | null {
  // @ts-expect-error this is (hopefully) fine. we don't explicitly type this property because doing so causes typescript to fail on dynamic property access type inferences
  return db[$SYMBOL_INTERNAL]
}
