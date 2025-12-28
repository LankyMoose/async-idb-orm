import { CollectionIDMode } from "../types.js"
import { AsyncIDBStore } from "../AsyncIDBStore.js"
import { keyPassThroughProxy } from "../utils.js"
import type { AsyncIDB } from "../AsyncIDB"
import type { CollectionForeignKeyConfig, CollectionIndex, SerializationConfig } from "../types"

const CollectionBuilderSentinel = Symbol()

export const $COLLECTION_INTERNAL = Symbol.for("collection.internal")

const ERR_KEYPATH_MISSING = 0
const ERR_KEYPATH_EMPTY = 1
const ERR_KEYPATH_DUPLICATE = 2

type KeyPathInvalidationEventArgs =
  | [typeof ERR_KEYPATH_MISSING, null]
  | [typeof ERR_KEYPATH_EMPTY, null]
  | [typeof ERR_KEYPATH_DUPLICATE, string]

type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

export type CollectionTransformers<
  RecordType extends Record<string, any>,
  DTO extends Record<string, any>,
  IDMode extends CollectionIDMode,
  KeyPath extends string
> = {
  /**
   * @optional
   * @description Transformer for creating the record
   */
  create?: (
    data: DTO
  ) => IDMode extends CollectionIDMode.AutoIncrement
    ? Prettify<Omit<RecordType, KeyPath> & { [key in KeyPath]?: number }>
    : RecordType
  /**
   * @optional
   * @description Transformer for updating the record
   */
  update?: (data: RecordType) => RecordType
}

type InvalidRecordKeyError = Error & {
  Brand: "InvalidRecordKeyError"
}

type ForeignKeyConfigCallback<RecordType extends Record<string, any>> = (fields: {
  [key in keyof RecordType & string]: key
}) => CollectionForeignKeyConfig<RecordType>[]

/**
 * @description Collection builder
 * @see {@link Collection.create}
 */
export class Collection<
  RecordType extends Record<string, any>,
  DTO extends Record<string, any> = RecordType,
  KeyPath extends keyof RecordType & string = "id" extends keyof RecordType & string ? "id" : never,
  Indexes extends CollectionIndex<RecordType>[] = never,
  IDMode extends CollectionIDMode = CollectionIDMode.UserAssigned
> {
  [$COLLECTION_INTERNAL]!: {
    record: RecordType
    dto: DTO
  }
  idMode: IDMode
  keyPath: KeyPath
  indexes: Indexes
  foreignKeys: CollectionForeignKeyConfig<RecordType>[]
  transformers: {
    create?: (data: DTO) => RecordType
    update?: (data: RecordType) => RecordType
  } = {}
  serializationConfig: SerializationConfig<RecordType, any> = {
    write: (data: RecordType) => data,
    read: (data: any) => data,
  }

  private constructor(key: symbol) {
    if (key !== CollectionBuilderSentinel)
      throw new Error("Cannot call CollectionBuilder directly - use Collection.create<T>()")
    this.keyPath = "id" as KeyPath
    this.indexes = [] as any as Indexes
    this.foreignKeys = []
    this.idMode = "userAssignedId" as IDMode
  }
  /**
   * Sets the key for this collection
   */
  withKeyPath<const Key extends keyof RecordType & string, const AutoIncr extends boolean>(
    keyPath: Key,
    options?: {
      autoIncrement?: AutoIncr
    }
  ): AutoIncr extends true
    ? RecordType[Key] extends number
      ? Collection<RecordType, DTO, Key, Indexes, CollectionIDMode.AutoIncrement>
      : InvalidRecordKeyError
    : Collection<RecordType, DTO, Key, Indexes, CollectionIDMode.UserAssigned> {
    if (options?.autoIncrement) {
      this.idMode = CollectionIDMode.AutoIncrement as IDMode
    }
    this.keyPath = keyPath as any
    return this as any
  }

  /**
   * Sets the indexes for this collection
   * @see https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/createIndex
   */
  withIndexes<const IdxArray extends CollectionIndex<RecordType>[]>(
    indexes: IdxArray
  ): Collection<RecordType, DTO, KeyPath, IdxArray, IDMode> {
    this.indexes = indexes as unknown as Indexes
    return this as any as Collection<RecordType, DTO, KeyPath, IdxArray, IDMode>
  }

  /**
   * Sets the foreign keys for this collection
   */
  withForeignKeys(
    callbackOrKeys: ForeignKeyConfigCallback<RecordType> | CollectionForeignKeyConfig<RecordType>[]
  ): this {
    this.foreignKeys = Array.isArray(callbackOrKeys)
      ? callbackOrKeys
      : callbackOrKeys(keyPassThroughProxy)
    return this
  }

  /**
   * Sets the transformers for this collection
   */
  withTransformers(transformers: CollectionTransformers<RecordType, DTO, IDMode, KeyPath>): this {
    this.transformers = transformers as any
    return this
  }

  withSerialization<T>(config: SerializationConfig<RecordType, T>): this {
    this.serializationConfig = config
    return this
  }

  /**
   * Creates a new Collection definition
   * @example
   * ```ts
   * type Todo = { id: number; text: string; createdAt: number }
   * type TodoDTO = { text: string }
   *
   * const todos = Collection.create<Todo, TodoDTO>()
   *   .withKeyPath("id")
   *   .withIndexes([{ keyPath: "createdAt", name: "idx_createdAt" }])
   *   .withTransformers({
   *      create: ({ text }) => ({
   *        id: crypto.randomUUID(),
   *        text,
   *        createdAt: Date.now()
   *      })
   *   })
   *
   * ```
   */
  static create<
    RecordType extends Record<string, any>,
    DTO extends Record<string, any> = any
  >(): Collection<
    RecordType,
    DTO,
    "id" extends keyof RecordType & string ? "id" : keyof RecordType & string
  > {
    return new Collection<RecordType, DTO>(CollectionBuilderSentinel)
  }

  static validate(
    db: AsyncIDB<any, any, any>,
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
      this.validateKeyPath(index.key, (err, data) =>
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
    keyPath: string | string[] | undefined,
    handler: (...args: KeyPathInvalidationEventArgs) => void
  ) {
    if (!keyPath) return handler(ERR_KEYPATH_MISSING, null)
    if (typeof keyPath === "string") return
    if (keyPath.length === 0) return handler(ERR_KEYPATH_EMPTY, null)

    const seenKeys = new Set<string>()
    for (const key of keyPath) {
      if (seenKeys.has(key)) handler(ERR_KEYPATH_DUPLICATE, key)
      seenKeys.add(key)
    }
  }
}
