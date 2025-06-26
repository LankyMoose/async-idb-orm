export { idb }
export { Collection } from "./builders/collection.js"
export { Relations } from "./builders/relations.js"
export { View } from "./builders/view.js"
export type * from "./types"

import { AsyncIDB } from "./idb.js"
import type {
  AsyncIDBInstance,
  CollectionSchema,
  AsyncIDBConfig,
  RelationsSchema,
  ViewSchema,
} from "./types"

/**
 * Creates a new AsyncIDB instance
 * @template {CollectionSchema} T
 * @template {RelationsSchema} R
 * @template {ViewSchema} V
 * @param {string} name
 * @param {AsyncIDBConfig<T, R, V>} config
 * @returns {AsyncIDBInstance<T, R, V>}
 */
function idb<T extends CollectionSchema, R extends RelationsSchema = {}, V extends ViewSchema = {}>(
  name: string,
  config: AsyncIDBConfig<T, R, V>
): AsyncIDBInstance<T, R, V> {
  if (isNaN(config.version) || Math.floor(config.version) !== config.version)
    throw new Error("[async-idb-orm]: Version must be an integer with no decimal places")

  const db = new AsyncIDB<T, R, V>(name, config)

  const getInstance: AsyncIDBInstance<T, R, V>["getInstance"] = () => {
    return new Promise((res) => db.getInstance(res))
  }

  return {
    collections: db.stores,
    transaction: db.transaction.bind(db),
    views: db.views,
    getInstance,
  }
}
