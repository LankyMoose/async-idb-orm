//scan for multiple in range - https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/getKey

import type {
  CollectionIndex,
  CollectionEvent,
  CollectionRecord,
  CollectionDTO,
  CollectionKeyPathType,
  CollectionIndexName,
  ActiveRecord,
  ActiveRecordMethods,
  CollectionEventCallback,
  TransactionContext,
  RelationsSchema,
  FindOptions,
  RelationResult,
  AnyCollection,
} from "./types"
import type { AsyncIDB } from "./idb"
import { Collection } from "./builders/collection.js"
import { RelationDefinition, Relations } from "./builders/relations.js"
import { BroadcastChannelMessage, MSG_TYPES } from "./broadcastChannel.js"
import { viewStoreObservations } from "./idbView.js"

type StoreRelation = {
  other: AsyncIDBStore<any, any>
  def: RelationDefinition<any, any>
}

const $UPSERT_SENTINEL = Symbol.for("upsert")

/**
 * A utility instance that represents a collection in an IndexedDB database and provides methods for interacting with the collection.
 * @template {Collection} T
 */
export class AsyncIDBStore<
  T extends Collection<Record<string, any>, any, any, CollectionIndex<any>[], any>,
  R extends RelationsSchema
> {
  #isRelaying: boolean
  #relations: Record<string, StoreRelation>
  #upstreamForeignKeyCallbacks: ((
    data: CollectionRecord<T>,
    ctx: TransactionContext
  ) => Promise<void[]>)[]
  #downstreamForeignKeyCallbacks: ((
    key: CollectionKeyPathType<T>,
    ctx: TransactionContext
  ) => Promise<void>)[]
  #eventListeners: Record<CollectionEvent, CollectionEventCallback<T, CollectionEvent>[]>
  #tx?: IDBTransaction
  #serialize: (record: CollectionRecord<T>) => any
  #deserialize: (record: any) => CollectionRecord<T>
  constructor(private db: AsyncIDB<any, any, any>, private collection: T, public name: string) {
    this.#isRelaying = false
    this.#relations = {}
    this.#downstreamForeignKeyCallbacks = []
    this.#upstreamForeignKeyCallbacks = []
    this.#eventListeners = {
      write: [],
      delete: [],
      "write|delete": [],
      clear: [],
    }
    const { read, write } = collection.serializationConfig
    this.#serialize = write
    this.#deserialize = read
  }

  /**
   * @template {CollectionEvent} Evt
   * @param {Evt} event The event to listen to. Can be `write`, `delete`, or `write|delete`.
   * @param {CollectionEventCallback<T, Evt>} listener The callback function that will be called when the event is triggered.
   */
  addEventListener<Evt extends CollectionEvent>(
    event: Evt,
    listener: CollectionEventCallback<T, Evt>
  ): void {
    this.#eventListeners[event].push(listener)
  }

  /**
   * @template {CollectionEvent} Evt
   * @param {Evt} event The event to listen to. Can be `write`, `delete`, or `write|delete`.
   * @param {CollectionEventCallback<T, Evt>} listener The callback function registered with `addEventListener`.
   */
  removeEventListener<Evt extends CollectionEvent>(
    event: Evt,
    listener: CollectionEventCallback<T, Evt>
  ): void {
    this.#eventListeners[event] = this.#eventListeners[event].filter((l) => l !== listener)
  }

  /**
   * Wrap a record in an active record, enabling the use of the `save` and `delete` methods
   * @param {CollectionRecord<T>} record
   */
  wrap(record: CollectionRecord<T>): ActiveRecord<CollectionRecord<T>> {
    this.assertNoRelations(record, "wrap")
    return Object.assign<CollectionRecord<T>, ActiveRecordMethods<CollectionRecord<T>>>(record, {
      save: async () => {
        const res = await this.update(record)
        if (res === null) throw new Error("[async-idb-orm]: record not found")
        return this.wrap(res)
      },
      delete: async () => {
        const key = this.getRecordKey(record)
        await this.delete(key)
      },
    })
  }

  /**
   * Unwrap an active record, removing the `save` and `delete` methods
   * @param {CollectionRecord<T> | ActiveRecord<CollectionRecord<T>>} activeRecord - The record to unwrap
   */
  unwrap(
    activeRecord: CollectionRecord<T> | ActiveRecord<CollectionRecord<T>>
  ): CollectionRecord<T> {
    const { save, delete: _del, ...rest } = activeRecord
    return rest
  }

  /**
   * Creates a new record in the store
   * @param {CollectionDTO<T>} data - The data to create a new record with. This will be transformed using the `create` transformer if provided.
   */
  create(data: CollectionDTO<T>): Promise<CollectionRecord<T>> {
    const { create: transformer } = this.collection.transformers
    data = this.unwrap(data)
    transformer && (data = transformer(data))

    return this.queueTask<CollectionRecord<T>>(async (ctx, resolve, reject) => {
      const serialized = this.#serialize(data)
      if (this.#upstreamForeignKeyCallbacks.length) {
        await this.checkUpstreamForeignKeys(serialized, ctx).catch(reject)
      }

      const request = ctx.objectStore.add(serialized)

      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        if (request.result === undefined) return reject(request.error)
        const res = !this.collection.idMode
          ? data
          : { ...data, [this.collection.keyPath]: request.result }
        this.emit("write", res)
        this.emit("write|delete", res)
        resolve(res)
      }
    })
  }

  /**
   * Creates a new record in the store, and upgrades it to an active record
   * @param {CollectionDTO<T>} data The data to create a new record with. This will be transformed using the `create` transformer if provided.
   */
  async createActive(data: CollectionDTO<T>): Promise<ActiveRecord<CollectionRecord<T>>> {
    const res = await this.create(data)
    return this.wrap(res)
  }

  /**
   * Finds a record based on keyPath or predicate
   * @param {CollectionKeyPathType<T> | ((item: CollectionRecord<T>) => boolean)} predicateOrKey
   * @param {FindOptions<R, string>} [options] - Options for finding with relations
   */
  find<Options extends FindOptions<R, T>>(
    predicateOrKey: CollectionKeyPathType<T> | ((item: CollectionRecord<T>) => boolean),
    options?: Options
  ): Promise<RelationResult<T, R, Options> | null> {
    return new Promise<RelationResult<T, R, Options> | null>((resolve, reject) => {
      this.db.getInstance((db) => {
        const queryCtx = new RelationalQueryContext(db, this.#tx)
        if (typeof predicateOrKey === "function") {
          queryCtx
            .findByPredicate<T, R, this, Options>(this, predicateOrKey, options, 1)
            .then((res) => resolve(res[0] ?? null), reject)
        } else {
          queryCtx
            .findByKey<T, R, this, Options>(this, predicateOrKey, options)
            .then(resolve, reject)
        }
      })
    })
  }

  /**
   * Finds a record based on keyPath or predicate and upgrades it to an active record.
   */
  async findActive(
    predicateOrKey: CollectionKeyPathType<T> | ((item: CollectionRecord<T>) => boolean) // asdasd
  ): Promise<ActiveRecord<CollectionRecord<T>> | null> {
    const res = await this.find(predicateOrKey)
    if (res === null) return null
    return this.wrap(res)
  }

  /**
   * Finds many records based on keyPath or predicate
   */
  async findMany<Options extends FindOptions<R, T>>(
    predicate: (item: CollectionRecord<T>) => boolean,
    options?: Options & { limit?: number }
  ): Promise<RelationResult<T, R, Options>[]> {
    const limit = options?.limit || Infinity
    return new Promise<RelationResult<T, R, Options>[]>((resolve, reject) => {
      this.db.getInstance((db) => {
        const queryCtx = new RelationalQueryContext(db, this.#tx)
        queryCtx
          .findByPredicate<T, R, this, Options>(this, predicate, options, limit)
          .then(resolve, reject)
      })
    })
  }

  /**
   * Finds many records based on predicate, upgrading them to active records
   */
  async findManyActive(
    predicate: (item: CollectionRecord<T>) => boolean,
    options?: {
      limit?: number
    }
  ): Promise<CollectionRecord<T>[]> {
    return (await this.findMany(predicate, options)).map((item) => this.wrap(item))
  }

  /**
   * Gets all records in the store
   */
  all<Options extends FindOptions<R, T>>(
    options?: Options
  ): Promise<RelationResult<T, R, Options>[]> {
    return new Promise<RelationResult<T, R, Options>[]>((resolve, reject) => {
      this.db.getInstance((db) => {
        new RelationalQueryContext(db, this.#tx)
          .findAll<T, R, this, Options>(this, options)
          .then(resolve, reject)
      })
    })
  }

  /**
   * Gets all records in the store, upgrading them to active records
   */
  async allActive(): Promise<ActiveRecord<CollectionRecord<T>>[]> {
    return (await this.all()).map((item) => this.wrap(item))
  }

  /**
   * Updates a record
   */
  async update(record: CollectionRecord<T>): Promise<CollectionRecord<T>> {
    this.assertNoRelations(record, "update")

    const key = this.getRecordKey(record)
    const exists = key !== undefined && (await this.exists(key))
    if (!exists && arguments[1] !== $UPSERT_SENTINEL) {
      throw new Error(
        `[async-idb-orm]: record in collection ${this.name} with key ${key} not found.`
      )
    }

    const { create, update } = this.collection.transformers
    const transformer = exists ? update : create
    record = this.unwrap(record)
    transformer && (record = transformer(record))
    const serialized = this.#serialize(record)

    return this.queueTask<CollectionRecord<T>>(async (ctx, resolve, reject) => {
      if (this.#upstreamForeignKeyCallbacks.length) {
        await this.checkUpstreamForeignKeys(serialized, ctx).catch(reject)
      }

      const request = ctx.objectStore.put(serialized)

      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        if (!request.result) return reject(request.error)
        this.emit("write", record)
        this.emit("write|delete", record)
        resolve(record)
      }
    })
  }

  /**
   * Upserts many records in the store
   * @param {(CollectionRecord<T> | CollectionDTO<T>)[]} data The records to upsert
   */
  upsert(...data: (CollectionRecord<T> | CollectionDTO<T>)[]) {
    // @ts-expect-error we're passing an extra argument to `update` for the `upsert` flag
    return Promise.all(data.map((item) => this.update(item, $UPSERT_SENTINEL)))
  }

  /**
   * Deletes a record based on keyPath or predicate function
   * @param {CollectionKeyPathType<T> | ((item: CollectionRecord<T>) => boolean)} predicateOrKey The keyPath or predicate function
   */
  async delete(
    predicateOrKey: CollectionKeyPathType<T> | ((item: CollectionRecord<T>) => boolean)
  ) {
    if (typeof predicateOrKey === "function") {
      const [deleted] = await this.deleteMany(predicateOrKey, 1)
      return deleted ?? null
    }

    return this.queueTask<CollectionRecord<T> | null>(async (ctx, resolve, reject) => {
      const record = await new Promise<CollectionRecord<T> | null>((resolve, reject) => {
        const request = ctx.objectStore.get(predicateOrKey)
        request.onerror = (err) => reject(err)
        request.onsuccess = () => {
          if (!request.result) return resolve(null)
          resolve(this.#deserialize(request.result))
        }
      })
      if (record === null) return resolve(null)

      if (this.#downstreamForeignKeyCallbacks.length) {
        await this.checkDownstreamForeignKeys(predicateOrKey, ctx).catch(reject)
      }
      const request = ctx.objectStore.delete(predicateOrKey)
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        this.emit("delete", record)
        this.emit("write|delete", record)
        resolve(record)
      }
    })
  }

  /**
   * Deletes many records based on predicate function
   * @param {(item: CollectionRecord<T>) => boolean} predicate
   * @param {number} [limit] The maximum number of records to delete (defaults to `Infinity`)
   */
  deleteMany(
    predicate: (item: CollectionRecord<T>) => boolean,
    limit: number = Infinity
  ): Promise<CollectionRecord<T>[]> {
    return this.queueTask<CollectionRecord<T>[]>((ctx, resolve, reject) => {
      const request = ctx.objectStore.openCursor()
      const results: CollectionRecord<T>[] = []
      request.onerror = (err) => reject(err)
      request.onsuccess = async () => {
        const cursor = request.result
        if (!cursor) return resolve(results)

        const record = this.#deserialize(cursor.value)
        if (!predicate(record)) return cursor.continue()

        if (this.#downstreamForeignKeyCallbacks.length) {
          await this.checkDownstreamForeignKeys(cursor.key as CollectionKeyPathType<T>, ctx).catch(
            reject
          )
        }

        const deleteRequest = cursor.delete()
        deleteRequest.onerror = (err) => reject(err)
        deleteRequest.onsuccess = () => {
          this.emit("delete", record)
          this.emit("write|delete", record)
          results.push(record)
          if (--limit) {
            return cursor.continue()
          }
          return resolve(results)
        }
      }
    })
  }

  /**
   * Deletes all records in the store. Use with caution: **this method is not foreign key aware**
   */
  clear(): Promise<void> {
    return this.queueTask<void>((ctx, resolve, reject) => {
      const request = ctx.objectStore.clear()
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        this.emit("clear", null)
        resolve()
      }
    })
  }

  /**
   * Iterates over all records in the store
   */
  async *[Symbol.asyncIterator]() {
    let objectStore: IDBObjectStore
    if (this.#tx) {
      objectStore = this.#tx.objectStore(this.name)
    } else {
      const db = await new Promise<IDBDatabase>((res) => this.db.getInstance(res))
      objectStore = db.transaction(this.name, "readonly").objectStore(this.name)
    }
    const request = objectStore.openCursor()
    const resultQueue = this.createLazyIterator<CollectionRecord<T>>(request)
    for await (const item of resultQueue) {
      if (item === null) continue
      yield this.#deserialize(item)
    }
  }

  /**
   * Counts the number of records in the store
   */
  count(): Promise<number> {
    return this.queueTask<number>((ctx, resolve, reject) => {
      const request = ctx.objectStore.count()
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve(request.result)
    })
  }

  /**
   * Gets the last record in an index
   * @param {CollectionIndexName<T>} name The name of the index to query the record by
   * @returns {Promise<CollectionRecord<T, U> | null>} The last record in the index, or null if the index is empty
   */
  max<U extends CollectionIndexName<T>>(name: U): Promise<CollectionRecord<T> | null> {
    return this.firstByKeyDirection(name, "prev")
  }

  /**
   * Gets the first record in an index
   * @param {CollectionIndexName<T>} name The name of the index to query the record by
   * @returns {Promise<CollectionRecord<T> | null>} The first record in the index, or null if the index is empty
   */
  min<U extends CollectionIndexName<T>>(name: U): Promise<CollectionRecord<T> | null> {
    return this.firstByKeyDirection(name, "next")
  }

  /**
   * Iterates over all records in an index
   * @generator
   */
  async *iterateIndex<U extends CollectionIndexName<T>>(name: U, keyRange?: IDBKeyRange) {
    const db = await new Promise<IDBDatabase>((res) => this.db.getInstance(res))
    const objectStore = db.transaction(this.name, "readonly").objectStore(this.name)
    const request = objectStore.index(name).openCursor(keyRange ?? null)
    const resultQueue = this.createLazyIterator<CollectionRecord<T>>(request)

    for await (const item of resultQueue) {
      if (item === null) continue
      yield this.#deserialize(item)
    }
  }

  /**
   * Gets a range of records from an index
   */
  async getIndexRange<U extends CollectionIndexName<T>>(
    name: U,
    keyRange: IDBKeyRange
  ): Promise<CollectionRecord<T>[]> {
    return this.queueTask<CollectionRecord<T>[]>((ctx, resolve, reject) => {
      const request = ctx.objectStore.index(name).openCursor(keyRange)
      const results: CollectionRecord<T>[] = []
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return resolve(results)

        const value = this.#deserialize(cursor.value)
        results.push(value)
        cursor.continue()
      }
    })
  }

  static relay<U extends CollectionEvent>(
    store: AsyncIDBStore<any, any>,
    evtName: U,
    data: U extends "clear" ? null : CollectionRecord<any>
  ) {
    store.#isRelaying = true
    store.emit(evtName, data)
    store.#isRelaying = false
  }

  static getCollection(store: AsyncIDBStore<any, any>) {
    return store.collection as AnyCollection
  }

  static getRelations(store: AsyncIDBStore<any, any>) {
    return store.#relations
  }

  static cloneForTransaction(
    tx: IDBTransaction,
    store: AsyncIDBStore<any, any>,
    eventQueue: Function[]
  ) {
    const cloned = new AsyncIDBStore(store.db, store.collection, store.name)
    cloned.#tx = tx
    cloned.#eventListeners = store.#eventListeners
    cloned.emit = (event, data) => eventQueue.push(() => store.emit(event, data))
    cloned.#upstreamForeignKeyCallbacks = store.#upstreamForeignKeyCallbacks
    cloned.#downstreamForeignKeyCallbacks = store.#downstreamForeignKeyCallbacks
    cloned.#relations = store.#relations
    return cloned
  }

  static init(store: AsyncIDBStore<any, any>) {
    store.initForeignKeys()
    store.cacheRelations()
  }

  private cacheRelations() {
    this.#relations = Object.entries(this.db.relations).reduce<Record<string, StoreRelation>>(
      (acc, [_, rels]) => {
        if (!(rels instanceof Relations)) return acc
        if (rels.from !== this.collection) return acc

        for (const relationName in rels.relationsMap) {
          const tgtCollection: AnyCollection = rels.to
          const tgtStore = Object.entries(this.db.stores).find(
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

  private firstByKeyDirection<U extends CollectionIndexName<T>>(
    name: U,
    direction: "next" | "prev"
  ): Promise<CollectionRecord<T> | null> {
    return this.queueTask<CollectionRecord<T> | null>((ctx, resolve, reject) => {
      const request = ctx.objectStore.index(name).openCursor(null, direction)
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return resolve(null)
        resolve(this.#deserialize(cursor.value))
      }
    })
  }

  private exists(id: CollectionKeyPathType<T>) {
    return this.queueTask<boolean>((ctx, resolve, reject) => {
      const request = ctx.objectStore.getKey(id as IDBValidKey)
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve(request.result === id)
    })
  }

  private emit<U extends CollectionEvent>(
    evtName: U,
    data: U extends "clear" ? null : CollectionRecord<T>
  ) {
    const listeners = this.#eventListeners[evtName] ?? []
    for (const listener of listeners) {
      listener(data as any)
    }
    if (!this.#isRelaying && this.db.relayEnabled) {
      this.db.bc.postMessage({
        type: MSG_TYPES.RELAY,
        name: this.name,
        event: evtName,
        data,
      } satisfies BroadcastChannelMessage)
    }
  }

  private getRecordKey(record: CollectionRecord<T>): CollectionKeyPathType<T> {
    const keyPath = this.collection.keyPath as IDBValidKey
    if (Array.isArray(keyPath)) {
      return keyPath.map((key) => record[key as string]) as CollectionKeyPathType<T>
    }
    return record[keyPath as string]
  }

  private queueTask<T>(
    reqHandler: (
      ctx: { db: IDBDatabase; objectStore: IDBObjectStore; tx: IDBTransaction },
      resolve: (value: T) => void,
      reject: (reason?: any) => void
    ) => void
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const tx = this.#tx
      if (tx) {
        return reqHandler(
          { db: tx.db, objectStore: tx.objectStore(this.name), tx },
          resolve,
          reject
        )
      }
      this.db.getInstance((db) => {
        const tx = db.transaction(this.db.storeNames, "readwrite")
        const objectStore = tx.objectStore(this.name)
        reqHandler({ db, objectStore, tx }, resolve, reject)
      })
    })
  }

  private createLazyIterator<T>(request: IDBRequest<IDBCursorWithValue | null>) {
    let resolveQueueBlocker: (value: null) => void
    // create an infinite promise that we can resolve on command to yield the next result
    let queueBlocker = new Promise<null>((resolve) => {
      resolveQueueBlocker = resolve
    })
    const resultQueue: Promise<null | T>[] = [queueBlocker]

    request.onerror = (e) => {
      resolveQueueBlocker(null)
      throw e
    }
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return resolveQueueBlocker(null)
      resultQueue.push(cursor.value)
      resolveQueueBlocker(null) // unblock to allow resolving of this record

      // reblock until next record
      queueBlocker = new Promise((resolve) => {
        resolveQueueBlocker = resolve
      })
      resultQueue.push(queueBlocker)
      cursor.continue()
    }

    return resultQueue
  }

  private checkDownstreamForeignKeys(
    key: CollectionKeyPathType<T>,
    ctx: TransactionContext
  ): Promise<void[]> {
    return Promise.all(this.#downstreamForeignKeyCallbacks.map((cb) => cb(key, ctx)))
  }

  private checkUpstreamForeignKeys(
    record: CollectionRecord<T>,
    ctx: TransactionContext
  ): Promise<void[][]> {
    return Promise.all(this.#upstreamForeignKeyCallbacks.map((cb) => cb(record, ctx)))
  }

  private initForeignKeys() {
    if (!this.collection.foreignKeys.length) {
      return
    }

    this.#upstreamForeignKeyCallbacks.push(async (record, { tx }) => {
      // ensure all fkeys point to valid records
      return Promise.all(
        this.collection.foreignKeys.map(
          ({ ref, collection }) =>
            new Promise<void>((resolve, reject) => {
              const [name] = Object.entries(this.db.stores).find(
                ([, s]) => s.collection === collection
              )!
              const objectStore = tx.objectStore(name)
              const key = record[ref]
              const request = objectStore.get(key)
              request.onerror = (e) => {
                reject(
                  new Error(
                    `[async-idb-orm]: An error occurred while applying FK ${this.name}:${ref} (${key})`,
                    { cause: e }
                  )
                )
              }
              request.onsuccess = () => {
                if (!request.result) {
                  reject(
                    new Error(
                      `[async-idb-orm]: Foreign key invalid: missing FK reference ${this.name}:${ref} (${key})`
                    )
                  )
                }
                resolve()
              }
            })
        )
      )
    })

    for (const { ref: field, collection, onDelete } of this.collection.foreignKeys) {
      const [name, store] = Object.entries(this.db.stores).find(
        ([, s]) => s.collection === collection
      )!

      switch (onDelete) {
        case "cascade":
          store.#downstreamForeignKeyCallbacks.push((key, ctx) => {
            return new Promise<void>((resolve, reject) => {
              const tx = ctx.tx
              const objectStore = tx.objectStore(this.name)
              const request = objectStore.openCursor()
              request.onerror = (err) => {
                reject(
                  new Error(
                    "[async-idb-orm]: An error occurred while applying FK -> cascade delete",
                    { cause: err }
                  )
                )
              }
              const cascadeDelete = async () => {
                const cursor = request.result
                if (!cursor) return resolve()

                if (cursor.value[field] === key) {
                  await this.checkDownstreamForeignKeys(this.getRecordKey(cursor.value), ctx).catch(
                    reject
                  )
                  cursor.delete()
                }
                cursor.continue()
              }
              request.onsuccess = cascadeDelete
            })
          })
          break
        case "restrict":
          store.#downstreamForeignKeyCallbacks.push((key, ctx) => {
            return new Promise<void>((resolve, reject) => {
              const tx = ctx.tx
              const objectStore = tx.objectStore(this.name)
              const request = objectStore.openCursor()
              request.onerror = (err) => {
                reject(
                  new Error(
                    "[async-idb-orm]: An error occurred while enforcing FK -> delete restriction",
                    { cause: err }
                  )
                )
              }
              const ensureNoReference = async () => {
                const cursor = request.result
                if (!cursor) return resolve()

                if (cursor.value[field] === key) {
                  reject(
                    new Error(
                      `[async-idb-orm]: Failed to delete record in collection ${name} because it is referenced by another record in collection ${this.name}`
                    )
                  )
                }
                cursor.continue()
              }
              request.onsuccess = ensureNoReference
            })
          })
          break
        case "set null":
          store.#downstreamForeignKeyCallbacks.push((key, ctx) => {
            return new Promise<void>((resolve, reject) => {
              const tx = ctx.tx
              const objectStore = tx.objectStore(this.name)
              const request = objectStore.openCursor()
              request.onerror = (err) => {
                reject(new Error(err as any))
              }
              const setNull = () => {
                const cursor = request.result
                if (!cursor) return resolve()

                if (cursor.value[field] !== key) return cursor.continue()

                const updateReq = cursor.update({ ...cursor.value, [field]: null })
                updateReq.onerror = (err) => {
                  reject(new Error(err as any))
                }
                updateReq.onsuccess = () => cursor.continue()
              }
              request.onsuccess = setNull
            })
          })
          break
        default:
          break
      }
    }
  }

  private assertNoRelations(record: CollectionRecord<T>, action: string) {
    for (const relationName in this.#relations) {
      if (relationName in record) {
        throw new Error(`[async-idb-orm]: unable to ${action} record with relation ${relationName}`)
      }
    }
  }
}

class RelationalQueryContext {
  tx: IDBTransaction
  constructor(public db: IDBDatabase, tx?: IDBTransaction) {
    this.tx = tx ?? this.db.transaction(this.db.objectStoreNames, "readonly")
  }

  async findAll<
    T extends AnyCollection,
    R extends RelationsSchema,
    Store extends AsyncIDBStore<T, R>,
    Options extends FindOptions<R, T>
  >(store: Store, options?: Options): Promise<RelationResult<T, R, Options>[]> {
    if (viewStoreObservations.enabled) viewStoreObservations.observed.add(store.name)

    const { read: deserialize } = AsyncIDBStore.getCollection(store).serializationConfig

    return new Promise<RelationResult<T, R, Options>[]>((resolve, reject) => {
      const objectStore = this.tx.objectStore(store.name)
      const request = objectStore.getAll()
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        const deserialized = request.result.map(deserialize) as RelationResult<T, R, Options>[]
        if (options?.with) {
          return Promise.all(
            deserialized.map((item) =>
              this.resolveRelations<T, R, Store>(store, item, options.with!)
            )
          ).then(resolve, reject)
        }

        resolve(deserialized)
      }
    })
  }

  async findByKey<
    T extends AnyCollection,
    R extends RelationsSchema,
    Store extends AsyncIDBStore<T, R>,
    Options extends FindOptions<R, T>
  >(
    store: Store,
    id: CollectionKeyPathType<T>,
    options?: Options
  ): Promise<RelationResult<T, R, Options> | null> {
    if (viewStoreObservations.enabled) viewStoreObservations.observed.add(store.name)

    return new Promise((resolve, reject) => {
      const objectStore = this.tx.objectStore(store.name)
      const request = objectStore.get(id)
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        if (!request.result) {
          return resolve(null)
        }
        const record = AsyncIDBStore.getCollection(store).serializationConfig.read(request.result)

        if (options?.with) {
          return this.resolveRelations<T, R, Store>(store, record, options.with).then(
            resolve,
            reject
          )
        }

        resolve(record)
      }
    })
  }

  async findByPredicate<
    T extends AnyCollection,
    R extends RelationsSchema,
    Store extends AsyncIDBStore<T, R>,
    Options extends FindOptions<R, T>
  >(
    store: Store,
    predicate: (item: CollectionRecord<T>) => boolean,
    options?: Options,
    limit?: number
  ): Promise<RelationResult<T, R, Options>[]> {
    if (viewStoreObservations.enabled) viewStoreObservations.observed.add(store.name)

    limit ||= Infinity
    const { read: deserialize } = AsyncIDBStore.getCollection(store).serializationConfig

    return new Promise<RelationResult<T, R, Options>[]>((_resolve, reject) => {
      const objectStore = this.tx.objectStore(store.name)
      const request = objectStore.openCursor()
      const results: RelationResult<T, R, Options>[] = []

      const resolve = () => {
        if (options?.with) {
          return Promise.all(
            results.map((record) =>
              this.resolveRelations<T, R, Store>(store, record, options.with!)
            )
          ).then(() => _resolve(results))
        }
        _resolve(results)
      }

      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return resolve()

        const value = deserialize(cursor.value)
        if (predicate(value)) {
          results.push(value)
          if (results.length >= limit) return resolve()
        }

        cursor.continue()
      }
    })
  }

  private async resolveRelations<
    T extends AnyCollection,
    R extends RelationsSchema,
    Store extends AsyncIDBStore<T, R>
  >(
    store: Store,
    record: CollectionRecord<T>,
    withOptions: Record<string, boolean | any>
  ): Promise<any> {
    const relations = AsyncIDBStore.getRelations(store)
    await Promise.all(
      Object.entries(withOptions).map(([relationName, options]) =>
        this.fetchRelatedRecords(record, relations[relationName], options).then((result) => {
          ;(record as any)[relationName] = result
        })
      )
    )
    return record
  }

  private async fetchRelatedRecords<T extends AnyCollection>(
    record: CollectionRecord<T>,
    relationDef: StoreRelation,
    options?: {
      limit?: number
      where?: (item: CollectionRecord<T>) => boolean
      with?: Record<string, boolean | any>
    }
  ) {
    const { def, other } = relationDef
    const { type: relationType, from: sourceField, to: targetField } = def
    const sourceValue = record[sourceField]

    const basePredicate = (item: any) => item[targetField] === sourceValue
    const predicate = options?.where
      ? (item: any) => basePredicate(item) && options.where!(item)
      : basePredicate

    if (relationType === "one-to-one") {
      return (await this.findByPredicate(other, predicate, options, 1))[0] ?? null
    } else if (relationType === "one-to-many") {
      return this.findByPredicate(other, predicate, options, options?.limit)
    }

    return relationType === "one-to-many" ? [] : null
  }
}
