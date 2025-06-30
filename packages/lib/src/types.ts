import type { AsyncIDBStore } from "./AsyncIDBStore"
import type { Collection, $COLLECTION_INTERNAL } from "./builders/Collection"
import type { Relations } from "./builders/Relations"
import type { Selector } from "./builders/Selector"
import type { AsyncIDBSelector, InferSelectorReturn } from "./AsyncIDBSelector"

type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

export type AsyncIDBConfig<
  T extends CollectionSchema,
  R extends RelationsSchema,
  S extends SelectorSchema
> = {
  /**
   * Collection schema - `Record<string, Collection>`
   * @see {@link Collection}
   */
  schema: T
  /**
   * Relations schema - `Record<string, Relations>`
   * @see {@link Relations}
   */
  relations?: R

  /**
   * Views schema - `Record<string, View>`
   * @see {@link View}
   */
  selectors?: S
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

export type IDBTransactionCallback<
  T extends CollectionSchema,
  R extends RelationsSchema,
  S extends SelectorSchema
> = (ctx: AsyncIDBInstance<T, R, S>["collections"], tx: IDBTransaction) => unknown

export type IDBTransactionFunction<
  T extends CollectionSchema,
  R extends RelationsSchema,
  S extends SelectorSchema
> = <CB extends IDBTransactionCallback<T, R, S>>(
  callback: CB,
  options?: TransactionOptions
) => Promise<ReturnType<CB>>

export type OnDBUpgradeCallbackContext<T extends CollectionSchema, R extends RelationsSchema> = {
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

export type OnDBUpgradeCallback<T extends CollectionSchema, R extends RelationsSchema> = (
  ctx: OnDBUpgradeCallbackContext<T, R>,
  event: IDBVersionChangeEvent
) => Promise<void>

export type AsyncIDBInstance<
  T extends CollectionSchema,
  R extends RelationsSchema,
  S extends SelectorSchema
> = {
  collections: {
    [key in keyof T]: AsyncIDBStore<T[key], R>
  }
  selectors: {
    [key in keyof S]: AsyncIDBSelector<InferSelectorReturn<S[key]>>
  }
  transaction: IDBTransactionFunction<T, R, S>
  getInstance: () => Promise<IDBDatabase>
}

export type DBInstanceCallback = (db: IDBDatabase) => any

type NonEmptyArray = [any, ...any[]]

export type RelationsSchema = {
  [key: string]: Relations<any, any, any>
}

export type AnyCollection = Collection<any, any, any, any, any>

export type CollectionSchema = {
  [key: string]: AnyCollection
}

export type SelectorSchema = {
  [key: string]: Selector<any, any>
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

// Relations API types - improved version with recursive nested relations support

// Extract the target collection for a specific relation name from a source collection
type GetTargetCollectionForRelation<
  R extends RelationsSchema,
  SourceCollection extends AnyCollection,
  RelationName extends string
> = {
  [K in keyof R]: R[K] extends Relations<infer From, infer To, infer RelMap>
    ? From extends SourceCollection
      ? RelationName extends keyof RelMap
        ? To
        : never
      : never
    : never
}[keyof R]

// Recursive relation options that are aware of the target collection
type RelationWithOptionsForCollection<R extends RelationsSchema, T extends AnyCollection> = {
  limit?: number
  where?: (record: CollectionRecord<T>) => boolean
  with?: T extends AnyCollection
    ? {
        [K in ValidRelationNamesForCollection<R, T> & string]?:
          | boolean
          | RelationWithOptionsForCollection<R, GetTargetCollectionForRelation<R, T, K>>
      }
    : Record<string, boolean | RelationWithOptionsForCollection<R, any>>
}

// Main RelationWithOptions type (for backward compatibility)
export type RelationWithOptions<R extends RelationsSchema> = RelationWithOptionsForCollection<
  R,
  any
>

// Extract valid relation names for a specific collection
// Only include relations where the current collection is the 'From' collection
type ValidRelationNamesForCollection<
  R extends RelationsSchema,
  CurrentCollection extends AnyCollection
> = {
  [K in keyof R]: R[K] extends Relations<infer From, any, infer RelMap>
    ? From extends CurrentCollection
      ? keyof RelMap
      : never
    : never
}[keyof R]

// Improved FindOptions that constrains relation names to valid ones for the collection
export type FindOptions<R extends RelationsSchema = any, T extends AnyCollection = any> = {
  with?: T extends AnyCollection
    ? {
        [K in ValidRelationNamesForCollection<R, T> & string]?:
          | boolean
          | RelationWithOptionsForCollection<R, GetTargetCollectionForRelation<R, T, K>>
      }
    : Record<string, boolean | RelationWithOptions<R>>
}

// Find the relation definition for a given relation name
type FindRelationForName<R extends RelationsSchema, RelationName extends string> = {
  [K in keyof R]: R[K] extends Relations<any, infer To, infer RelMap>
    ? RelationName extends keyof RelMap
      ? RelMap[RelationName] extends { type: infer Type }
        ? Type extends "one-to-one"
          ? CollectionRecord<To>
          : Type extends "one-to-many"
          ? CollectionRecord<To>[]
          : never
        : never
      : never
    : never
}[keyof R]

// Helper type to recursively process nested with options
type ProcessNestedRelations<
  R extends RelationsSchema,
  WithOptions extends Record<string, any>,
  RelationName extends string
> = WithOptions[RelationName] extends { with: infer NestedWith }
  ? NestedWith extends Record<string, any>
    ? FindRelationForName<R, RelationName> extends Array<infer ArrayElement>
      ? (ArrayElement & Prettify<MapRelationsToTypes<R, NestedWith>>)[]
      : FindRelationForName<R, RelationName> extends infer SingleElement
      ? SingleElement extends null | undefined
        ? (SingleElement & Prettify<MapRelationsToTypes<R, NestedWith>>) | null
        : SingleElement & Prettify<MapRelationsToTypes<R, NestedWith>>
      : never
    : FindRelationForName<R, RelationName>
  : FindRelationForName<R, RelationName>

// Enhanced MapRelationsToTypes that handles nested relations recursively
type MapRelationsToTypes<R extends RelationsSchema, WithOptions extends Record<string, any>> = {
  [K in keyof WithOptions & string]: ProcessNestedRelations<R, WithOptions, K> extends Array<
    infer T
  >
    ? T[]
    : ProcessNestedRelations<R, WithOptions, K> | null
}

// Main result type with proper relation inference
export type RelationResult<
  T extends AnyCollection,
  R extends RelationsSchema,
  Options extends FindOptions<R, T>
> = Options extends { with: infer With }
  ? With extends Record<string, any>
    ? CollectionRecord<T> & Prettify<MapRelationsToTypes<R, With>>
    : CollectionRecord<T>
  : CollectionRecord<T>

// Legacy types for backward compatibility
export type RelationsWith<R extends RelationsSchema, _CollectionName extends string> = Record<
  string,
  boolean | RelationWithOptions<R>
>
export type RelationsWithOptions<
  R extends RelationsSchema,
  _CollectionName extends string
> = RelationWithOptions<R>

export type TaskContext = {
  db: IDBDatabase
  tx: IDBTransaction
  onDidCommit: (() => void)[]
  onWillCommit: Map<string, () => Promise<any>>
}
