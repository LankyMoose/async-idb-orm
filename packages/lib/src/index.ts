export { Collection } from "./collection.js"
export type * from "./types"

import { AsyncIDB } from "./idb.js"
import type { AsyncIDBStore } from "./idbStore"
import type { Schema } from "./types"

type AsyncIDBInstance<T extends Schema> = { [key in keyof T]: AsyncIDBStore<T[key]> }

export function idb<T extends Schema>(
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
  return Object.entries(schema).reduce((acc, [key]) => {
    return {
      ...acc,
      [key]: db.stores[key],
    }
  }, {} as any)
}
