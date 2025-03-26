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
} from "./types"
import type { AsyncIDB } from "./idb"
import { Collection, $COLLECTION_INTERNAL } from "./collection.js"

export class AsyncIDBStore<
  T extends Collection<Record<string, any>, any, any, CollectionIndex<any>[]>
> {
  name: string
  #eventListeners: { [key: string]: ((data: T[typeof $COLLECTION_INTERNAL]["record"]) => void)[] } =
    {}
  constructor(private db: AsyncIDB, private collection: T, name: string) {
    this.name = name
  }

  static getCollection(store: AsyncIDBStore<any>) {
    return store.collection as Collection<Record<string, any>, any, any, CollectionIndex<any>[]>
  }

  addEventListener(event: CollectionEvent, listener: (data: CollectionRecord<T>) => void) {
    const listeners = (this.#eventListeners[event] ??= [])
    listeners.push(listener)
  }
  removeEventListener(event: CollectionEvent, listener: (data: CollectionRecord<T>) => void) {
    const listeners = this.#eventListeners[event]
    if (!listeners) return
    this.#eventListeners[event] = listeners.filter((l) => l !== listener)
  }

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
  unwrap(
    activeRecord: CollectionRecord<T> | ActiveRecord<CollectionRecord<T>>
  ): CollectionRecord<T> {
    const { save, delete: _del, ...rest } = activeRecord
    return rest
  }

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
  async createActive(data: CollectionDTO<T>) {
    const res = await this.create(data)
    return this.wrap(res)
  }

  update(data: CollectionRecord<T>) {
    data = this.unwrap(data)
    const { update: transformer } = this.collection.transformers
    if (transformer) data = transformer(data)

    return this.queueTask<CollectionRecord<T> | null>((ctx, resolve, reject) => {
      const request = ctx.objectStore.put(data)
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

  clear() {
    return this.queueTask<void>((ctx, resolve, reject) => {
      const request = ctx.objectStore.clear()
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve()
    })
  }

  find(predicateOrKey: CollectionKeyPathType<T> | ((item: CollectionRecord<T>) => boolean)) {
    if (predicateOrKey instanceof Function) {
      return this.findByPredicate(predicateOrKey)
    }
    return this.read(predicateOrKey)
  }
  async findActive(
    predicateOrKey: CollectionKeyPathType<T> | ((item: CollectionRecord<T>) => boolean)
  ) {
    const res = await this.find(predicateOrKey)
    if (res === null) return null
    return this.wrap(res)
  }

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
  async findManyActive(predicate: (item: CollectionRecord<T>) => boolean, limit = Infinity) {
    return (await this.findMany(predicate, limit)).map((item) => this.wrap(item))
  }

  all() {
    return this.queueTask<CollectionRecord<T>[]>((ctx, resolve, reject) => {
      const request = ctx.objectStore.getAll()
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve(request.result)
    })
  }
  async allActive() {
    return (await this.all()).map((item) => this.wrap(item))
  }

  async *[Symbol.asyncIterator]() {
    const db: IDBDatabase = await new Promise(this.db.queueTask)
    const objectStore = db.transaction(this.name, "readonly").objectStore(this.name)

    let resolveQueueBlocker: (value: null) => void
    // create an infinite promise that we can resolve on command to proceed to the next result
    let queueBlocker = new Promise<null>((resolve) => {
      resolveQueueBlocker = resolve
    })
    const resultQueue: Promise<null | CollectionRecord<T>>[] = [queueBlocker]

    const request = objectStore.openCursor()
    let err: Event | undefined
    request.onerror = (e) => (err = e)
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
      if (err) throw err
      if (item === null) continue
      yield item
    }
  }

  count() {
    return this.queueTask<number>((ctx, resolve, reject) => {
      const request = ctx.objectStore.count()
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve(request.result)
    })
  }

  upsert(...data: CollectionRecord<T>[]) {
    return Promise.all(data.map((item) => this.update(item)))
  }

  max<U extends CollectionIndexName<T>>(name: U): Promise<CollectionIndexIDBValidKey<T, U> | null> {
    return this.firstByKeyDirection(name, "prev")
  }

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
        const objectStore = db.transaction(this.name, "readwrite").objectStore(this.name)
        reqHandler({ db, objectStore }, resolve, reject)
      })
    })
  }
}
