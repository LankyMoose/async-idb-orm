import { Model } from "./model.js"
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
  stores: { [key: string]: AsyncIDBStore<any> } = {}
  initialization: Promise<this> | null = null
  constructor(private name: string, private models: ModelSchema, private version?: number) {
    for (const model of Object.values(this.models)) {
      this.stores[model.name] = new AsyncIDBStore(model, this)
    }
  }

  async init(): Promise<this> {
    if (this.initialization) return this.initialization
    this.initialization = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, this.version)
      request.onerror = (e) => reject(e)
      request.onsuccess = () => {
        this.db = request.result
        resolve(this)
      }
      request.onupgradeneeded = () => {
        this.db = request.result

        for (const store of Object.values(this.stores)) {
          if (this.db.objectStoreNames.contains(store.name)) {
            console.debug(`Store ${store.name} already exists, skipping...`)
            continue
          }

          this.initializeStore(store, this.db)
        }
        resolve(this)
      }
    })
    return this.initialization
  }

  private initializeStore(wrapper: AsyncIDBStore<any>, db: IDBDatabase) {
    const primaryKeys = Object.keys(wrapper.model.definition).filter(
      (key) => wrapper.model.definition[key].options.primaryKey
    )
    const indexes = Object.keys(wrapper.model.definition).filter(
      (key) => wrapper.model.definition[key].options.index
    )
    wrapper.store = db.createObjectStore(wrapper.model.name, {
      keyPath: primaryKeys ?? undefined,
      autoIncrement: primaryKeys.length > 0,
    })
    for (const index of indexes) {
      wrapper.store.createIndex(`idx_${this.name}_${index}`, index, { unique: true })
    }
  }
}

export class AsyncIDBStore<T extends ModelDefinition> {
  model: Model<T>
  name: string
  store: IDBObjectStore | null = null
  db: AsyncIDB
  constructor(model: IModel<T>, db: AsyncIDB) {
    this.model = model as Model<T>
    this.name = model.name
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

  private onAfter(evtName: "write" | "delete", data: ModelRecord<T>) {
    const callbacks = this.model.callbacks(evtName) as ModelEventCallback<T, "write">[]
    for (const callback of callbacks) {
      callback(data)
    }
  }

  private async getStore() {
    if (this.store) return this.store
    const db = await this.db.init()
    this.store = db.db!.transaction(this.name, "readwrite").objectStore(this.name)
    return this.store
  }

  async create(data: ResolvedModel<T>) {
    if (!this.onBefore("write", data)) return

    const request = (this.store ?? (await this.getStore())).add(data)
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

  async update(id: IDBValidKey, data: ResolvedModel<T>) {
    if (!this.onBefore("write", data)) return

    const request = (this.store ?? (await this.getStore())).put(data, id)
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
}

export function idb<T extends ModelSchema>(
  name: string,
  models: T,
  version?: number
): {
  [key in keyof T]: AsyncIDBStore<T[key]["definition"]>
} {
  const db = new AsyncIDB(name, models, version)
  db.init()

  return Object.values(models).reduce((acc, store) => {
    return {
      ...acc,
      [store.name]: db.stores[store.name],
    }
  }, {} as any)
}
