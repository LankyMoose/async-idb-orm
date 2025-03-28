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
} from "./types"
import type { AsyncIDB } from "./idb"
import { Collection } from "./collection.js"

/**
 * A utility instance that represents a collection in an IndexedDB database and provides methods for interacting with the collection.
 * @template {Collection} T
 */
export class AsyncIDBStore<
  T extends Collection<Record<string, any>, any, any, CollectionIndex<any>[]>
> {
  #onBeforeCreate: ((
    data: CollectionRecord<T>,
    ctx: TransactionContext,
    errs: Error[]
  ) => Promise<void>)[]
  #onBeforeDelete: ((
    key: CollectionKeyPathType<T>,
    ctx: TransactionContext,
    errs: Error[]
  ) => Promise<void>)[]
  #eventListeners: Record<CollectionEvent, CollectionEventCallback<T>[]>
  #tx?: IDBTransaction
  #dependentStoreNames: Set<string>
  #txScope: Set<string>
  constructor(private db: AsyncIDB<any>, private collection: T, public name: string) {
    this.#onBeforeDelete = []
    this.#onBeforeCreate = []
    this.#eventListeners = {
      write: [],
      delete: [],
      "write|delete": [],
    }
    this.#dependentStoreNames = new Set()
    this.#txScope = new Set([this.name])
  }

  /**
   * @param {CollectionEvent} event The event to listen to. Can be `write`, `delete`, or `write|delete`.
   * @param {(data: CollectionRecord<T>) => void} listener The callback function that will be called when the event is triggered.
   */
  addEventListener(event: CollectionEvent, listener: (data: CollectionRecord<T>) => void) {
    this.#eventListeners[event].push(listener)
  }

  /**
   * @param {CollectionEvent} event The event to listen to. Can be `write`, `delete`, or `write|delete`.
   * @param listener The callback function registered with `addEventListener`.
   */
  removeEventListener(event: CollectionEvent, listener: (data: CollectionRecord<T>) => void) {
    this.#eventListeners[event] = this.#eventListeners[event].filter((l) => l !== listener)
  }

  /**
   * Wrap a record in an active record, enabling the use of the `save` and `delete` methods
   * @param {CollectionRecord<T>} record
   * @returns {ActiveRecord<CollectionRecord<T>>}
   */
  wrap(record: CollectionRecord<T>): ActiveRecord<CollectionRecord<T>> {
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
   * @returns {CollectionRecord<T>}
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
   * @returns {Promise<CollectionRecord<T>>}
   */
  create(data: CollectionDTO<T>) {
    const { create: transformer } = this.collection.transformers
    const { write: serialize } = this.collection.serializationConfig

    data = this.unwrap(data)
    if (transformer) data = transformer(data)

    return this.queueTask<CollectionRecord<T>>(async (ctx, resolve, reject) => {
      if (this.#onBeforeCreate.length) {
        const fkErrs: Error[] = []
        await this.getPreCreationForeignKeyErrors(data, ctx, fkErrs)
        if (fkErrs.length) return reject(fkErrs)
      }

      const request = ctx.objectStore.add(serialize(data))

      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        if (!request.result) return reject(request.error)
        this.emit("write", data)
        this.emit("write|delete", data)
        resolve(data)
      }
    })
  }

  /**
   * Creates a new record in the store, and upgrades it to an active record
   * @param {CollectionDTO<T>} data The data to create a new record with. This will be transformed using the `create` transformer if provided.
   * @returns {Promise<ActiveRecord<CollectionRecord<T>>>}
   */
  async createActive(data: CollectionDTO<T>) {
    const res = await this.create(data)
    return this.wrap(res)
  }

  /**
   *
   * @param {CollectionRecord<T>} record - the record to update. It must contain entries matching the keyPath specified for this store. It will be transformed using the `update` transformer if provided.
   * @returns {Promise<CollectionRecord<T> | null>}
   */
  update(record: CollectionRecord<T>) {
    const { update: transformer } = this.collection.transformers
    const { write: serialize } = this.collection.serializationConfig

    record = this.unwrap(record)
    if (transformer) record = transformer(record)

    return this.queueTask<CollectionRecord<T> | null>(async (ctx, resolve, reject) => {
      if (this.#onBeforeCreate.length) {
        const fkErrs: Error[] = []
        await this.getPreCreationForeignKeyErrors(record, ctx, fkErrs)
        if (fkErrs.length) return reject(fkErrs)
      }

      const request = ctx.objectStore.put(serialize(record))

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
   * Deletes a record based on keyPath or predicate function
   * @param {CollectionKeyPathType<T> | ((item: CollectionRecord<T>) => boolean)} predicateOrKey The keyPath or predicate function
   * @returns {Promise<CollectionRecord<T> | null>}
   */
  async delete(
    predicateOrKey: CollectionKeyPathType<T> | ((item: CollectionRecord<T>) => boolean)
  ) {
    if (predicateOrKey instanceof Function) {
      return this.deleteByPredicate(predicateOrKey)
    }

    const data = await this.read(predicateOrKey)
    if (data === null) return null

    return this.queueTask<CollectionRecord<T> | null>(async (ctx, resolve, reject) => {
      if (this.#onBeforeDelete.length) {
        const key = this.getRecordKey(data)
        const fkErrs: Error[] = []
        await this.getPreDeletionForeignKeyErrors(key, ctx, fkErrs)
        if (fkErrs.length) return reject(fkErrs)
      }
      const request = ctx.objectStore.delete(predicateOrKey as IDBValidKey)
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        this.emit("delete", data)
        this.emit("write|delete", data)
        resolve(data)
      }
    })
  }

  /**
   * Deletes all records in the store
   * @returns {Promise<void>}
   */
  clear() {
    return this.queueTask<void>((ctx, resolve, reject) => {
      const request = ctx.objectStore.clear()
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve()
    })
  }

  /**
   * Finds a record based on keyPath or predicate
   * @param {CollectionKeyPathType<T> | ((item: CollectionRecord<T>) => boolean)} predicateOrKey
   * @returns {Promise<CollectionRecord<T> | null>}
   */
  find(predicateOrKey: CollectionKeyPathType<T> | ((item: CollectionRecord<T>) => boolean)) {
    if (predicateOrKey instanceof Function) {
      return this.findByPredicate(predicateOrKey)
    }
    return this.read(predicateOrKey)
  }

  /**
   * Finds a record based on keyPath or predicate and upgrades it to an active record.
   * @param {CollectionKeyPathType<T> | ((item: CollectionRecord<T>) => boolean)} predicateOrKey
   * @returns {Promise<ActiveRecord<CollectionRecord<T>> | null>}
   */
  async findActive(
    predicateOrKey: CollectionKeyPathType<T> | ((item: CollectionRecord<T>) => boolean)
  ) {
    const res = await this.find(predicateOrKey)
    if (res === null) return null
    return this.wrap(res)
  }

  /**
   * Finds many records based on keyPath or predicate
   * @param {CollectionKeyPathType<T> | ((item: CollectionRecord<T>) => boolean)} predicate
   * @param limit The maximum number of records to return (defaults to `Infinity`)
   * @returns {Promise<CollectionRecord<T>[]>}
   */
  findMany(predicate: (item: CollectionRecord<T>) => boolean, limit = Infinity) {
    const { read: deserialize } = this.collection.serializationConfig
    return this.queueTask<CollectionRecord<T>[]>((ctx, resolve, reject) => {
      const request = ctx.objectStore.openCursor()
      const results: CollectionRecord<T>[] = []
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return resolve(results)

        const value = deserialize(cursor.value)
        if (!predicate(value)) return cursor.continue()

        results.push(value)
        if (results.length >= limit) return resolve(results)

        cursor.continue()
      }
    })
  }

  /**
   * Finds many records based on keyPath or predicate, upgrading them to active records
   * @param {CollectionKeyPathType<T> | ((item: CollectionRecord<T>) => boolean)} predicate
   * @param limit The maximum number of records to return (defaults to `Infinity`)
   * @returns {Promise<CollectionRecord<T>[]>}
   */
  async findManyActive(predicate: (item: CollectionRecord<T>) => boolean, limit = Infinity) {
    return (await this.findMany(predicate, limit)).map((item) => this.wrap(item))
  }

  /**
   * Gets all records in the store
   * @returns {Promise<CollectionRecord<T>[]>}
   */
  all() {
    const { read: deserialize } = this.collection.serializationConfig
    return this.queueTask<CollectionRecord<T>[]>((ctx, resolve, reject) => {
      const request = ctx.objectStore.getAll()
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve(request.result.map(deserialize))
    })
  }

  /**
   * Gets all records in the store, upgrading them to active records
   * @returns {Promise<ActiveRecord<CollectionRecord<T>>[]>}
   */
  async allActive() {
    return (await this.all()).map((item) => this.wrap(item))
  }

  /**
   * Iterates over all records in the store
   */
  async *[Symbol.asyncIterator]() {
    const { read: deserialize } = this.collection.serializationConfig
    const db = await new Promise<IDBDatabase>((res) => this.db.getInstance(res))
    const objectStore: IDBObjectStore = (
      this.#tx ?? db.transaction(this.name, "readonly")
    ).objectStore(this.name)

    let resolveQueueBlocker: (value: null) => void
    // create an infinite promise that we can resolve on command to yield the next result
    let queueBlocker = new Promise<null>((resolve) => {
      resolveQueueBlocker = resolve
    })
    const resultQueue: Promise<null | CollectionRecord<T>>[] = [queueBlocker]

    const request = objectStore.openCursor()
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

    for await (const item of resultQueue) {
      if (item === null) continue
      yield deserialize(item)
    }
  }

  /**
   * Counts the number of records in the store
   * @returns {Promise<number>}
   */
  count() {
    return this.queueTask<number>((ctx, resolve, reject) => {
      const request = ctx.objectStore.count()
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve(request.result)
    })
  }

  /**
   * Upserts many records in the store
   * @param {CollectionRecord<T>[]} data The records to upsert
   * @returns {Promise<void>}
   */
  upsert(...data: CollectionRecord<T>[]) {
    return Promise.all(data.map((item) => this.update(item)))
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

  static getCollection(store: AsyncIDBStore<any>) {
    return store.collection as Collection<Record<string, any>, any, any, CollectionIndex<any>[]>
  }

  static cloneForTransaction(
    tx: IDBTransaction,
    store: AsyncIDBStore<any>,
    eventQueue: Function[]
  ) {
    const cloned = new AsyncIDBStore(store.db, store.collection, store.name)
    cloned.#tx = tx
    cloned.#eventListeners = store.#eventListeners
    cloned.emit = (event, data) => eventQueue.push(() => store.emit(event, data))
    cloned.#onBeforeCreate = store.#onBeforeCreate
    cloned.#onBeforeDelete = store.#onBeforeDelete
    return cloned
  }

  static init(store: AsyncIDBStore<any>) {
    store.initForeignKeys()
  }

  static finalizeDependencies(db: AsyncIDB<any>, store: AsyncIDBStore<any>) {
    const seenNames = new Set<string>([store.name])
    const stack: string[] = [...store.#dependentStoreNames]

    while (stack.length) {
      const name = stack.shift()!
      if (seenNames.has(name)) {
        continue
      }
      store.#txScope.add(name)
      seenNames.add(name)
      stack.push(...db.stores[name].#dependentStoreNames)
    }
  }

  private firstByKeyDirection<U extends CollectionIndexName<T>>(
    name: U,
    direction: "next" | "prev"
  ): Promise<CollectionRecord<T> | null> {
    const { read: deserialize } = this.collection.serializationConfig
    return this.queueTask<CollectionRecord<T> | null>((ctx, resolve, reject) => {
      const request = ctx.objectStore.index(name).openCursor(null, direction)

      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return resolve(null)
        resolve(deserialize(cursor.value))
      }
    })
  }

  private read(id: CollectionKeyPathType<T>) {
    const { read: deserialize } = this.collection.serializationConfig
    return this.queueTask<CollectionRecord<T> | null>((ctx, resolve, reject) => {
      const request = ctx.objectStore.get(id as IDBValidKey)
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        if (!request.result) return resolve(null)
        resolve(deserialize(request.result))
      }
    })
  }

  private deleteByPredicate(predicate: (item: CollectionRecord<T>) => boolean) {
    const { read: deserialize } = this.collection.serializationConfig
    return this.queueTask<CollectionRecord<T> | null>((ctx, resolve, reject) => {
      const request = ctx.objectStore.openCursor()

      request.onerror = (err) => reject(err)
      request.onsuccess = async () => {
        const cursor = request.result
        if (!cursor) return resolve(null)

        const value = deserialize(cursor.value)
        if (!predicate(value)) return cursor.continue()

        if (this.#onBeforeDelete.length) {
          const fkErrs: Error[] = []
          await this.getPreDeletionForeignKeyErrors(
            cursor.key as CollectionKeyPathType<T>,
            ctx,
            fkErrs
          )
          if (fkErrs.length) return reject(fkErrs)
        }

        cursor.delete()
        this.emit("delete", value)
        this.emit("write|delete", value)
        return resolve(value)
      }
    })
  }

  private findByPredicate(predicate: (item: CollectionRecord<T>) => boolean) {
    const { read: deserialize } = this.collection.serializationConfig
    return this.queueTask<CollectionRecord<T> | null>((ctx, resolve, reject) => {
      const request = ctx.objectStore.openCursor()
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return resolve(null)

        const value = deserialize(cursor.value)
        if (!predicate(value)) return cursor.continue()

        resolve(value)
      }
    })
  }

  private emit<U extends CollectionEvent>(evtName: U, data: CollectionRecord<T>) {
    const listeners = this.#eventListeners[evtName] ?? []
    for (const listener of listeners) {
      listener(data)
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
      this.db.getInstance((db) => {
        const tx = this.#tx ?? db.transaction(this.#txScope, "readwrite")
        const objectStore = tx.objectStore(this.name)
        reqHandler({ db, objectStore, tx }, resolve, reject)
      })
    })
  }

  private async getPreDeletionForeignKeyErrors(
    key: CollectionKeyPathType<T>,
    ctx: TransactionContext,
    errs: Error[]
  ): Promise<void> {
    await Promise.all(this.#onBeforeDelete.map((cb) => cb(key, ctx, errs)))
  }

  private async getPreCreationForeignKeyErrors(
    record: CollectionRecord<T>,
    ctx: TransactionContext,
    errs: Error[]
  ): Promise<void> {
    await Promise.all(this.#onBeforeCreate.map((cb) => cb(record, ctx, errs)))
  }

  private initForeignKeys() {
    if (!this.collection.foreignKeys.length) {
      return
    }

    this.#onBeforeCreate.push(async (record, { tx }, errs) => {
      // ensure all fkeys point to valid records
      await Promise.all(
        this.collection.foreignKeys.map(
          ({ ref, collection }) =>
            new Promise<void>((resolve) => {
              const [name] = Object.entries(this.db.stores).find(
                ([, s]) => s.collection === collection
              )!
              const objectStore = tx.objectStore(name)
              const key = record[ref]
              const request = objectStore.get(key)
              request.onerror = (e) => {
                tx.abort()
                const err = new Error(
                  `[async-idb-orm]: An error occurred while applying FK ${this.name}:${ref} (${key})`
                )
                err.cause = e
                errs.push(err)
                resolve()
              }
              request.onsuccess = () => {
                if (!request.result) {
                  const err = new Error(
                    `[async-idb-orm]: Foreign key invalid: missing FK reference ${this.name}:${ref} (${key})`
                  )
                  errs.push(err)
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
      store.#dependentStoreNames.add(this.name)
      this.#dependentStoreNames.add(name)

      const deserialize = (store.collection as Collection<T>).serializationConfig.read as (
        data: any
      ) => CollectionRecord<T>
      const serialize = (store.collection as Collection<T>).serializationConfig.write as (
        data: CollectionRecord<T>
      ) => any

      switch (onDelete) {
        case "cascade":
          store.#onBeforeDelete.push((key, ctx, errs) => {
            return new Promise<void>((resolve) => {
              const tx = ctx.tx
              const objectStore = tx.objectStore(this.name)
              const request = objectStore.openCursor()
              request.onerror = (err) => {
                ctx.tx.abort()
                const e = new Error(
                  "[async-idb-orm]: An error occurred while applying FK -> cascade delete"
                )
                e.cause = err
                errs.push(e)
                resolve()
              }
              const cascadeDelete = async () => {
                const cursor = request.result
                if (!cursor) return resolve()

                const value = deserialize(cursor.value)

                if (value[field] === key) {
                  const dependentErrs: Error[] = []
                  await this.getPreDeletionForeignKeyErrors(
                    this.getRecordKey(value),
                    ctx,
                    dependentErrs
                  )
                  if (dependentErrs.length) {
                    ctx.tx.abort()
                    return resolve()
                  }
                  cursor.delete()
                }
                cursor.continue()
              }
              request.onsuccess = cascadeDelete
            })
          })
          break
        case "restrict":
          store.#onBeforeDelete.push((key, ctx, errs) => {
            return new Promise<void>((resolve) => {
              const tx = ctx.tx
              const objectStore = tx.objectStore(this.name)
              const request = objectStore.openCursor()
              request.onerror = (err) => {
                ctx.tx.abort()
                const e = new Error(
                  "[async-idb-orm]: An error occurred while enforcing FK -> delete restriction"
                )
                e.cause = err
                errs.push(e)
                resolve()
              }
              const ensureNoReference = async () => {
                const cursor = request.result
                if (!cursor) return resolve()

                const value = deserialize(cursor.value)

                if (value[field] === key) {
                  ctx.tx.abort()
                  errs.push(
                    new Error(
                      `[async-idb-orm]: Failed to delete record in collection ${name} because it is referenced by another record in collection ${this.name}`
                    )
                  )
                  return resolve()
                }
                const dependentErrs: Error[] = []
                await this.getPreDeletionForeignKeyErrors(
                  this.getRecordKey(value),
                  ctx,
                  dependentErrs
                )
                if (dependentErrs.length) {
                  ctx.tx.abort()
                  return resolve()
                }
                cursor.continue()
              }
              request.onsuccess = ensureNoReference
            })
          })
          break
        case "set null":
          store.#onBeforeDelete.push((key, ctx, errs) => {
            return new Promise<void>((resolve) => {
              const tx = ctx.tx
              const objectStore = tx.objectStore(this.name)
              const request = objectStore.openCursor()
              request.onerror = (err) => {
                ctx.tx.abort()
                errs.push(new Error(err as any))
                resolve()
              }
              const setNull = () => {
                const cursor = request.result
                if (!cursor) return resolve()

                const value = deserialize(cursor.value)
                if (value[field] !== key) return cursor.continue()

                const updateReq = cursor.update(serialize({ ...value, [field]: null }))
                updateReq.onerror = (err) => {
                  ctx.tx.abort()
                  errs.push(new Error(err as any))
                  resolve()
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
}
