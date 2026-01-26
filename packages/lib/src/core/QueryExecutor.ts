import type {
  AnyCollection,
  CollectionRecord,
  CollectionKeyPathType,
  FindOptions,
  RelationResult,
  RelationsSchema,
  RelationDefinitionEntry,
} from "../types"
import { AsyncIDBSelector } from "../AsyncIDBSelector.js"
import { RequestHelper } from "./RequestHelper.js"
import { CursorIterator } from "./CursorIterator.js"
import { AsyncIDBStore } from "../AsyncIDBStore.js"

/**
 * Handles query execution for collections with relation support
 */
export class QueryExecutor<T extends AnyCollection, R extends RelationsSchema> {
  constructor(
    private store: AsyncIDBStore<T, R>,
    private deserialize: (value: any) => CollectionRecord<T>,
    private getDb: () => Promise<IDBDatabase>,
    private getRelations: () => Record<string, RelationDefinitionEntry<T, AnyCollection>>,
    private getStoreNames: () => string[],
    private currentTx?: IDBTransaction
  ) {}

  /**
   * Executes a query within a transaction context
   */
  async executeInTransaction<TResult>(
    operation: (tx: IDBTransaction) => Promise<TResult>
  ): Promise<TResult> {
    if (this.currentTx) {
      AsyncIDBSelector.observe(this.currentTx, this.store)
      return operation(this.currentTx)
    }

    const db = await this.getDb()
    const tx = db.transaction(this.getStoreNames(), "readonly")
    AsyncIDBSelector.observe(tx, this.store)
    return operation(tx)
  }

  async findByKey<Options extends FindOptions<R, T>>(
    key: CollectionKeyPathType<T>,
    options: Options | undefined
  ): Promise<RelationResult<T, R, Options> | null> {
    return this.executeInTransaction(async (tx) => {
      const objectStore = tx.objectStore(this.store.name)
      const rawRecord = await RequestHelper.get(objectStore, key as IDBValidKey)

      if (!rawRecord) return null

      const record = this.deserialize(rawRecord) as RelationResult<T, R, Options>

      if (options?.with) {
        await this.resolveRelations(tx, options.with, record)
      }

      return record
    })
  }

  async findByPredicate<Options extends FindOptions<R, T>>(
    predicate: (item: CollectionRecord<T>) => boolean,
    options: (Options & { limit?: number }) | undefined
  ): Promise<RelationResult<T, R, Options>[]> {
    const limit = options?.limit || Infinity

    return this.executeInTransaction(async (tx) => {
      const objectStore = tx.objectStore(this.store.name)
      const records = (await CursorIterator.findByPredicate(objectStore, predicate, {
        limit,
        deserialize: this.deserialize,
      })) as RelationResult<T, R, Options>[]

      if (records.length > 0 && options?.with) {
        await this.resolveRelations(tx, options.with, ...records)
      }

      return records
    })
  }

  async findAll<Options extends FindOptions<R, T>>(
    options: Options | undefined
  ): Promise<RelationResult<T, R, Options>[]> {
    return this.executeInTransaction(async (tx) => {
      const objectStore = tx.objectStore(this.store.name)
      const request = objectStore.getAll()
      const result = await RequestHelper.promisify(request)

      const records = result.map(this.deserialize) as RelationResult<T, R, Options>[]

      if (records.length > 0 && options?.with) {
        await this.resolveRelations(tx, options.with, ...records)
      }

      return records
    })
  }

  async findByDirection<Options extends FindOptions<R, T>>(
    indexName: string,
    direction: IDBCursorDirection,
    options: Options | undefined
  ): Promise<RelationResult<T, R, Options> | null> {
    return this.executeInTransaction(async (tx) => {
      const objectStore = tx.objectStore(this.store.name)
      const index = objectStore.index(indexName)
      const record = await CursorIterator.getFirstByDirection(index, direction, this.deserialize)

      if (record !== null && options?.with) {
        await this.resolveRelations(tx, options.with, record)
      }

      return record
    })
  }

  async findLatest<Options extends FindOptions<R, T>>(
    options: Options | undefined
  ): Promise<RelationResult<T, R, Options> | null> {
    return this.executeInTransaction(async (tx) => {
      const objectStore = tx.objectStore(this.store.name)
      const request = objectStore.openCursor(null, "prev")
      const result = await RequestHelper.promisify(request)
      if (result === null) return null

      const record = this.deserialize(result.value)
      if (options?.with) {
        await this.resolveRelations(tx, options.with, record)
      }
      return record
    })
  }

  async resolveRelations<Options extends FindOptions<R, T>>(
    tx: IDBTransaction,
    withOptions: NonNullable<Options["with"]>,
    ...records: RelationResult<T, R, Options>[]
  ): Promise<void> {
    const relations = this.getRelations()

    for (const [relationName, options] of Object.entries(withOptions)) {
      if (options === false) continue

      await this.populateRelations(
        tx,
        records,
        relationName,
        relations[relationName],
        options === true ? {} : (options as any)
      )
    }
  }

  private async populateRelations(
    tx: IDBTransaction,
    records: CollectionRecord<T>[],
    relationName: string,
    relationDef: RelationDefinitionEntry<T, AnyCollection>,
    options?: {
      limit?: number
      where?: (item: any) => boolean
      with?: Record<string, boolean | any>
    }
  ): Promise<void> {
    const { def, other } = relationDef
    const { type: relationType, from: sourceField, to: targetField } = def

    const objectStore = tx.objectStore(other.name)
    const request = objectStore.openCursor()
    const iterator = CursorIterator.createAsyncIterator(
      request,
      AsyncIDBStore.getDeserialize(other)
    )

    const isOneToOne = relationType === "one-to-one"
    const nested: unknown[] = []
    const limit = isOneToOne ? 1 : (options?.limit ?? Infinity)

    const setRelation: RelationSetter<T> = isOneToOne
      ? (source, related) => (source[relationName] = related)
      : (source, related) => source[relationName].push(related)

    type SourceKeyMapEntry = { record: CollectionRecord<T>; count: number }[]
    const sourceKeysToRecords = new Map<any, SourceKeyMapEntry>()

    for (const record of records) {
      const srcKey = record[sourceField]
      record[relationName] = isOneToOne ? null : []

      if (!sourceKeysToRecords.has(srcKey)) {
        sourceKeysToRecords.set(srcKey, [])
      }
      sourceKeysToRecords.get(srcKey)!.push({ record, count: 0 })
    }

    for await (const related of iterator) {
      const key = related[targetField]
      const sourceRecords = sourceKeysToRecords.get(key)

      if (
        !sourceRecords ||
        sourceRecords.length === 0 ||
        (options?.where && !options.where(related))
      )
        continue

      nested.push(related)

      for (let i = 0; i < sourceRecords.length; i++) {
        const sourceRecord = sourceRecords[i]
        setRelation(sourceRecord.record, related)

        if (++sourceRecord.count === limit) {
          sourceRecords.splice(i--, 1)

          if (sourceRecords.length === 0) {
            sourceKeysToRecords.delete(key)
            break
          }
        }
      }
    }

    if (nested.length > 0 && options?.with) {
      await AsyncIDBStore.getQueryExecutor(other).resolveRelations(tx, options.with, ...nested)
    }
  }
}

type RelationSetter<T extends AnyCollection> = (
  source: CollectionRecord<T>,
  related: unknown
) => void
