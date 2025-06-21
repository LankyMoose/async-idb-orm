export { idb }
export { Collection } from "./collection.js"
export { Relations } from "./relations.js"
export type * from "./types"

import { AsyncIDB } from "./idb.js"
import type { AsyncIDBInstance, CollectionSchema, AsyncIDBConfig, RelationsShema } from "./types"

/**
 * Creates a new AsyncIDB instance
 * @template {CollectionSchema} T
 * @template {RelationsShema} R
 * @param {string} name
 * @param {AsyncIDBConfig<T, R>} config
 * @returns {AsyncIDBInstance<T, R>}
 */
function idb<T extends CollectionSchema, R extends RelationsShema = {}>(
  name: string,
  config: AsyncIDBConfig<T, R>
): AsyncIDBInstance<T, R> {
  if (isNaN(config.version) || Math.floor(config.version) !== config.version)
    throw new Error("[async-idb-orm]: Version must be an integer with no decimal places")

  const db = new AsyncIDB(name, config)

  const getInstance: AsyncIDBInstance<T, R>["getInstance"] = () => {
    return new Promise((res) => db.getInstance(res))
  }

  return {
    collections: db.stores,
    transaction: db.transaction.bind(db),
    getInstance,
  }
}
