import type {
  AnyCollection,
  CollectionRecord,
  CollectionKeyPathType,
  FindOptions,
  RelationResult,
  RelationsSchema,
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
    private getRelations: () => Record<string, any>,
    private currentTx?: IDBTransaction
  ) {}

  /**
   * Executes a query within a transaction context
   */
  async executeInTransaction<TResult>(
    operation: (tx: IDBTransaction) => Promise<TResult>,
    getDb: () => Promise<IDBDatabase>,
    storeNames: string[]
  ): Promise<TResult> {
    if (this.currentTx) {
      return operation(this.currentTx)
    }

    const db = await getDb()
    const tx = db.transaction(storeNames, "readonly")
    return operation(tx)
  }

  /**
   * Finds a single record by key with optional relations
   */
  async findByKey<Options extends FindOptions<R, T>>(
    key: CollectionKeyPathType<T>,
    options: Options | undefined,
    getDb: () => Promise<IDBDatabase>,
    storeNames: string[]
  ): Promise<RelationResult<T, R, Options> | null> {
    return this.executeInTransaction(
      async (tx) => {
        AsyncIDBSelector.observe(tx, this.store)

        const objectStore = tx.objectStore(this.store.name)
        const rawRecord = await RequestHelper.get(objectStore, key as IDBValidKey)

        if (!rawRecord) return null

        const record = this.deserialize(rawRecord) as RelationResult<T, R, Options>

        if (options?.with) {
          return this.resolveRelations(record, options.with, tx)
        }

        return record
      },
      getDb,
      storeNames
    )
  }

  /**
   * Finds records by predicate with optional relations
   */
  async findByPredicate<Options extends FindOptions<R, T>>(
    predicate: (item: CollectionRecord<T>) => boolean,
    options: (Options & { limit?: number }) | undefined,
    getDb: () => Promise<IDBDatabase>,
    storeNames: string[]
  ): Promise<RelationResult<T, R, Options>[]> {
    const limit = options?.limit || Infinity

    return this.executeInTransaction(
      async (tx) => {
        AsyncIDBSelector.observe(tx, this.store)

        const objectStore = tx.objectStore(this.store.name)
        const records = (await CursorIterator.findByPredicate(objectStore, predicate, {
          limit,
          deserialize: this.deserialize,
        })) as RelationResult<T, R, Options>[]

        if (options?.with) {
          return Promise.all(
            records.map((record) => this.resolveRelations(record, options.with!, tx))
          )
        }

        return records
      },
      getDb,
      storeNames
    )
  }

  /**
   * Finds all records with optional relations
   */
  async findAll<Options extends FindOptions<R, T>>(
    options: Options | undefined,
    getDb: () => Promise<IDBDatabase>,
    storeNames: string[]
  ): Promise<RelationResult<T, R, Options>[]> {
    return this.executeInTransaction(
      async (tx) => {
        AsyncIDBSelector.observe(tx, this.store)

        const objectStore = tx.objectStore(this.store.name)
        const request = objectStore.getAll()
        const result = await RequestHelper.promisify(request)

        const records = result.map(this.deserialize) as RelationResult<T, R, Options>[]

        if (options?.with) {
          return Promise.all(
            records.map((record) => this.resolveRelations(record, options.with!, tx))
          )
        }

        return records
      },
      getDb,
      storeNames
    )
  }

  /**
   * Gets records from an index with optional relations
   */
  async findByIndex<Options extends FindOptions<R, T>>(
    indexName: string,
    keyRange: IDBKeyRange | undefined,
    options: Options | undefined,
    getDb: () => Promise<IDBDatabase>,
    storeNames: string[]
  ): Promise<RelationResult<T, R, Options>[]> {
    return this.executeInTransaction(
      async (tx) => {
        AsyncIDBSelector.observe(tx, this.store)

        const objectStore = tx.objectStore(this.store.name)
        const index = objectStore.index(indexName)

        const records = keyRange
          ? await CursorIterator.getIndexRange(index, keyRange, this.deserialize)
          : ((await RequestHelper.promisify(index.getAll()).then((results) =>
              results.map(this.deserialize)
            )) as RelationResult<T, R, Options>[])

        if (options?.with) {
          return Promise.all(
            records.map((record) => this.resolveRelations(record, options.with!, tx))
          )
        }

        return records
      },
      getDb,
      storeNames
    )
  }

  /**
   * Gets the first/last record from an index
   */
  async findByDirection(
    indexName: string,
    direction: IDBCursorDirection,
    getDb: () => Promise<IDBDatabase>,
    storeNames: string[]
  ): Promise<CollectionRecord<T> | null> {
    return this.executeInTransaction(
      async (tx) => {
        const objectStore = tx.objectStore(this.store.name)
        const index = objectStore.index(indexName)
        return CursorIterator.getFirstByDirection(index, direction, this.deserialize)
      },
      getDb,
      storeNames
    )
  }

  /**
   * Resolves relations for a record
   */
  async resolveRelations<Options extends FindOptions<R, T>>(
    record: RelationResult<T, R, Options>,
    withOptions: Record<string, boolean | any>,
    tx: IDBTransaction
  ): Promise<RelationResult<T, R, Options>> {
    const relations = this.getRelations()

    await Promise.all(
      Object.entries(withOptions).map(([relationName, options]) =>
        this.fetchRelatedRecords(tx, record, relations[relationName], options).then((result) => {
          ;(record as any)[relationName] = result
        })
      )
    )

    return record
  }

  /**
   * Fetches related records for a relation
   */
  private async fetchRelatedRecords(
    tx: IDBTransaction,
    record: CollectionRecord<T>,
    relationDef: any,
    options?: {
      limit?: number
      where?: (item: any) => boolean
      with?: Record<string, boolean | any>
    }
  ): Promise<any> {
    if (!relationDef) return null

    const { def, other } = relationDef
    const { type: relationType, from: sourceField, to: targetField } = def
    const sourceValue = record[sourceField]

    const basePredicate = (item: any) => item[targetField] === sourceValue
    const predicate = options?.where
      ? (item: any) => basePredicate(item) && options.where!(item)
      : basePredicate

    const objectStore = tx.objectStore(other.name)
    let results = await CursorIterator.findByPredicate(objectStore, predicate, {
      limit: options?.limit,
      deserialize: AsyncIDBStore.getDeserialize(other),
    })

    // If nested relations are requested, resolve them for each related record
    if (options?.with && results.length > 0) {
      // Use the other store's QueryExecutor to resolve nested relations
      const otherQueryExecutor = AsyncIDBStore.getQueryExecutor(other)
      results = await Promise.all(
        results.map((relatedRecord) =>
          otherQueryExecutor.resolveRelations(relatedRecord, options.with!, tx)
        )
      )
    }

    if (relationType === "one-to-one") {
      return results[0] ?? null
    } else if (relationType === "one-to-many") {
      return results
    }

    return relationType === "one-to-many" ? [] : null
  }
}
