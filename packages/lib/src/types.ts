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
   */
  onOpen?: (db: IDBDatabase) => void
  /**
   * Provides a callback to migrate the database from one version to another
   */
  onUpgrade?: OnDBUpgradeCallback<T>

  /**
   * Provides a callback to hande the outcome of a **block resolution**. Useful for doing a reload of the page in case the tab is too old.
   *
   * @example
   * ```ts
   * onBeforeReinit: (oldVersion, newVersion) => {
   *   // let's imagine the latest tab has set a "breakingChangesVersion" value, which indicates that any old tabs using a version less than this should reload.
   *   if (oldVersion < parseInt(localStorage.getItem("breakingChangesVersion") ?? "0")) {
   *     window.location.reload()
   *   }
   * }
   * ```
   * @param {number} oldVersion
   * @param {number} newVersion
   */
  onBeforeReinit?: (oldVersion: number, newVersion: number) => void

  /**
   * By default, collection events are relayed to other tabs. To disable this, set `relayEvents` to `false`
   */
  relayEvents?: boolean
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
   */
  deleteStore: (name: keyof T & string) => void
  /**
   * Creates a store in IndexedDB and its indexes, if any
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
  [key: string]: Collection<any, any, any, any, any>
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
export type CollectionEvent = "write" | "delete" | "write|delete" | "clear"
export type CollectionEventCallback<
  T extends Collection<any, any, any, any, any>,
  U extends CollectionEvent
> = (data: U extends "clear" ? null : CollectionRecord<T>) => void

export type CollectionIndexName<T extends Collection<any, any, any, any, any>> =
  T["indexes"][number]["name"]
export type CollectionRecord<T extends Collection<any, any, any, any, any>> =
  T[typeof $COLLECTION_INTERNAL]["record"]
export type CollectionDTO<T extends Collection<any, any, any, any, any>> =
  T[typeof $COLLECTION_INTERNAL]["dto"]

export type CollectionKeyPathType<
  T extends Collection<any, any, any, any, any>,
  KeyPath = T["keyPath"]
> = KeyPath extends keyof T[typeof $COLLECTION_INTERNAL]["record"]
  ? T[typeof $COLLECTION_INTERNAL]["record"][KeyPath]
  : never

export type CollectionIndex<RecordType extends Record<string, any>> = {
  name: string
  key: RecordKeyPath<RecordType>
  options?: IDBIndexParameters
}

export enum CollectionIDMode {
  UserAssigned = "userAssigned",
  AutoIncrement = "autoIncrement",
}

export type RecordKeyPath<RecordType extends Record<string, any>> =
  | (keyof RecordType & string)
  | ((keyof RecordType & string)[] & NonEmptyArray)
