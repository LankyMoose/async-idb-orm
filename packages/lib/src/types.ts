import type { AsyncIDBStore } from "./idbStore"
import type { Collection, $COLLECTION_INTERNAL } from "./collection"
import type { Relations } from "./relations"

export type AsyncIDBConfig<T extends CollectionSchema, R extends RelationsShema> = {
  /**
   * Collection schema - `Record<string, Collection>`
   * @see {@link Collection}
   */
  schema: T
  /**
   * Relations schema - `Record<string, Relations>`
   * @see {@link Relations}
   */
  relations: R
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
  onUpgrade?: OnDBUpgradeCallback<T, R>

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

export type IDBTransactionCallback<T extends CollectionSchema, R extends RelationsShema> = (
  ctx: AsyncIDBInstance<T, R>["collections"],
  tx: IDBTransaction
) => unknown

export type IDBTransactionFunction<T extends CollectionSchema, R extends RelationsShema> = <
  CB extends IDBTransactionCallback<T, R>
>(
  callback: CB,
  options?: TransactionOptions
) => Promise<ReturnType<CB>>

export type OnDBUpgradeCallbackContext<T extends CollectionSchema, R extends RelationsShema> = {
  db: IDBDatabase
  collections: {
    [key in keyof T]: AsyncIDBStore<T[key], R>
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

export type OnDBUpgradeCallback<T extends CollectionSchema, R extends RelationsShema> = (
  ctx: OnDBUpgradeCallbackContext<T, R>,
  event: IDBVersionChangeEvent
) => Promise<void>

export type AsyncIDBInstance<T extends CollectionSchema, R extends RelationsShema> = {
  collections: {
    [key in keyof T]: AsyncIDBStore<T[key], R>
  }
  transaction: IDBTransactionFunction<T, R>
  getInstance: () => Promise<IDBDatabase>
}

export type DBInstanceCallback = (db: IDBDatabase) => any

type NonEmptyArray = [any, ...any[]]

export type RelationsShema = {
  [key: string]: Relations<any, any, any>
}

export type AnyCollection = Collection<any, any, any, any, any>

export type CollectionSchema = {
  [key: string]: AnyCollection
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
export type CollectionEventCallback<T extends AnyCollection, U extends CollectionEvent> = (
  data: U extends "clear" ? null : CollectionRecord<T>
) => void

export type CollectionIndexName<T extends AnyCollection> = T["indexes"][number]["name"]
export type CollectionRecord<T extends AnyCollection> = T[typeof $COLLECTION_INTERNAL]["record"]
export type CollectionDTO<T extends AnyCollection> = T[typeof $COLLECTION_INTERNAL]["dto"]

export type CollectionKeyPathType<
  T extends AnyCollection,
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

// Relations API types - improved version with proper type inference
export type RelationWithOptions<R extends RelationsShema> = {
  limit?: number
  where?: (record: any) => boolean
  with?: Record<string, boolean | RelationWithOptions<R>> // for nested relations
}

export type FindOptions<R extends RelationsShema = any> = {
  with?: Record<string, boolean | RelationWithOptions<R>>
}

// Extract all relation names from the relations schema
type ExtractAllRelationNames<R extends RelationsShema> = {
  [K in keyof R]: R[K] extends Relations<any, any, infer RelMap> ? keyof RelMap : never
}[keyof R]

// Find the relation definition for a given relation name
type FindRelationForName<R extends RelationsShema, RelationName extends string> = {
  [K in keyof R]: R[K] extends Relations<any, infer To, infer RelMap>
    ? RelationName extends keyof RelMap
      ? RelMap[RelationName] extends { type: infer Type }
        ? Type extends "one-to-one"
          ? CollectionRecord<To> | null
          : Type extends "one-to-many"
          ? CollectionRecord<To>[]
          : never
        : never
      : never
    : never
}[keyof R]

// Map relation names in 'with' options to their types
type MapRelationsToTypes<R extends RelationsShema, WithOptions extends Record<string, any>> = {
  [K in keyof WithOptions]: K extends string
    ? FindRelationForName<R, K> extends never
      ? any // fallback for unknown relations
      : FindRelationForName<R, K>
    : never
}

// Main result type with proper relation inference
export type RelationResult<
  T extends AnyCollection,
  R extends RelationsShema,
  Options extends FindOptions<R>
> = Options extends { with: infer With }
  ? With extends Record<string, any>
    ? CollectionRecord<T> & MapRelationsToTypes<R, With>
    : CollectionRecord<T>
  : CollectionRecord<T>

// Legacy types for backward compatibility
export type RelationsWith<R extends RelationsShema, _CollectionName extends string> = Record<
  string,
  boolean | RelationWithOptions<R>
>
export type RelationsWithOptions<
  R extends RelationsShema,
  _CollectionName extends string
> = RelationWithOptions<R>
