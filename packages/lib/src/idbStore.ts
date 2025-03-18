//scan for multiple in range - https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/getKey

import type {
  CollectionIndex,
  CollectionEvent,
  CollectionRecord,
  CollectionDTO,
  CollectionKeyPathType,
  CollectionIndexName,
  CollectionIndexIDBValidKey,
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

  create(data: CollectionDTO<T>) {
    const transformer = this.collection.transformers?.create
    const record = transformer ? transformer(data) : data

    return this.queueTask<CollectionRecord<T>>((ctx, resolve, reject) => {
      const request = ctx.objectStore.add(record)
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

  update(data: CollectionRecord<T>) {
    const transformer = this.collection.transformers?.update
    const record = transformer ? transformer(data) : data
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

  all() {
    return this.queueTask<CollectionRecord<T>[]>((ctx, resolve, reject) => {
      const request = ctx.objectStore.getAll()
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve(request.result)
    })
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
