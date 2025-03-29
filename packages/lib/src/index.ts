export { idb }
export { Collection } from "./collection.js"
export type * from "./types"

import { AsyncIDB } from "./idb.js"
import type { AsyncIDBInstance, CollectionSchema, AsyncIDBConfig } from "./types"

/**
 * Creates a new AsyncIDB instance
 * @template {CollectionSchema} T
 * @param {string} name
 * @param {AsyncIDBConfig<T>} config
 * @returns {AsyncIDBInstance<T>}
 */
function idb<T extends CollectionSchema>(
  name: string,
  config: AsyncIDBConfig<T>
): AsyncIDBInstance<T> {
  if (isNaN(config.version) || Math.floor(config.version) !== config.version)
    throw new Error("[async-idb-orm]: Version must be an integer with no decimal places")

  const db = new AsyncIDB(name, config)

  const getInstance: AsyncIDBInstance<T>["getInstance"] = () => {
    return new Promise((res) => db.getInstance(res))
  }

  return {
    collections: db.stores,
    transaction: db.transaction.bind(db),
    getInstance,
  }
}
