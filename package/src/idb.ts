import { Field, FieldType, Model, ModelField } from "./model.js"
import {
  ModelSchema,
  ModelDefinition,
  ResolvedModel,
  IModel,
  ModelEventCallback,
  ModelRecord,
} from "./types.js"

class AsyncIDB {
  db: IDBDatabase | null = null
  stores: { [key: string]: AsyncIDBStore<ModelDefinition> } = {}
  initialization: Promise<this> | undefined = undefined
  constructor(private name: string, private models: ModelSchema, private version?: number) {
    for (const [key, model] of Object.entries(this.models)) {
      this.stores[key] = new AsyncIDBStore(model, this, key)
    }
    this.init()
  }

  async init(): Promise<this> {
    if (this.initialization) return this.initialization
    this.initialization = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, this.version)
      request.onerror = (e) => reject(e)
      request.onsuccess = () => {
        this.db = request.result
        this.onConnected(this.db)
        resolve(this)
      }
      request.onupgradeneeded = () => {
        this.db = request.result
        this.onConnected(this.db)
        resolve(this)
      }
    })
    return this
  }

  onConnected(db: IDBDatabase) {
    for (const store of Object.values(this.stores)) {
      this.initializeStore(store, db)
    }
  }

  initializeStore(store: AsyncIDBStore<ModelDefinition>, db: IDBDatabase) {
    const primaryKeys = Object.keys(store.model.definition).filter(
      (key) => store.model.definition[key].options.primaryKey
    )

    const hasStore = db.objectStoreNames.contains(store.name)
    store.store = hasStore
      ? db.transaction(store.name, "readwrite").objectStore(store.name)
      : db.createObjectStore(store.name, {
          keyPath: primaryKeys.length === 1 ? primaryKeys[0] : primaryKeys,
          autoIncrement: primaryKeys.length === 1,
        })

    if (!hasStore) {
      const indexes = Object.entries(
        store.model.definition as Record<string, Field<FieldType>>
      ).filter(([_, val]) => val.options.index)

      for (const [key, val] of indexes) {
        store.store.createIndex(`idx_${key}_${store.name}_${this.name}`, key, {
          unique: val.options.primaryKey,
        })
      }
    }
  }
}

export class AsyncIDBStore<T extends ModelDefinition> {
  model: Model<T>
  name: string
  store: IDBObjectStore | undefined = undefined
  db: AsyncIDB
  constructor(model: IModel<T>, db: AsyncIDB, name: string) {
    this.model = model as Model<T>
    this.name = name
    this.db = db
  }

  private onBefore(evtName: "write" | "delete", data: ResolvedModel<T> | ModelRecord<T>) {
    const callbacks = this.model.callbacks(`before${evtName}`)
    let cancelled = false

    for (const callback of callbacks) {
      ;(callback as (data: any, cancel: () => void) => void)(data, () => (cancelled = true))
      if (cancelled) return false
    }
    return true
  }

  private onAfter<U extends "write" | "delete">(evtName: U, data: ModelRecord<T>) {
    const callbacks = this.model.callbacks(evtName) as ModelEventCallback<T, U>[]
    for (const callback of callbacks) {
      callback(data)
    }
  }

  private async getStore() {
    if (this.store) return this.store
    await this.db.init()
    return this.store as unknown as IDBObjectStore
  }

  async create(data: ResolvedModel<T>) {
    const record = this.model.applyDefaults(data)
    if (!this.onBefore("write", record)) return
    const request = (this.store ?? (await this.getStore())).add(record)
    return new Promise<ModelRecord<T>>((resolve, reject) => {
      request.onerror = (err) => reject(err)
      request.onsuccess = () =>
        this.read(request.result).then((data) => {
          this.onAfter("write", data)
          resolve(data)
        })
    })
  }
  async read(id: IDBValidKey) {
    const request = (this.store ?? (await this.getStore())).get(id)
    return new Promise<ModelRecord<T>>((resolve, reject) => {
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve(request.result)
    })
  }

  async update(data: ResolvedModel<T>) {
    const record = this.model.applyDefaults(data)
    if (!this.onBefore("write", record)) return

    const request = (this.store ?? (await this.getStore())).put(record)
    return new Promise<ModelRecord<T>>((resolve, reject) => {
      request.onerror = (err) => reject(err)
      request.onsuccess = () =>
        this.read(request.result).then((data) => {
          this.onAfter("write", data)
          resolve(data)
        })
    })
  }
  async delete(id: IDBValidKey) {
    const data = await this.read(id)
    if (!this.onBefore("delete", data)) return

    const request = (this.store ?? (await this.getStore())).delete(id)
    return new Promise<void>((resolve, reject) => {
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        this.onAfter("delete", data)
        resolve()
      }
    })
  }
  async clear() {
    const request = (this.store ?? (await this.getStore())).clear()
    return new Promise<void>((resolve, reject) => {
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve()
    })
  }

  async find(predicate: (item: ModelRecord<T>) => boolean) {
    const request = (this.store ?? (await this.getStore())).openCursor()
    return new Promise<ModelRecord<T> | void>((resolve, reject) => {
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          if (predicate(cursor.value)) {
            resolve(cursor.value)
          }
          cursor.continue()
        } else {
          resolve()
        }
      }
    })
  }

  async findMany(predicate: (item: ModelRecord<T>) => boolean) {
    const request = (this.store ?? (await this.getStore())).openCursor()
    return new Promise<ModelRecord<T>[]>((resolve, reject) => {
      const results: ModelRecord<T>[] = []
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          if (predicate(cursor.value)) {
            results.push(cursor.value)
          }
          cursor.continue()
        } else {
          resolve(results)
        }
      }
    })
  }

  async all() {
    return this.findMany(() => true)
  }

  async count() {
    const request = (this.store ?? (await this.getStore())).count()
    return new Promise<number>((resolve, reject) => {
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve(request.result)
    })
  }

  async upsert(...data: ResolvedModel<T>[]) {
    return Promise.all(data.map((item) => this.update(item)))
  }

  async max<U extends keyof T & string>(field: U) {
    const fieldDef = this.model.definition[field]
    if (!fieldDef) throw new Error(`Unknown field ${field}`)
    if (!fieldDef.options.index) throw new Error(`Field ${field} is not indexed`)

    const request = (this.store ?? (await this.getStore())).index(field).openCursor(null, "prev")
    return new Promise<IDBValidKey>((resolve, reject) => {
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          resolve(cursor.key)
        } else {
          resolve(0)
        }
      }
    })
  }
}

export function idb<T extends ModelSchema>(
  name: string,
  models: T,
  version?: number
): {
  [key in keyof T]: AsyncIDBStore<T[key]["definition"]>
} {
  const db = new AsyncIDB(name, models, version)

  return Object.entries(models).reduce((acc, [key]) => {
    return {
      ...acc,
      [key]: db.stores[key],
    }
  }, {} as any)
}
