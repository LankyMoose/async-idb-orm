//scan for multiple in range - https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/getKey
import { $COLLECTION_INTERNAL } from "./constants.js"
import type {
  Collection,
  CollectionEvent,
  InferCollectionDTO,
  InferCollectionIndexes,
  InferCollectionRecord,
  Schema,
} from "./types"

type AsyncIDBInstance<T extends Schema> = { [key in keyof T]: AsyncIDBStore<T[key]> }

export function idb<T extends Schema>(
  name: string,
  schema: T,
  version: number = 1
): AsyncIDBInstance<T> {
  const db = new AsyncIDB(name, schema, version)
  return Object.entries(schema).reduce((acc, [key]) => {
    return {
      ...acc,
      [key]: db.stores[key],
    }
  }, {} as any)
}

type DBTaskFn = (db: IDBDatabase) => any
class AsyncIDB {
  db: IDBDatabase | null = null
  stores: { [key: string]: AsyncIDBStore<any> } = {}
  taskQueue: DBTaskFn[] = []
  constructor(private name: string, private schema: Schema, private version: number) {
    for (const [key, collection] of Object.entries(this.schema)) {
      this.stores[key] = new AsyncIDBStore(this, collection, key)
    }
    const request = indexedDB.open(this.name, this.version)
    request.onerror = (e) => {
      setTimeout(() => {
        throw new Error(
          `[async-idb-orm]: The above error thrown while opening database "${this.name}"`
        )
      })
      throw e
    }
    request.onupgradeneeded = () => {
      this.initializeStores(request.result)
    }
    request.onsuccess = () => {
      this.db = request.result
      while (this.taskQueue.length) {
        this.taskQueue.shift()!(this.db)
      }
    }
    window.addEventListener("beforeunload", () => this.db?.close())
  }

  queueTask(taskFn: DBTaskFn) {
    if (!this.db) {
      return this.taskQueue.push(taskFn)
    }
    taskFn(this.db)
  }

  initializeStores(db: IDBDatabase) {
    for (const store of Object.values(this.stores)) {
      if (db.objectStoreNames.contains(store.name)) {
        continue
      }

      const { keyPath, autoIncrement, indexes } = AsyncIDBStore.getCollectionConfig(store)

      const objectStore = db.createObjectStore(store.name, {
        keyPath,
        autoIncrement,
      })

      for (const { name, keyPath, options } of indexes) {
        objectStore.createIndex(name, keyPath, options)
      }
    }
  }
}

export class AsyncIDBStore<T extends Collection<any, any>> {
  name: string
  #eventListeners: { [key: string]: ((data: InferCollectionRecord<T>) => void)[] } = {}
  constructor(private db: AsyncIDB, private collection: T, name: string) {
    this.name = name
  }

  static getCollectionConfig(store: AsyncIDBStore<any>) {
    return store.collection[$COLLECTION_INTERNAL]
  }

  addEventListener(event: CollectionEvent, listener: (data: InferCollectionRecord<T>) => void) {
    const listeners = (this.#eventListeners[event] ??= [])
    listeners.push(listener)
  }
  removeEventListener(event: CollectionEvent, listener: (data: InferCollectionRecord<T>) => void) {
    const listeners = this.#eventListeners[event]
    if (!listeners) return
    this.#eventListeners[event] = listeners.filter((l) => l !== listener)
  }

  create(data: InferCollectionDTO<T>) {
    const createTransformer = this.getConfig().transform.create
    const record = createTransformer ? createTransformer(data) : data

    return this.queueTask<InferCollectionRecord<T>>((ctx, resolve, reject) => {
      const request = ctx.objectStore.add(record)
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        this.read(request.result).then((data) => {
          this.emit("write", data!)
          this.emit("write|delete", data!)
          resolve(data!)
        })
      }
    })
  }

  async update(data: InferCollectionRecord<T>) {
    const keys = this.getObjectIDBValidKey(data)
    if (keys === null) throw new Error(`[async-idb-orm]: No key found on record`)

    const prev = await this.read(keys)
    const updateTransformer = this.getConfig().transform.update
    const record = updateTransformer ? updateTransformer(prev, data) : data

    return this.queueTask<InferCollectionRecord<T>>((ctx, resolve, reject) => {
      const request = ctx.objectStore.put(record)
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        this.read(request.result).then((data) => {
          this.emit("write", data!)
          this.emit("write|delete", data!)
          resolve(data!)
        })
      }
    })
  }

  async delete(predicateOrIdbKey: IDBValidKey | ((item: InferCollectionRecord<T>) => boolean)) {
    if (predicateOrIdbKey instanceof Function) {
      return this.deleteByPredicate(predicateOrIdbKey)
    }
    const data = await this.read(predicateOrIdbKey)
    if (data === null) return null
    return this.queueTask<InferCollectionRecord<T> | null>((ctx, resolve, reject) => {
      const request = ctx.objectStore.delete(predicateOrIdbKey)
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

  find(predicateOrIdbKey: IDBValidKey | ((item: InferCollectionRecord<T>) => boolean)) {
    if (predicateOrIdbKey instanceof Function) {
      return this.findByPredicate(predicateOrIdbKey)
    }
    return this.read(predicateOrIdbKey)
  }

  findMany(predicate: (item: InferCollectionRecord<T>) => boolean, limit = Infinity) {
    return this.queueTask<InferCollectionRecord<T>[]>((ctx, resolve, reject) => {
      const request = ctx.objectStore.openCursor()
      const results: InferCollectionRecord<T>[] = []
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
    return this.queueTask<InferCollectionRecord<T>[]>((ctx, resolve, reject) => {
      const request = ctx.objectStore.getAll()
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve(request.result)
    })
  }

  async count() {
    return this.queueTask<number>((ctx, resolve, reject) => {
      const request = ctx.objectStore.count()
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve(request.result)
    })
  }

  async upsert(...data: InferCollectionRecord<T>[]) {
    return Promise.all(data.map((item) => this.update(item)))
  }

  max(field: InferCollectionIndexes<T>[number]["keyPath"]): Promise<IDBValidKey | null> {
    return this.firstByKeyDirection(field, "prev")
  }

  min(field: InferCollectionIndexes<T>[number]["keyPath"]): Promise<IDBValidKey | null> {
    return this.firstByKeyDirection(field, "next")
  }

  private firstByKeyDirection(
    field: InferCollectionIndexes<T>[number]["keyPath"],
    direction: "next" | "prev"
  ): Promise<IDBValidKey | null> {
    const idxName = this.getConfig().indexes.find((idx) => idx.keyPath === field)?.name
    if (!idxName) throw new Error(`[async-idb-orm]: No index found on field ${String(field)}`)

    return this.queueTask<IDBValidKey | null>((ctx, resolve, reject) => {
      const request = ctx.objectStore.index(idxName).openCursor(null, direction)

      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return resolve(null)
        resolve(cursor.key)
      }
    })
  }

  private read(id: IDBValidKey) {
    return this.queueTask<InferCollectionRecord<T> | null>((ctx, resolve, reject) => {
      const request = ctx.objectStore.get(id)
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve(request.result ?? null)
    })
  }

  private deleteByPredicate(predicate: (item: InferCollectionRecord<T>) => boolean) {
    return this.queueTask<InferCollectionRecord<T> | null>((ctx, resolve, reject) => {
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
  private findByPredicate(predicate: (item: InferCollectionRecord<T>) => boolean) {
    return this.queueTask<InferCollectionRecord<T> | null>((ctx, resolve, reject) => {
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

  private emit<U extends CollectionEvent>(evtName: U, data: InferCollectionRecord<T>) {
    const listeners = this.#eventListeners[evtName] ?? []
    for (const listener of listeners) {
      listener(data)
    }
  }

  private queueTask<T>(
    reqHandler: (
      ctx: { db: IDBDatabase; objectStore: IDBObjectStore },
      resolve: (value: T | PromiseLike<T>) => void,
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

  private getConfig() {
    return this.collection[$COLLECTION_INTERNAL]
  }

  private getObjectIDBValidKey(data: InferCollectionRecord<T>): null | IDBValidKey {
    type CollectionKey = keyof InferCollectionRecord<T>
    const keyPath = this.getConfig().keyPath as CollectionKey | CollectionKey[] | null | undefined

    return keyPath instanceof Array
      ? keyPath.reduce<IDBValidKey[]>((acc, key) => {
          return [...acc, data[key]]
        }, [])
      : keyPath
      ? data[keyPath]
      : null
  }
}
