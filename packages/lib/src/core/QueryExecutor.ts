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
    private currentTx?: IDBTransaction
  ) {}

  /**
   * Executes a query within a transaction context
   */
  async executeInTransaction<TResult>(
    operation: (tx: IDBTransaction) => Promise<TResult>,
    storeNames: string[]
  ): Promise<TResult> {
    if (this.currentTx) {
      AsyncIDBSelector.observe(this.currentTx, this.store)
      return operation(this.currentTx)
    }

    const db = await this.getDb()
    const tx = db.transaction(storeNames, "readonly")
    AsyncIDBSelector.observe(tx, this.store)
    return operation(tx)
  }

  async findByKey<Options extends FindOptions<R, T>>(
    key: CollectionKeyPathType<T>,
    options: Options | undefined,
    storeNames: string[]
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
    }, storeNames)
  }

  async findByPredicate<Options extends FindOptions<R, T>>(
    predicate: (item: CollectionRecord<T>) => boolean,
    options: (Options & { limit?: number }) | undefined,
    storeNames: string[]
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
    }, storeNames)
  }

  async findAll<Options extends FindOptions<R, T>>(
    options: Options | undefined,
    storeNames: string[]
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
    }, storeNames)
  }

  async findByIndex<Options extends FindOptions<R, T>>(
    indexName: string,
    keyRange: IDBKeyRange | undefined,
    options: Options | undefined,
    storeNames: string[]
  ): Promise<RelationResult<T, R, Options>[]> {
    return this.executeInTransaction(async (tx) => {
      const objectStore = tx.objectStore(this.store.name)
      const index = objectStore.index(indexName)

      const records = keyRange
        ? await CursorIterator.getIndexRange(index, keyRange, this.deserialize)
        : ((await RequestHelper.promisify(index.getAll()).then((results) =>
            results.map(this.deserialize)
          )) as RelationResult<T, R, Options>[])

      if (records.length > 0 && options?.with) {
        await this.resolveRelations(tx, options.with, ...records)
      }

      return records
    }, storeNames)
  }

  async findByDirection<Options extends FindOptions<R, T>>(
    indexName: string,
    direction: IDBCursorDirection,
    options: Options | undefined,
    storeNames: string[]
  ): Promise<RelationResult<T, R, Options> | null> {
    return this.executeInTransaction(async (tx) => {
      const objectStore = tx.objectStore(this.store.name)
      const index = objectStore.index(indexName)
      const record = await CursorIterator.getFirstByDirection(index, direction, this.deserialize)

      if (record !== null && options?.with) {
        await this.resolveRelations(tx, options.with, record)
      }

      return record
    }, storeNames)
  }

  async findLatest<Options extends FindOptions<R, T>>(
    options: Options | undefined,
    storeNames: string[]
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
    }, storeNames)
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

    const initRelationProperty = relationType === "one-to-one" ? () => null : () => []
    const setRelationProperty =
      relationType === "one-to-one"
        ? (source: any, related: any) => {
            source[relationName] = related
          }
        : (source: any, related: any) => {
            source[relationName].push(related)
          }

    const sourceValuesToSourceRecords_v3 = new Map<
      any,
      { record: CollectionRecord<T>; count: number }[]
    >()

    for (const record of records) {
      const srcKey = record[sourceField]
      record[relationName] = initRelationProperty()

      if (!sourceValuesToSourceRecords_v3.has(srcKey)) {
        sourceValuesToSourceRecords_v3.set(srcKey, [])
      }
      sourceValuesToSourceRecords_v3.get(srcKey)!.push({ record, count: 0 })
    }

    const nested: any[] = []
    const limit = options?.limit ?? Infinity

    for await (const related of iterator) {
      const key = related[targetField]
      const sourceRecords = sourceValuesToSourceRecords_v3.get(key)

      if (
        !sourceRecords ||
        sourceRecords.length === 0 ||
        (options?.where && !options.where(related))
      )
        continue

      nested.push(related)

      for (let i = 0; i < sourceRecords.length; i++) {
        const sourceRecord = sourceRecords[i]
        setRelationProperty(sourceRecord.record, related)

        if (++sourceRecord.count === limit) {
          sourceRecords.splice(i--, 1)

          if (sourceRecords.length === 0) {
            sourceValuesToSourceRecords_v3.delete(key)
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
