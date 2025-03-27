//scan for multiple in range - https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/getKey

import type {
  CollectionIndex,
  CollectionEvent,
  CollectionRecord,
  CollectionDTO,
  CollectionKeyPathType,
  CollectionIndexName,
  CollectionIndexIDBValidKey,
  ActiveRecord,
  ActiveRecordMethods,
  CollectionEventCallback,
} from "./types"
import type { AsyncIDB } from "./idb"
import { Collection, $COLLECTION_INTERNAL } from "./collection.js"

/**
 * A utility instance that represents a collection in an IndexedDB database and provides methods for interacting with the collection.
 * @template {Collection} T
 */
export class AsyncIDBStore<
  T extends Collection<Record<string, any>, any, any, CollectionIndex<any>[]>
> {
  #eventListeners: Record<CollectionEvent, CollectionEventCallback<T>[]> = {
    write: [],
    delete: [],
    "write|delete": [],
  }
  #tx: IDBTransaction | null = null
  constructor(private db: AsyncIDB, private collection: T, public name: string) {}

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
    return cloned
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
    data = this.unwrap(data)
    const { create: transformer } = this.collection.transformers
    if (transformer) data = transformer(data)

    return this.queueTask<CollectionRecord<T>>((ctx, resolve, reject) => {
      const request = ctx.objectStore.add(data)
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        this.read(request.result as CollectionKeyPathType<T>).then((data) => {
          this.emit("write", data!)
          this.emit("write|delete", data!)
          resolve(data!)
        })
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
    record = this.unwrap(record)
    const { update: transformer } = this.collection.transformers
    if (transformer) record = transformer(record)

    return this.queueTask<CollectionRecord<T> | null>((ctx, resolve, reject) => {
      const request = ctx.objectStore.put(record)
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        this.read(request.result as CollectionKeyPathType<T>).then((data) => {
          if (data === null) return resolve(null)
          this.emit("write", data)
          this.emit("write|delete", data)
          resolve(data)
        })
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
    return this.queueTask<CollectionRecord<T> | null>((ctx, resolve, reject) => {
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
    return this.queueTask<CollectionRecord<T>[]>((ctx, resolve, reject) => {
      const request = ctx.objectStore.openCursor()
      const results: CollectionRecord<T>[] = []
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return resolve(results)
        if (predicate(cursor.value)) {
          results.push(cursor.value)
          if (results.length >= limit) return resolve(results)
        }
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
    return this.queueTask<CollectionRecord<T>[]>((ctx, resolve, reject) => {
      const request = ctx.objectStore.getAll()
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve(request.result)
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
    const db = await new Promise<IDBDatabase>((res) => this.db.queueTask(res))
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
      yield item
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
   * @param {CollectionIndexName<T>} name The name of the index to get the first record from
   * @returns {Promise<CollectionIndexIDBValidKey<T, U> | null>} The last record in the index, or null if the index is empty
   */
  max<U extends CollectionIndexName<T>>(name: U): Promise<CollectionIndexIDBValidKey<T, U> | null> {
    return this.firstByKeyDirection(name, "prev")
  }

  /**
   * Gets the first record in an index
   * @param {CollectionIndexName<T>} name The name of the index to get the first record from
   * @returns {Promise<CollectionIndexIDBValidKey<T, U> | null>} The first record in the index, or null if the index is empty
   */
  min<U extends CollectionIndexName<T>>(name: U): Promise<CollectionIndexIDBValidKey<T, U> | null> {
    return this.firstByKeyDirection(name, "next")
  }

  private firstByKeyDirection<U extends CollectionIndexName<T>>(
    name: U,
    direction: "next" | "prev"
  ): Promise<CollectionIndexIDBValidKey<T, U> | null> {
    return this.queueTask<CollectionIndexIDBValidKey<T, U> | null>((ctx, resolve, reject) => {
      const request = ctx.objectStore.index(name).openCursor(null, direction)

      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return resolve(null)
        resolve(cursor.key as CollectionIndexIDBValidKey<T, U>)
      }
    })
  }

  private read(id: CollectionKeyPathType<T>) {
    return this.queueTask<CollectionRecord<T> | null>((ctx, resolve, reject) => {
      const request = ctx.objectStore.get(id as IDBValidKey)
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve(request.result ?? null)
    })
  }

  private deleteByPredicate(predicate: (item: CollectionRecord<T>) => boolean) {
    return this.queueTask<CollectionRecord<T> | null>((ctx, resolve, reject) => {
      const request = ctx.objectStore.openCursor()
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return resolve(null)
        if (predicate(cursor.value)) {
          cursor.delete()
          return resolve(cursor.value)
        }
        cursor.continue()
      }
    })
  }

  private findByPredicate(predicate: (item: CollectionRecord<T>) => boolean) {
    return this.queueTask<CollectionRecord<T> | null>((ctx, resolve, reject) => {
      const request = ctx.objectStore.openCursor()
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return resolve(null)
        if (predicate(cursor.value)) {
          resolve(cursor.value)
        }
        cursor.continue()
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
      ctx: { db: IDBDatabase; objectStore: IDBObjectStore },
      resolve: (value: T) => void,
      reject: (reason?: any) => void
    ) => void
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.db.queueTask((db) => {
        const objectStore = (this.#tx ?? db.transaction(this.name, "readwrite")).objectStore(
          this.name
        )
        reqHandler({ db, objectStore }, resolve, reject)
      })
    })
  }
}
