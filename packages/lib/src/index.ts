export { idb }
export { Collection } from "./builders/Collection.js"
export { Relations } from "./builders/Relations.js"
export { Selector } from "./builders/Selector.js"
export { range } from "./range.js"
export type * from "./types"

import { AsyncIDB } from "./AsyncIDB.js"
import { AsyncIDBSelector } from "./AsyncIDBSelector.js"
import type {
  AsyncIDBInstance,
  CollectionSchema,
  AsyncIDBConfig,
  RelationsSchema,
  SelectorSchema,
} from "./types"

if (typeof indexedDB === "undefined") {
  console.error(
    "[async-idb-orm]: IndexedDB support was not detected. This module can only be used in an up-to-date browser environment."
  )
}

/**
 * Creates a new AsyncIDB instance
 * @template {CollectionSchema} T
 * @template {RelationsSchema} R
 * @template {SelectorSchema} S
 * @param {string} name
 * @param {AsyncIDBConfig<T, R, S>} config
 * @returns {AsyncIDBInstance<T, R, S>}
 *
 * @example
 * ```ts
 * import { idb } from "async-idb-orm"
 * import * as schema from "./schema"
 * import * as relations from "./relations"
 * import * as selectors from "./selectors"
 *
 * const db = idb("my-db", {
 *   schema: schema,
 *   relations: relations,
 *   selectors: selectors,
 *   version: 1,
 * })
 * ```
 */
function idb<
  T extends CollectionSchema,
  R extends RelationsSchema = {},
  S extends SelectorSchema = {}
>(name: string, config: AsyncIDBConfig<T, R, S>): AsyncIDBInstance<T, R, S> {
  if (isNaN(config.version) || Math.floor(config.version) !== config.version)
    throw new Error("[async-idb-orm]: Version must be an integer with no decimal places")

  const db = new AsyncIDB<T, R, S>(name, config)

  const getInstance: AsyncIDBInstance<T, R, S>["getInstance"] = () => {
    return new Promise((res) => db.getInstance(res))
  }

  const select: AsyncIDBInstance<T, R, S>["select"] = (cb) => {
    const selector = new AsyncIDBSelector(db as any, cb as any)
    return Object.assign(selector, { dispose: () => AsyncIDBSelector.dispose(selector) }) as any
  }

  return {
    collections: db.stores,
    transaction: db.transaction.bind(db),
    selectors: db.selectors,
    dispose: db.dispose.bind(db),
    getInstance,
    select,
  }
}
