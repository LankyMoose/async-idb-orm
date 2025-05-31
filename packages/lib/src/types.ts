import type { AsyncIDBStore } from "./idbStore"
import type { Collection, $COLLECTION_INTERNAL } from "./collection"
import type { Relations, RelationsDefinition } from "./relations" // Added RelationsDefinition

export type AsyncIDBConfig<T extends CollectionSchema, R extends RelationsSchema> = {
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

export type IDBTransactionCallback<T extends CollectionSchema, R extends RelationsSchema> = (
  ctx: AsyncIDBInstance<T, R>["collections"],
  tx: IDBTransaction
) => unknown

export type IDBTransactionFunction<T extends CollectionSchema, R extends RelationsSchema> = <
  CB extends IDBTransactionCallback<T, R>
>(
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

export type AsyncIDBInstance<T extends CollectionSchema, R extends RelationsSchema> = {
  collections: {
    [key in keyof T]: AsyncIDBStore<T[key], R>
  }
  transaction: IDBTransactionFunction<T, R>
  getInstance: () => Promise<IDBDatabase>
}

export type DBInstanceCallback = (db: IDBDatabase) => any

type NonEmptyArray = [any, ...any[]]

export type CollectionSchema = {
  [key: string]: Collection<any, any, any, any, any>
}
export type RelationsSchema = {
  [key: string]: Relations<any, any, any>
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

// New Helper Types:

// To get a union of all collection names from a CollectionSchema
export type CollectionName<S extends CollectionSchema> = keyof S & string;

// Gets the target collection type from a Relations instance
export type RelationTargetCollection<Rel extends Relations<any, any, any>> = Rel extends Relations<any, infer ToCol, any> ? ToCol : never;

// Gets the RelationsDefinition from a specific relation configuration
export type ResolvedRelation<
  Rel extends Relations<any, any, any>,
  RelName extends keyof Rel['config']
> = Rel['config'][RelName] extends (...args: any[]) => infer R ? R extends RelationsDefinition<any,any> ? R : never : never;

// Determines the type of the related record (single object or array)
export type RelatedRecordType<RelDef extends RelationsDefinition<any, any>> =
  RelDef['type'] extends 'one-to-many'
    ? CollectionRecord<RelDef['toCollection']>[]
    : CollectionRecord<RelDef['toCollection']>;

// Types for `find` method options and result:

// Represents the 'with' clause for find.
// DBRelations is the global RelationsSchema for the database.
// StoreName is the name of the current collection/store.
// This type should list valid relation names originating FROM the StoreName's collection.
export type WithOption<
  DBRelations extends RelationsSchema | undefined,
  StoreCollection extends Collection<any,any,any,any,any>
> = DBRelations extends RelationsSchema ? {
  [RelName in keyof DBRelations as DBRelations[RelName]['fromCollection'] extends StoreCollection ? RelName : never]?: true
} : never;


// Represents the result of a find operation, including related records.
// CurrentCollection is the collection on which find is called.
// CurrentStoreRelations is the specific Relations instance configured for the CurrentCollection's relations (if any).
// WO is the WithOption passed to find.
export type FindResult<
  CurrentCollection extends Collection<any, any, any, any, any>,
  DBRelations extends RelationsSchema | undefined, // Global relations schema
  WO extends WithOption<DBRelations, CurrentCollection> | undefined
> = CollectionRecord<CurrentCollection> & (
  WO extends undefined ? {} :
  DBRelations extends RelationsSchema ? {
    // For each relation name K in WO (that is true)
    [K in keyof WO as WO[K] extends true ? K : never]:
      // K must be a key of DBRelations
      K extends keyof DBRelations ?
        // Get the specific relation configuration
        DBRelations[K] extends Relations<infer FromCol, infer ToCol, infer ConfigK> ?
          // Ensure the 'from' collection matches our current collection
          FromCol extends CurrentCollection ?
            // Get the definition for this specific relation name (K)
            keyof ConfigK extends infer RelNameInConfig ? // This part is tricky, assumes K is directly a key in ConfigK
              RelNameInConfig extends keyof ConfigK ? // Check if RelNameInConfig is a valid key
                ConfigK[RelNameInConfig] extends (...args: any[]) => infer RelDef ?
                  RelDef extends RelationsDefinition<any, infer TargetCol, infer RelType> ?
                    RelType extends 'one-to-many' ? CollectionRecord<TargetCol>[] : CollectionRecord<TargetCol>
                  : never // RelDef is not RelationsDefinition
                : never // ConfigK[RelNameInConfig] is not a function
              : never // RelNameInConfig is not a key of ConfigK (should not happen if K is from WO)
            : never // keyof ConfigK is not inferrable or K is not in it
          : {} // FromCollection does not match CurrentCollection
        : {} // Relation K not found in DBRelations (should not happen)
      : {} // K is not a key of DBRelations (should not happen)
  } : {} // DBRelations is undefined
);
