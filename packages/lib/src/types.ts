import type { AsyncIDBStore } from "./idbStore"
import type { Collection, $COLLECTION_INTERNAL } from "./collection"

export type AsyncIDBConfig<T extends CollectionSchema> = {
  /**
   * Collection schema - `Record<string, Collection>`
   * @see {@link Collection}
   */
  schema: T
  /**
   * Database version - increment this to trigger an [upgradeneeded](https://developer.mozilla.org/en-US/docs/Web/API/IDBOpenDBRequest/upgradeneeded_event) event
   */
  version: number
  /**
   * Receives errors produced during initialization
   * @default console.error
   */
  onError?: typeof console.error
  /**
   * Called when the database is opened successfully. This can be called upon initial `idb` call, or after a block resolution.
   * @param {IDBDatabase} db
   */
  onOpen?: (db: IDBDatabase) => void
  /**
   * Provides a callback to migrate the database from one version to another
   */
  onUpgrade?: OnDBUpgradeCallback<T>

  onBeforeReinit?: (oldVersion: number, newVersion: number) => void
}

export type SerializationConfig<RecordType extends Record<string, any>, T> = {
  write: (data: RecordType) => T
  read: (data: T) => RecordType
}

export type TransactionOptions = IDBTransactionOptions & {
  /**
   * https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/durability
   */
  durability?: IDBTransactionDurability
}

export type IDBTransactionCallback<T extends CollectionSchema> = (
  ctx: AsyncIDBInstance<T>["collections"],
  tx: IDBTransaction
) => unknown

export type IDBTransactionFunction<T extends CollectionSchema> = <
  CB extends IDBTransactionCallback<T>
>(
  callback: CB,
  options?: TransactionOptions
) => Promise<ReturnType<CB>>

export type OnDBUpgradeCallbackContext<T extends CollectionSchema> = {
  db: IDBDatabase
  collections: {
    [key in keyof T]: AsyncIDBStore<T[key]>
  }
  /**
   * Deletes a store from IndexedDB
   * @param {keyof T & string} name
   * @returns {void}
   */
  deleteStore: (name: keyof T & string) => void
  /**
   * Creates a store in IndexedDB and its indexes, if any
   * @param {keyof T & string} name
   * @returns {IDBObjectStore}
   */
  createStore: (name: keyof T & string) => IDBObjectStore
}

export type OnDBUpgradeCallback<T extends CollectionSchema> = (
  ctx: OnDBUpgradeCallbackContext<T>,
  event: IDBVersionChangeEvent
) => Promise<void>

export type AsyncIDBInstance<T extends CollectionSchema> = {
  collections: {
    [key in keyof T]: AsyncIDBStore<T[key]>
  }
  transaction: IDBTransactionFunction<T>
  getInstance: () => Promise<IDBDatabase>
}

export type DBInstanceCallback = (db: IDBDatabase) => any

type NonEmptyArray = [any, ...any[]]

export type CollectionSchema = {
  [key: string]: Collection<any, any, any, any>
}

export type ActiveRecord<T> = T & ActiveRecordMethods<T>
export type ActiveRecordMethods<T> = {
  save(): Promise<ActiveRecord<T>>
  delete(): Promise<void>
}

export type TransactionContext = {
  db: IDBDatabase
  objectStore: IDBObjectStore
  tx: IDBTransaction
}
export type CollectionEvent = "write" | "delete" | "write|delete"
export type CollectionEventCallback<T extends Collection<any, any, any, any>> = (
  data: CollectionRecord<T>
) => void

export type CollectionIndexName<T extends Collection<any, any, any, any>> =
  T["indexes"][number]["name"]
export type CollectionRecord<T extends Collection<any, any, any, any>> =
  T[typeof $COLLECTION_INTERNAL]["record"]
export type CollectionDTO<T extends Collection<any, any, any, any>> =
  T[typeof $COLLECTION_INTERNAL]["dto"]

export type CollectionKeyPathType<
  T extends Collection<any, any, any, any>,
  KeyPath = T["keyPath"]
> = KeyPath extends keyof T[typeof $COLLECTION_INTERNAL]["record"]
  ? T[typeof $COLLECTION_INTERNAL]["record"][KeyPath]
  : // handle case where keyPath is an array
  KeyPath extends NonEmptyArray
  ? ObjectValues<T[typeof $COLLECTION_INTERNAL]["record"], KeyPath>
  : never

export type CollectionIndex<RecordType extends Record<string, any>> = {
  name: string
  key: RecordKeyPath<RecordType>
  options?: IDBIndexParameters
}

export type RecordKeyPath<RecordType extends Record<string, any>> =
  | (keyof RecordType & string)
  | ((keyof RecordType & string)[] & NonEmptyArray)

type ObjectValues<T extends Record<string, any>, K extends Array<keyof T>> = K extends [
  infer First,
  ...infer Rest
]
  ? First extends keyof T
    ? [T[First], ...ObjectValues<T, Rest extends Array<keyof T> ? Rest : []>]
    : []
  : []
