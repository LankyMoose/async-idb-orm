import type { RecordKeyPath, CollectionIndex } from "./types"

const CollectionBuilderSentinel = Symbol()

export const $COLLECTION_INTERNAL = Symbol.for("collection.internal")

export class Collection<
  RecordType extends Record<string, any>,
  DTO extends Record<string, any> = RecordType,
  KeyPath extends RecordKeyPath<RecordType> = never,
  Indexes extends CollectionIndex<RecordType>[] = never
> {
  [$COLLECTION_INTERNAL]: {
    record: RecordType
    dto: DTO
  }
  keyPath: KeyPath = undefined as any as KeyPath
  indexes: Indexes = [] as any as Indexes
  transformers: {
    create?: (data: DTO) => RecordType
    update?: (data: RecordType) => RecordType
  } = {}
  creationConflictMode: "delete" | "ignore" = "ignore"
  constructor(key: symbol) {
    if (key !== CollectionBuilderSentinel)
      throw new Error("Cannot call CollectionBuilder directly - use Collection.create<T>()")

    this[$COLLECTION_INTERNAL] = null as any
  }

  static create<
    RecordType extends Record<string, any>,
    DTO extends Record<string, any> = any
  >(): Collection<RecordType, DTO> {
    return new Collection<RecordType, DTO>(CollectionBuilderSentinel)
  }

  static validate(collection: Collection<any, any, any, any>, key: string, errors: Set<string>) {
    if (
      (Array.isArray(collection.keyPath) && collection.keyPath.length === 0) ||
      !collection.keyPath
    ) {
      errors.add(
        `[async-idb-orm]: Invalid keyPath for Collection "${key}" - must be string | string[]`
      )
    }
    const seenIndexNames = new Set<string>()
    for (const index of collection.indexes) {
      if (seenIndexNames.has(index.name)) {
        errors.add(`[async-idb-orm]: Duplicated index name "${index.name}" for collection "${key}"`)
      }
      seenIndexNames.add(index.name)
    }
  }

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/createObjectStore#keypath
   * @see https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/createObjectStore#autoincrement
   */
  withKeyPath<const KeyPath extends RecordKeyPath<RecordType>>(
    keyPath: KeyPath
  ): Collection<RecordType, DTO, KeyPath, Indexes> {
    this.keyPath = keyPath as any
    return this as any as Collection<RecordType, DTO, KeyPath, Indexes>
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/createIndex
   */
  withIndexes<const Indexes extends CollectionIndex<RecordType>[]>(
    indexes: Indexes
  ): Collection<RecordType, DTO, KeyPath, Indexes> {
    this.indexes = indexes as any
    return this as any as Collection<RecordType, DTO, KeyPath, Indexes>
  }
  withTransformers(transformers: {
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
  }): this {
    this.transformers = transformers
    return this
  }
  /**
   * @default "ignore"
   * @description Indicates the action to be taken if a store with the same name already exists.
   */
  withCreationConflictMode(onConflict: "ignore" | "delete"): this {
    this.creationConflictMode = onConflict
    return this
  }
}
