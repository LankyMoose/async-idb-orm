import { AsyncIDB } from "idb"
import { AsyncIDBStore } from "./idbStore"
import type { RecordKeyPath, CollectionIndex } from "./types"

const CollectionBuilderSentinel = Symbol()

export const $COLLECTION_INTERNAL = Symbol.for("collection.internal")

const ERR_KEYPATH_MISSING = 0
const ERR_KEYPATH_EMPTY = 1
const ERR_KEYPATH_DUPLICATE = 2

type KeyPathInvalidationEventArgs =
  | [typeof ERR_KEYPATH_MISSING, null]
  | [typeof ERR_KEYPATH_EMPTY, null]
  | [typeof ERR_KEYPATH_DUPLICATE, string]

export type CollectionTransformers<
  RecordType extends Record<string, any>,
  DTO extends Record<string, any>
> = {
  /**
   * @optional
   * @description Transformer for creating the record
   * @param {DTO} data
   * @returns {RecordType}
   */
  create?: (data: DTO) => RecordType
  /**
   * @optional
   * @description Transformer for updating the record
   * @param {RecordType} data
   * @returns {RecordType}
   */
  update?: (data: RecordType) => RecordType
}

export type CollectionConflictMode = "delete" | "ignore"

type ForeignKeyOnDelete = "cascade" | "restrict" | "no action" | "set null"
type CollectionForeignKeyConfig<RecordType extends Record<string, any>> = {
  field: keyof RecordType & string
  collection: Collection<any, any, any, any>
  onDelete: ForeignKeyOnDelete
}

export class Collection<
  RecordType extends Record<string, any>,
  DTO extends Record<string, any> = RecordType,
  KeyPath extends keyof RecordType & string = keyof RecordType & string,
  Indexes extends CollectionIndex<RecordType>[] = never
> {
  [$COLLECTION_INTERNAL]: {
    record: RecordType
    dto: DTO
  }
  keyPath: KeyPath = undefined as any as KeyPath
  indexes: Indexes = [] as any as Indexes
  foreignKeys: CollectionForeignKeyConfig<RecordType>[] = []
  transformers: {
    create?: (data: DTO) => RecordType
    update?: (data: RecordType) => RecordType
  } = {}
  creationConflictMode: CollectionConflictMode = "ignore"
  onCreationConflict?: () => void

  constructor(key: symbol) {
    if (key !== CollectionBuilderSentinel)
      throw new Error("Cannot call CollectionBuilder directly - use Collection.create<T>()")

    this[$COLLECTION_INTERNAL] = null!
  }

  static create<
    RecordType extends Record<string, any>,
    DTO extends Record<string, any> = any
  >(): Collection<RecordType, DTO> {
    return new Collection<RecordType, DTO>(CollectionBuilderSentinel)
  }

  static validate(
    db: AsyncIDB,
    collection: Collection<any, any, any, any>,
    logErr: (err: any) => void
  ) {
    this.validateKeyPath(collection.keyPath, (err, data) =>
      err === ERR_KEYPATH_MISSING
        ? logErr(`Missing keyPath`)
        : err === ERR_KEYPATH_EMPTY
        ? logErr(`Invalid - keyPath cannot be empty array`)
        : logErr(`Duplicated keyPath key "${data}"`)
    )

    const seenIndexNames = new Set<string>()
    const dupeIndexNames = new Set<string>()
    for (const index of collection.indexes as CollectionIndex<any>[]) {
      this.validateKeyPath(index.keyPath, (err, data) =>
        err === ERR_KEYPATH_MISSING
          ? logErr(`Missing keyPath for index "${index.name}"`)
          : err === ERR_KEYPATH_EMPTY
          ? logErr(`Invalid keyPath for index "${index.name}"`)
          : logErr(`Duplicated keyPath key "${data}" for index "${index.name}"`)
      )

      if (seenIndexNames.has(index.name)) dupeIndexNames.add(index.name)
      seenIndexNames.add(index.name)
    }

    if (dupeIndexNames.size) {
      logErr(`Duplicate index names: ${Array.from(dupeIndexNames).join(", ")}`)
    }

    for (const fkConfig of collection.foreignKeys) {
      const match = Object.entries(db.stores).find(
        ([, s]) => AsyncIDBStore.getCollection(s) === fkConfig.collection
      )
      if (!match) {
        logErr("Foreign key references a non-existent collection")
      }
    }
  }

  private static validateKeyPath(
    keyPath: any,
    handler: (...args: KeyPathInvalidationEventArgs) => void
  ) {
    if (!keyPath) return handler(ERR_KEYPATH_MISSING, null)
    if (Array.isArray(keyPath) && keyPath.length === 0) return handler(ERR_KEYPATH_EMPTY, null)
    const seenKeys = new Set<string>()
    for (const key of keyPath) {
      if (seenKeys.has(key)) handler(ERR_KEYPATH_DUPLICATE, key)
      seenKeys.add(key)
    }
  }

  /**
   * Sets the key for this collection
   */
  withKeyPath<const Key extends KeyPath>(keyPath: Key): Collection<RecordType, DTO, Key, Indexes> {
    this.keyPath = keyPath as any
    return this as any as Collection<RecordType, DTO, Key, Indexes>
  }

  /**
   * Sets the indexes for this collection
   * @see https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/createIndex
   */
  withIndexes<const Indexes extends CollectionIndex<RecordType>[]>(
    indexes: Indexes
  ): Collection<RecordType, DTO, KeyPath, Indexes> {
    this.indexes.push(...indexes)
    return this as any as Collection<RecordType, DTO, KeyPath, Indexes>
  }

  withForeignKeys(
    foreignKeys: {
      field: keyof RecordType & string
      collection: Collection<any, any, any, any>
      onDelete: ForeignKeyOnDelete
    }[]
  ): this {
    this.foreignKeys.push(...foreignKeys)
    return this
  }

  /**
   * Sets the transformers for this collection
   * @param {CollectionTransformers<RecordType, DTO>} transformers
   * @returns {this}
   */
  withTransformers(transformers: CollectionTransformers<RecordType, DTO>): this {
    this.transformers = transformers
    return this
  }

  /**
   * Sets the conflict mode for this collection. Setting this to "delete" will delete the collection if it already exists during an [upgradeneeded](https://developer.mozilla.org/en-US/docs/Web/API/IDBOpenDBRequest/upgradeneeded_event) event.
   * @param {CollectionConflictMode} mode The conflict mode
   * @param {() => void} [onConflict] The callback that will be called when a conflict is detected
   * @default "ignore"
   * @returns {this}
   */
  withCreationConflictMode(mode: CollectionConflictMode, onConflict?: () => void): this {
    this.creationConflictMode = mode
    this.onCreationConflict = onConflict
    return this
  }
}
