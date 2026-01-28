import type {
  CollectionIndex,
  CollectionEvent,
  CollectionRecord,
  CollectionDTO,
  CollectionKeyPathType,
  CollectionIndexName,
  ActiveRecord,
  CollectionEventCallback,
  RelationsSchema,
  FindOptions,
  RelationResult,
  AnyCollection,
  CollectionSchema,
  RelationDefinitionEntry,
  StoreReader,
} from "./types"
import type { AsyncIDB } from "./AsyncIDB"
import { Collection } from "./builders/Collection.js"
import { RequestHelper } from "./core/RequestHelper.js"
import { TransactionManager } from "./core/TransactionManager.js"
import { StoreEventEmitter } from "./core/EventEmitter.js"
import {
  DownstreamHandlerCallback,
  ForeignKeyManager,
  ForeignKeysInit,
} from "./core/ForeignKeyManager.js"
import { ActiveRecordWrapper } from "./core/ActiveRecordWrapper.js"
import { QueryExecutor } from "./core/QueryExecutor.js"
import { CursorIterator } from "./core/CursorIterator.js"
import { TaskContext } from "./core/TaskContext.js"

/**
 * A refactored, more professional implementation of AsyncIDBStore
 * @template {Collection} T
 * @template {RelationsSchema} R
 */
export class AsyncIDBStore<
  T extends Collection<Record<string, any>, any, any, CollectionIndex<any>[], any>,
  R extends RelationsSchema
> implements StoreReader<T, R>
{
  private transactionManager: TransactionManager
  private eventEmitter: StoreEventEmitter<T>
  private foreignKeyManager: ForeignKeyManager<T>
  private activeRecordWrapper: ActiveRecordWrapper<T>
  private queryExecutor: QueryExecutor<T, R>
  private relations: Record<string, RelationDefinitionEntry<T, AnyCollection>> = {}
  private taskContext?: TaskContext
  private serialize: (record: CollectionRecord<T>) => any
  private deserialize: (record: any) => CollectionRecord<T>

  constructor(
    private db: AsyncIDB<CollectionSchema, RelationsSchema, any>,
    private collection: T,
    public name: string
  ) {
    // Initialize serialization
    const { read, write } = collection.serializationConfig
    this.serialize = write
    this.deserialize = read

    // Initialize managers
    this.transactionManager = new TransactionManager(
      () => new Promise((resolve) => this.db.getInstance(resolve)),
      () => this.taskContext,
      this.db.storeNames
    )

    this.eventEmitter = new StoreEventEmitter<T>(this.name, this.db)

    this.foreignKeyManager = new ForeignKeyManager<T>(
      this.name,
      this.getRecordKey.bind(this),
      this.deserialize,
      this.eventEmitter
    )

    this.activeRecordWrapper = new ActiveRecordWrapper<T>(
      this.getRecordKey.bind(this),
      this.update.bind(this),
      this.deleteByKey.bind(this),
      this.assertNoRelations.bind(this)
    )

    this.queryExecutor = new QueryExecutor<T, R>(
      this,
      this.deserialize,
      () => new Promise((resolve) => this.db.getInstance(resolve)),
      () => this.relations,
      () => this.db.storeNames,
      this.taskContext?.tx
    )
  }

  static getStoreReader<
    T extends Collection<Record<string, any>, any, any, CollectionIndex<any>[], any>,
    R extends RelationsSchema
  >(store: AsyncIDBStore<T, R>): StoreReader<T, R> {
    return {
      find: store.find.bind(store),
      findActive: store.findActive.bind(store),
      findMany: store.findMany.bind(store),
      findManyActive: store.findManyActive.bind(store),
      all: store.all.bind(store),
      allActive: store.allActive.bind(store),
      count: store.count.bind(store),
      latest: store.latest.bind(store),
      latestActive: store.latestActive.bind(store),
      min: store.min.bind(store),
      max: store.max.bind(store),
      getIndexRange: store.getIndexRange.bind(store),
      iterate: store.iterate.bind(store) as StoreReader<T, R>["iterate"],
      [Symbol.asyncIterator]: store[Symbol.asyncIterator].bind(store),
    } as StoreReader<T, R>
  }

  // =============================================================================
  // Event Management
  // =============================================================================

  addEventListener<Evt extends CollectionEvent>(
    event: Evt,
    listener: CollectionEventCallback<T, Evt>
  ): void {
    this.eventEmitter.addEventListener(event, listener)
  }

  removeEventListener<Evt extends CollectionEvent>(
    event: Evt,
    listener: CollectionEventCallback<T, Evt>
  ): void {
    this.eventEmitter.removeEventListener(event, listener)
  }

  // =============================================================================
  // Active Record Pattern
  // =============================================================================

  wrap(record: CollectionRecord<T>): ActiveRecord<CollectionRecord<T>> {
    return this.activeRecordWrapper.wrap(record)
  }

  unwrap(
    activeRecord: CollectionRecord<T> | ActiveRecord<CollectionRecord<T>>
  ): CollectionRecord<T> {
    return this.activeRecordWrapper.unwrap(activeRecord)
  }

  // =============================================================================
  // CRUD Operations
  // =============================================================================

  async create(data: CollectionDTO<T>): Promise<CollectionRecord<T>> {
    this.assertNoRelations(data, "create")
    data = this.unwrap(data)

    const { create: transformer } = this.collection.transformers
    if (transformer) {
      data = transformer(data)
    }

    return this.transactionManager.queueTask<CollectionRecord<T>>(async (ctx) => {
      await this.foreignKeyManager.validateUpstreamConstraints(ctx, data)

      const serialized = this.serialize(data)
      const objectStore = ctx.tx.objectStore(this.name)
      const key = await RequestHelper.add(objectStore, serialized)

      const result = !this.collection.idMode ? data : { ...data, [this.collection.keyPath]: key }

      ctx.onDidCommit(() => {
        this.eventEmitter.emit("write", result)
        this.eventEmitter.emit("write|delete", result)
      })

      return result
    })
  }

  async createActive(data: CollectionDTO<T>): Promise<ActiveRecord<CollectionRecord<T>>> {
    const result = await this.create(data)
    return this.wrap(result)
  }

  async update(record: CollectionRecord<T>): Promise<CollectionRecord<T>> {
    this.assertNoRelations(record, "update")
    record = this.unwrap(record)

    return this.transactionManager.queueTask<CollectionRecord<T>>(async (ctx) => {
      const key = this.getRecordKey(record)
      const objectStore = ctx.tx.objectStore(this.name)

      const exists = await RequestHelper.exists(objectStore, key as IDBValidKey)
      if (!exists) {
        throw new Error(
          `[async-idb-orm]: record in collection ${this.name} with key ${key} not found.`
        )
      }

      const { update: transformer } = this.collection.transformers
      if (transformer) {
        record = transformer(record)
      }

      await this.foreignKeyManager.validateUpstreamConstraints(ctx, record)

      const serialized = this.serialize(record)
      await RequestHelper.put(objectStore, serialized)

      ctx.onDidCommit(() => {
        this.eventEmitter.emit("write", record)
        this.eventEmitter.emit("write|delete", record)
      })

      return record
    })
  }

  async upsert(
    ...data: (CollectionRecord<T> | CollectionDTO<T>)[]
  ): Promise<CollectionRecord<T>[]> {
    data.forEach((item) => this.assertNoRelations(item, "upsert"))

    return this.transactionManager.queueTask<CollectionRecord<T>[]>(async (ctx) => {
      const results: CollectionRecord<T>[] = []
      const objectStore = ctx.tx.objectStore(this.name)

      for (let record of data) {
        record = this.unwrap(record)
        const key = this.getRecordKey(record)

        const exists = await RequestHelper.exists(objectStore, key as IDBValidKey)
        const { create, update } = this.collection.transformers
        const transformer = exists ? update : create

        if (transformer) {
          record = transformer(record)
        }

        await this.foreignKeyManager.validateUpstreamConstraints(ctx, record)

        const serialized = this.serialize(record)
        await RequestHelper.put(objectStore, serialized)
        results.push(record)
      }

      ctx.onDidCommit(() => {
        results.forEach((record) => {
          this.eventEmitter.emit("write", record)
          this.eventEmitter.emit("write|delete", record)
        })
      })

      return results
    })
  }

  async delete(
    predicateOrKey: CollectionKeyPathType<T> | ((item: CollectionRecord<T>) => boolean)
  ): Promise<CollectionRecord<T> | null> {
    if (typeof predicateOrKey === "function") {
      const [deleted] = await this.deleteMany(predicateOrKey, 1)
      return deleted ?? null
    }

    return this.deleteByKey(predicateOrKey)
  }

  async deleteMany(
    predicate: (item: CollectionRecord<T>) => boolean,
    limit: number = Infinity
  ): Promise<CollectionRecord<T>[]> {
    return this.transactionManager.queueTask<CollectionRecord<T>[]>(async (ctx) => {
      const objectStore = ctx.tx.objectStore(this.name)

      const results = await CursorIterator.deleteByPredicate(objectStore, predicate, {
        limit,
        deserialize: this.deserialize,
        onBeforeDelete: async (record) => {
          await this.foreignKeyManager.handleDownstreamConstraints(ctx, this.getRecordKey(record))
        },
        onAfterDelete: (record) => {
          ctx.onDidCommit(() => {
            this.eventEmitter.emit("delete", record)
            this.eventEmitter.emit("write|delete", record)
          })
        },
      })

      return results
    })
  }

  async clear(): Promise<void> {
    return this.transactionManager.queueTask<void>(async (ctx) => {
      const objectStore = ctx.tx.objectStore(this.name)
      await RequestHelper.clear(objectStore)

      ctx.onDidCommit(() => {
        this.eventEmitter.emit("clear", null)
      })

      return
    })
  }

  // =============================================================================
  // Query Operations
  // =============================================================================

  async find<Options extends FindOptions<R, T>>(
    predicateOrKey: CollectionKeyPathType<T> | ((item: CollectionRecord<T>) => boolean),
    options?: Options
  ): Promise<RelationResult<T, R, Options> | null> {
    if (typeof predicateOrKey === "function") {
      const [result] = await this.queryExecutor.findByPredicate(predicateOrKey, {
        ...options,
        limit: 1,
      })
      return (result ?? null) as RelationResult<T, R, Options> | null
    }

    return this.queryExecutor.findByKey(predicateOrKey, options)
  }

  async findActive(
    predicateOrKey: CollectionKeyPathType<T> | ((item: CollectionRecord<T>) => boolean)
  ): Promise<ActiveRecord<CollectionRecord<T>> | null> {
    const result = await this.find(predicateOrKey)
    return result ? this.wrap(result) : null
  }

  async findMany<Options extends FindOptions<R, T>>(
    predicate: (item: CollectionRecord<T>) => boolean,
    options?: Options & { limit?: number }
  ): Promise<RelationResult<T, R, Options>[]> {
    return this.queryExecutor.findByPredicate(predicate, options)
  }

  async findManyActive(
    predicate: (item: CollectionRecord<T>) => boolean,
    options?: { limit?: number }
  ): Promise<ActiveRecord<CollectionRecord<T>>[]> {
    const results = await this.findMany(predicate, options)
    return results.map((result) => this.wrap(result))
  }

  async all<Options extends FindOptions<R, T>>(
    options?: Options
  ): Promise<RelationResult<T, R, Options>[]> {
    return this.queryExecutor.findAll(options)
  }

  async allActive(): Promise<ActiveRecord<CollectionRecord<T>>[]> {
    const results = await this.all()
    return results.map((result) => this.wrap(result))
  }

  async count(): Promise<number> {
    return this.transactionManager.queueReadTask<number>(async (tx, resolve, reject) => {
      try {
        const objectStore = tx.objectStore(this.name)
        const count = await RequestHelper.count(objectStore)
        resolve(count)
      } catch (error) {
        reject(error)
      }
    })
  }

  async latest<Options extends FindOptions<R, T>>(
    options?: Options
  ): Promise<RelationResult<T, R, Options> | null> {
    return this.queryExecutor.findLatest(options)
  }

  async latestActive(): Promise<ActiveRecord<CollectionRecord<T>> | null> {
    const result = await this.latest()
    return result ? this.wrap(result) : null
  }

  async min<Options extends FindOptions<R, T>>(
    name: CollectionIndexName<T>,
    options?: Options
  ): Promise<RelationResult<T, R, Options> | null> {
    return this.queryExecutor.findByDirection(name, "next", options)
  }

  async max<Options extends FindOptions<R, T>>(
    name: CollectionIndexName<T>,
    options?: Options
  ): Promise<RelationResult<T, R, Options> | null> {
    return this.queryExecutor.findByDirection(name, "prev", options)
  }

  async getIndexRange<Options extends FindOptions<R, T>>(
    index: CollectionIndexName<T>,
    options: Options & {
      direction?: IDBCursorDirection
      keyRange: IDBKeyRange
      limit?: number
    }
  ): Promise<RelationResult<T, R, Options>[]> {
    const tx = await this.getReadonlyTransaction()

    const request = tx
      .objectStore(this.name)
      .index(index)
      .openCursor(options.keyRange, options.direction)

    const iterator = CursorIterator.createAsyncIterator(request, this.deserialize)

    const limit = options.limit ?? Infinity
    const results: RelationResult<T, R, Options>[] = []

    for await (const record of iterator) {
      results.push(record as RelationResult<T, R, Options>)
      if (results.length === limit) {
        break
      }
    }

    if (results.length > 0 && options.with) {
      await this.queryExecutor.resolveRelations(tx, options.with, ...results)
    }

    return results
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<CollectionRecord<T>, void, unknown> {
    const objectStore = await this.getReadonlyObjectStore()
    const request = objectStore.openCursor()
    const iterator = CursorIterator.createAsyncIterator(request, this.deserialize)

    for await (const item of iterator) {
      yield item
    }
  }

  async *iterate<Options extends FindOptions<R, T>>(
    options?: Options & {
      direction?: IDBCursorDirection
      keyRange?: IDBKeyRange | null
      index?: CollectionIndexName<T>
    }
  ): AsyncGenerator<RelationResult<T, R, Options>, void, unknown> {
    const tx = await this.getReadonlyTransaction()
    const objectStore = tx.objectStore(this.name)

    const source =
      typeof options?.index === "string" && !!options.index
        ? objectStore.index(options.index)
        : objectStore

    const request = source.openCursor(options?.keyRange ?? null, options?.direction)
    const iterator = CursorIterator.createAsyncIterator(request, this.deserialize)

    const BATCH_SIZE = 100
    let buffer: RelationResult<T, R, Options>[] = []

    const withOptions = options?.with

    for await (const item of iterator) {
      const record = item as RelationResult<T, R, Options>

      // If no relations are needed, we can theoretically yield immediately.
      // However, small batching (even 10-20) helps prevents transaction timeouts
      // if the consumer is slightly slow.
      if (!withOptions) {
        yield record
        continue
      }

      buffer.push(record)

      if (buffer.length >= BATCH_SIZE) {
        // resolve & flush buffer
        await this.queryExecutor.resolveRelations(tx, withOptions, ...buffer)
        for (const r of buffer) {
          yield r
        }
        buffer.length = 0
      }
    }

    // Handle items remaining in buffer
    if (buffer.length > 0) {
      await this.queryExecutor.resolveRelations(tx, withOptions!, ...buffer)
      for (const r of buffer) {
        yield r
      }
    }
  }

  // =============================================================================
  // Static Methods
  // =============================================================================

  static relay<U extends CollectionEvent>(
    store: AsyncIDBStore<any, any>,
    evtName: U,
    data: U extends "clear" ? null : CollectionRecord<any>
  ) {
    store.eventEmitter.relay(evtName, data)
  }

  static getCollection(store: AsyncIDBStore<any, any>) {
    return store.collection as AnyCollection
  }

  static getRelations(store: AsyncIDBStore<any, any>) {
    return store.relations
  }

  static getDeserialize(store: AsyncIDBStore<any, any>) {
    return store.deserialize
  }

  static getQueryExecutor(store: AsyncIDBStore<any, any>) {
    return store.queryExecutor
  }

  static cloneForTransaction(ctx: TaskContext, store: AsyncIDBStore<any, any>) {
    const cloned = new AsyncIDBStore(store.db, store.collection, store.name)
    cloned.taskContext = ctx
    cloned.relations = store.relations

    // Use the original store's event emitter to avoid duplicate events
    cloned.eventEmitter = store.eventEmitter

    // Share the same ForeignKeyManager (which uses the original event emitter)
    cloned.foreignKeyManager = store.foreignKeyManager

    // Recreate QueryExecutor with the transaction context using the cloned store
    cloned.queryExecutor = new QueryExecutor(
      cloned,
      cloned.deserialize,
      () => new Promise((resolve) => cloned.db.getInstance(resolve)),
      () => cloned.relations,
      () => cloned.db.storeNames,
      ctx.tx
    )

    return cloned
  }

  static init(store: AsyncIDBStore<any, any>, allStores: AsyncIDB<any, any, any>["stores"]) {
    store.initializeComponents(allStores)
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private async deleteByKey(key: CollectionKeyPathType<T>): Promise<CollectionRecord<T> | null> {
    return this.transactionManager.queueTask<CollectionRecord<T> | null>(async (ctx) => {
      const objectStore = ctx.tx.objectStore(this.name)
      const record = await RequestHelper.get(objectStore, key as IDBValidKey)

      if (!record) {
        return null
      }

      await this.foreignKeyManager.handleDownstreamConstraints(ctx, key)

      await RequestHelper.delete(objectStore, key as IDBValidKey)

      const deserialized = this.deserialize(record)
      ctx.onDidCommit(() => {
        this.eventEmitter.emit("delete", deserialized)
        this.eventEmitter.emit("write|delete", deserialized)
      })

      return deserialized
    })
  }

  private async getReadonlyObjectStore(): Promise<IDBObjectStore> {
    if (this.taskContext) {
      return this.taskContext.tx.objectStore(this.name)
    }

    const db = await new Promise<IDBDatabase>((res) => this.db.getInstance(res))
    return db.transaction(this.name, "readonly").objectStore(this.name)
  }

  private async getReadonlyTransaction(): Promise<IDBTransaction> {
    if (this.taskContext) {
      return this.taskContext.tx
    }

    const db = await new Promise<IDBDatabase>((res) => this.db.getInstance(res))
    return db.transaction(this.db.storeNames, "readonly")
  }

  private initializeComponents(allStores: AsyncIDB<any, any, any>["stores"]) {
    this.createRelationsMap(allStores)
    this.initializeForeignKeys(allStores)
  }

  private createRelationsMap(allStores: AsyncIDB<any, any, any>["stores"]) {
    this.relations = Object.entries(this.db.relations).reduce<typeof this.relations>(
      (acc, [_, rels]) => {
        if (rels.from !== this.collection) return acc

        const tgtCollection = rels.to
        const tgtStore = Object.values(allStores).find((s) => s.collection === tgtCollection)
        if (!tgtStore) return acc

        const relMap = rels.relationsMap
        for (const relationName in relMap) {
          acc[relationName] = {
            other: tgtStore,
            def: relMap[relationName],
          }
        }
        return acc
      },
      {}
    )
  }

  private initializeForeignKeys(allStores: AsyncIDB<any, any, any>["stores"]) {
    const init: ForeignKeysInit<T> = Object.fromEntries(
      Object.entries(allStores).map(([name, store]) => [
        name,
        {
          collection: store.collection,
          name: store.name,
          addDownstreamHandler: (handler: DownstreamHandlerCallback<T>) =>
            store.foreignKeyManager.addDownstreamHandler(handler),
        },
      ])
    )

    this.foreignKeyManager.initializeForeignKeys(this.collection.foreignKeys, init)
  }

  private getRecordKey(record: CollectionRecord<T>): CollectionKeyPathType<T> {
    const keyPath = this.collection.keyPath as IDBValidKey
    if (Array.isArray(keyPath)) {
      return keyPath.map((key) => record[key as string]) as CollectionKeyPathType<T>
    }
    return record[keyPath as string]
  }

  private assertNoRelations(record: CollectionRecord<T>, action: string) {
    for (const relationName in this.relations) {
      if (relationName in record) {
        throw new Error(`[async-idb-orm]: unable to ${action} record with relation ${relationName}`)
      }
    }
  }
}
