import { Model } from "./model.js"
import {
  ModelSchema,
  ModelDefinition,
  ResolvedModel,
  IModel,
  ModelEventCallback,
  ModelRecord,
} from "./types.js"

export function idb<T extends ModelSchema>(
  name: string,
  models: T,
  version: number = 1
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

//scan for multiple in range - https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/getKey

class AsyncIDB {
  db: IDBDatabase | null = null
  stores: { [key: string]: AsyncIDBStore<ModelDefinition> } = {}
  initialization: Promise<this> | undefined = undefined
  constructor(private name: string, private models: ModelSchema, private version?: number) {
    for (const [key, model] of Object.entries(this.models)) {
      this.stores[key] = new AsyncIDBStore(this, model, key)
    }
    this.init()

    window.addEventListener("beforeunload", () => {
      if (this.db) this.db.close()
    })
  }

  async init(): Promise<this> {
    if (this.initialization) return this.initialization
    this.initialization = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, this.version)
      request.onerror = (e) => reject(e)
      request.onupgradeneeded = () => {
        this.db = request.result
        this.initializeStores(this.db)
      }
      request.onsuccess = () => {
        this.db = request.result
        resolve(this)
      }
    })
    return this
  }

  async restart(): Promise<this> {
    if (this.db) this.db.close()
    this.db = null
    this.initialization = undefined
    return await this.init()
  }

  initializeStores(db: IDBDatabase) {
    for (const wrapper of Object.values(this.stores)) {
      if (db.objectStoreNames.contains(wrapper.name)) {
        continue
      }

      const keys = Object.keys(wrapper.model.definition).filter(
        (key) => wrapper.model.definition[key].options.key
      )

      const store = db.createObjectStore(wrapper.name, {
        keyPath: keys.length === 1 ? keys[0] : keys,
        autoIncrement: keys.length === 1,
      })

      const indexes = Object.entries(wrapper.model.definition as ModelDefinition).filter(
        ([_, val]) => val.options.index
      )

      for (const [key, val] of indexes) {
        store.createIndex(`idx_${key}_${wrapper.name}_${this.name}`, key, {
          unique: val.options.key,
        })
      }
    }
  }
}

export class AsyncIDBStore<T extends ModelDefinition> {
  model: Model<T>
  name: string
  constructor(private db: AsyncIDB, model: IModel<T>, name: string) {
    this.model = model as Model<T>
    this.name = name
  }

  async create(data: ResolvedModel<T>) {
    const record = this.model.applyDefaults(data)
    if (!this.onBefore("write", record)) return
    const request = (await this.createTx()).add(record)
    return new Promise<ModelRecord<T>>((resolve, reject) => {
      request.onerror = (err) => reject(err)
      request.onsuccess = () =>
        this.read(request.result).then((data) => {
          this.onAfter("write", data)
          resolve(data)
        })
    })
  }
  async update(data: ResolvedModel<T>) {
    const record = this.model.applyDefaults(data)
    if (!this.onBefore("write", record)) return

    const request = (await this.createTx()).put(record)
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

    const request = (await this.createTx()).delete(id)
    return new Promise<void>((resolve, reject) => {
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        this.onAfter("delete", data)
        resolve()
      }
    })
  }
  async clear() {
    const request = (await this.createTx()).clear()
    return new Promise<void>((resolve, reject) => {
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve()
    })
  }

  async find(predicateOrIdbKey: IDBValidKey | ((item: ModelRecord<T>) => boolean)) {
    if (predicateOrIdbKey instanceof Function) {
      return this.findByPredicate(predicateOrIdbKey)
    } else {
      return this.read(predicateOrIdbKey)
    }
  }

  async findMany(predicate: (item: ModelRecord<T>) => boolean) {
    const request = (await this.createTx()).openCursor()
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
    const request = (await this.createTx()).getAll()
    return new Promise<ModelRecord<T>[]>((resolve, reject) => {
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve(request.result)
    })
  }

  async count() {
    const request = (await this.createTx()).count()
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

    const request = (await this.createTx()).index(field).openCursor(null, "prev")
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

  private async read(id: IDBValidKey) {
    const request = (await this.createTx()).get(id)
    return new Promise<ModelRecord<T>>((resolve, reject) => {
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve(request.result)
    })
  }

  private async findByPredicate(predicate: (item: ModelRecord<T>) => boolean) {
    const request = (await this.createTx()).openCursor()
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

  private async createTx() {
    await this.db.init()
    if (!this.db.db) throw new Error("Database not initialized")
    return this.db.db
      .transaction(this.name, "readwrite", { durability: "strict" })
      .objectStore(this.name)
  }
}
