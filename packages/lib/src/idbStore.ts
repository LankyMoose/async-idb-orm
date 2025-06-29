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
  TaskContext,
} from "./types"
import type { AsyncIDB } from "./idb"
import { Collection } from "./builders/collection.js"
import { RequestHelper } from "./core/RequestHelper.js"
import { TransactionManager } from "./core/TransactionManager.js"
import { StoreEventEmitter } from "./core/EventEmitter.js"
import { ForeignKeyManager } from "./core/ForeignKeyManager.js"
import { ActiveRecordWrapper } from "./core/ActiveRecordWrapper.js"
import { QueryExecutor } from "./core/QueryExecutor.js"
import { CursorIterator } from "./core/CursorIterator.js"
import { Relations } from "./builders/relations.js"

/**
 * A refactored, more professional implementation of AsyncIDBStore
 * @template {Collection} T
 * @template {RelationsSchema} R
 */
export class AsyncIDBStore<
  T extends Collection<Record<string, any>, any, any, CollectionIndex<any>[], any>,
  R extends RelationsSchema
> {
  private transactionManager: TransactionManager
  private eventEmitter: StoreEventEmitter<T>
  private foreignKeyManager: ForeignKeyManager<T>
  private activeRecordWrapper: ActiveRecordWrapper<T>
  private queryExecutor: QueryExecutor<T, R>
  private relations: Record<string, any> = {}
  private taskContext?: TaskContext
  private serialize: (record: CollectionRecord<T>) => any
  private deserialize: (record: any) => CollectionRecord<T>

  constructor(private db: AsyncIDB<any, any, any>, private collection: T, public name: string) {
    // Initialize serialization
    const { read, write } = collection.serializationConfig
    this.serialize = write
    this.deserialize = read

    // Initialize managers
    this.transactionManager = new TransactionManager(
      () => new Promise((resolve) => this.db.getInstance(resolve)),
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
      () => this.relations,
      this.taskContext?.tx
    )
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

    return this.transactionManager.queueTask<CollectionRecord<T>>(async (ctx, resolve, reject) => {
      try {
        // Validate foreign key constraints BEFORE serialization
        if (this.foreignKeyManager) {
          await this.foreignKeyManager.validateUpstreamConstraints(ctx, data)
        }

        const serialized = this.serialize(data)
        const objectStore = ctx.tx.objectStore(this.name)
        const key = await RequestHelper.add(objectStore, serialized)

        const result = !this.collection.idMode ? data : { ...data, [this.collection.keyPath]: key }

        ctx.onDidCommit.push(() => {
          this.eventEmitter.emit("write", result)
          this.eventEmitter.emit("write|delete", result)
        })

        resolve(result)
      } catch (error) {
        reject(error)
      }
    }, this.taskContext)
  }

  async createActive(data: CollectionDTO<T>): Promise<ActiveRecord<CollectionRecord<T>>> {
    const result = await this.create(data)
    return this.wrap(result)
  }

  async update(record: CollectionRecord<T>): Promise<CollectionRecord<T>> {
    this.assertNoRelations(record, "update")
    record = this.unwrap(record)

    return this.transactionManager.queueTask<CollectionRecord<T>>(async (ctx, resolve, reject) => {
      try {
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

        // Validate foreign key constraints BEFORE serialization
        if (this.foreignKeyManager) {
          await this.foreignKeyManager.validateUpstreamConstraints(ctx, record)
        }

        const serialized = this.serialize(record)
        await RequestHelper.put(objectStore, serialized)

        ctx.onDidCommit.push(() => {
          this.eventEmitter.emit("write", record)
          this.eventEmitter.emit("write|delete", record)
        })

        resolve(record)
      } catch (error) {
        reject(error)
      }
    }, this.taskContext)
  }

  async upsert(
    ...data: (CollectionRecord<T> | CollectionDTO<T>)[]
  ): Promise<CollectionRecord<T>[]> {
    data.forEach((item) => this.assertNoRelations(item, "upsert"))

    return this.transactionManager.queueTask<CollectionRecord<T>[]>(
      async (ctx, resolve, reject) => {
        try {
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

            // Validate foreign key constraints BEFORE serialization
            if (this.foreignKeyManager) {
              await this.foreignKeyManager.validateUpstreamConstraints(ctx, record)
            }

            const serialized = this.serialize(record)
            await RequestHelper.put(objectStore, serialized)
            results.push(record)
          }

          ctx.onDidCommit.push(() => {
            results.forEach((record) => {
              this.eventEmitter.emit("write", record)
              this.eventEmitter.emit("write|delete", record)
            })
          })
          resolve(results)
        } catch (error) {
          reject(error)
        }
      },
      this.taskContext
    )
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

  private async deleteByKey(key: CollectionKeyPathType<T>): Promise<CollectionRecord<T> | null> {
    return this.transactionManager.queueTask<CollectionRecord<T> | null>(
      async (ctx, resolve, reject) => {
        try {
          const objectStore = ctx.tx.objectStore(this.name)
          const record = await RequestHelper.get(objectStore, key as IDBValidKey)

          if (!record) {
            return resolve(null)
          }

          // Handle foreign key constraints
          if (this.foreignKeyManager) {
            await this.foreignKeyManager.handleDownstreamConstraints(ctx, key)
          }

          await RequestHelper.delete(objectStore, key as IDBValidKey)

          const deserialized = this.deserialize(record)
          ctx.onDidCommit.push(() => {
            this.eventEmitter.emit("delete", deserialized)
            this.eventEmitter.emit("write|delete", deserialized)
          })

          resolve(deserialized)
        } catch (error) {
          reject(error)
        }
      },
      this.taskContext
    )
  }

  async deleteMany(
    predicate: (item: CollectionRecord<T>) => boolean,
    limit: number = Infinity
  ): Promise<CollectionRecord<T>[]> {
    return this.transactionManager.queueTask<CollectionRecord<T>[]>(
      async (ctx, resolve, reject) => {
        try {
          const objectStore = ctx.tx.objectStore(this.name)

          const results = await CursorIterator.deleteByPredicate(objectStore, predicate, {
            limit,
            deserialize: this.deserialize,
            onBeforeDelete: async (record) => {
              if (this.foreignKeyManager) {
                await this.foreignKeyManager.handleDownstreamConstraints(
                  ctx,
                  this.getRecordKey(record)
                )
              }
            },
            onAfterDelete: (record) => {
              ctx.onDidCommit.push(() => {
                this.eventEmitter.emit("delete", record)
                this.eventEmitter.emit("write|delete", record)
              })
            },
          })

          resolve(results)
        } catch (error) {
          reject(error)
        }
      },
      this.taskContext
    )
  }

  async clear(): Promise<void> {
    return this.transactionManager.queueTask<void>(async (ctx, resolve, reject) => {
      try {
        const objectStore = ctx.tx.objectStore(this.name)
        await RequestHelper.clear(objectStore)

        ctx.onDidCommit.push(() => {
          this.eventEmitter.emit("clear", null)
        })

        resolve()
      } catch (error) {
        reject(error)
      }
    }, this.taskContext)
  }

  // =============================================================================
  // Query Operations
  // =============================================================================

  async find<Options extends FindOptions<R, T>>(
    predicateOrKey: CollectionKeyPathType<T> | ((item: CollectionRecord<T>) => boolean),
    options?: Options
  ): Promise<RelationResult<T, R, Options> | null> {
    if (typeof predicateOrKey === "function") {
      const [result] = await this.queryExecutor.findByPredicate(
        predicateOrKey,
        { ...options, limit: 1 },
        () => new Promise((resolve) => this.db.getInstance(resolve)),
        this.db.storeNames
      )
      return (result ?? null) as RelationResult<T, R, Options> | null
    }

    return this.queryExecutor.findByKey(
      predicateOrKey,
      options,
      () => new Promise((resolve) => this.db.getInstance(resolve)),
      this.db.storeNames
    )
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
    return this.queryExecutor.findByPredicate(
      predicate,
      options,
      () => new Promise((resolve) => this.db.getInstance(resolve)),
      this.db.storeNames
    )
  }

  async findManyActive(
    predicate: (item: CollectionRecord<T>) => boolean,
    options?: { limit?: number }
  ): Promise<ActiveRecord<CollectionRecord<T>>[]> {
    const results = await this.findMany(predicate, options)
    return this.activeRecordWrapper.wrapMany(results)
  }

  async all<Options extends FindOptions<R, T>>(
    options?: Options
  ): Promise<RelationResult<T, R, Options>[]> {
    return this.queryExecutor.findAll(
      options,
      () => new Promise((resolve) => this.db.getInstance(resolve)),
      this.db.storeNames
    )
  }

  async allActive(): Promise<ActiveRecord<CollectionRecord<T>>[]> {
    const results = await this.all()
    return this.activeRecordWrapper.wrapMany(results)
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
    }, this.taskContext?.tx)
  }

  async max<U extends CollectionIndexName<T>>(name: U): Promise<CollectionRecord<T> | null> {
    return this.queryExecutor.findByDirection(
      name,
      "prev",
      () => new Promise((resolve) => this.db.getInstance(resolve)),
      this.db.storeNames
    )
  }

  async min<U extends CollectionIndexName<T>>(name: U): Promise<CollectionRecord<T> | null> {
    return this.queryExecutor.findByDirection(
      name,
      "next",
      () => new Promise((resolve) => this.db.getInstance(resolve)),
      this.db.storeNames
    )
  }

  async getIndexRange<U extends CollectionIndexName<T>>(
    name: U,
    keyRange: IDBKeyRange
  ): Promise<CollectionRecord<T>[]> {
    return this.queryExecutor.findByIndex(
      name,
      keyRange,
      undefined,
      () => new Promise((resolve) => this.db.getInstance(resolve)),
      this.db.storeNames
    )
  }

  // =============================================================================
  // Iterator Support
  // =============================================================================

  async *[Symbol.asyncIterator]() {
    const objectStore = await this.getReadonlyObjectStore()
    const request = objectStore.openCursor()
    const iterator = CursorIterator.createAsyncIterator(request, this.deserialize)

    for await (const item of iterator) {
      yield item
    }
  }

  async *iterateIndex<U extends CollectionIndexName<T>>(name: U, keyRange?: IDBKeyRange) {
    const objectStore = await this.getReadonlyObjectStore()
    const request = objectStore.index(name).openCursor(keyRange ?? null)
    const iterator = CursorIterator.createAsyncIterator(request, this.deserialize)

    for await (const item of iterator) {
      yield item
    }
  }

  // =============================================================================
  // Static Methods (for compatibility)
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
      () => cloned.relations,
      ctx.tx
    )

    return cloned
  }

  static init(store: AsyncIDBStore<any, any>, allStores: Record<string, any>) {
    store.initializeComponents(allStores)
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private async getReadonlyObjectStore(): Promise<IDBObjectStore> {
    if (this.taskContext) {
      return this.taskContext.tx.objectStore(this.name)
    }

    const db = await new Promise<IDBDatabase>((res) => this.db.getInstance(res))
    return db.transaction(this.name, "readonly").objectStore(this.name)
  }

  private initializeComponents(allStores: Record<string, any>) {
    this.createRelationsMap(allStores)
    this.initializeForeignKeys(allStores)
  }

  private createRelationsMap(allStores: Record<string, any>) {
    this.relations = Object.entries(this.db.relations).reduce<Record<string, any>>(
      (acc, [_, rels]) => {
        if (!(rels instanceof Relations)) return acc
        if (rels.from !== this.collection) return acc

        for (const relationName in rels.relationsMap) {
          const tgtCollection: AnyCollection = rels.to
          const tgtStore = Object.entries(allStores).find(
            ([_, store]) => store.collection === tgtCollection
          )?.[1]

          if (!tgtStore) continue

          acc[relationName] = {
            other: tgtStore,
            def: rels.relationsMap[relationName],
          }
        }
        return acc
      },
      {}
    )
  }

  private initializeForeignKeys(allStores: Record<string, any>) {
    const storeInfo = Object.fromEntries(
      Object.entries(allStores).map(([name, store]) => [
        name,
        {
          collection: store.collection,
          name: store.name,
          addDownstreamHandler: (handler: any) =>
            store.foreignKeyManager?.addDownstreamHandler(handler),
        },
      ])
    )

    this.foreignKeyManager.initializeForeignKeys(this.collection.foreignKeys, storeInfo)
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
