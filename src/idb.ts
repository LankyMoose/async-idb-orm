import { Model, UniqueField } from "model"
import { ModelSchema, ModelDefinition, ResolvedModel, IModel, ModelEventCallback } from "types"

class AsyncIDB {
  db: IDBDatabase | null = null
  stores: { [key: string]: AsyncIDBStore<any> } = {}
  constructor(private name: string, private models: ModelSchema, private version?: number) {}

  async init(): Promise<this> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, this.version)
      request.onerror = (e) => reject(e)
      request.onsuccess = () => {
        this.db = request.result
        resolve(this)
      }
      request.onupgradeneeded = () => {
        this.db = request.result
        const _models = Object.values(this.models)

        for (const model of _models) {
          if (this.db.objectStoreNames.contains(model.name)) continue
          const uniqueKeys = Object.keys(model.definition).filter(
            (key) => model.definition[key] instanceof UniqueField
          )

          this.db.createObjectStore(model.name, {
            keyPath: uniqueKeys.length > 0 ? uniqueKeys : undefined,
          })
          this.stores[model.name] = new AsyncIDBStore(model, this.db)
        }

        resolve(this)
      }
    })
  }
}

class AsyncIDBStore<T extends ModelDefinition> {
  model: Model<T>
  name: string
  db: IDBDatabase
  store: IDBObjectStore
  constructor(model: IModel<T>, db: IDBDatabase) {
    this.model = model as Model<T>
    this.name = model.name
    this.db = db
    this.store = db.transaction(model.name, "readwrite").objectStore(model.name)
  }

  private onBefore(evtName: "write" | "delete", data: ResolvedModel<T>) {
    const callbacks = this.model.callbacks(`before${evtName}`)
    for (const callback of callbacks) {
      let cancelled = false
      callback(data, () => (cancelled = true))
      if (cancelled) return false
    }
    return true
  }

  private onAfter(evtName: "write" | "delete", data: ResolvedModel<T>) {
    const callbacks = this.model.callbacks(evtName) as ModelEventCallback<T, "write">[]
    for (const callback of callbacks) {
      callback(data)
    }
  }

  async create(data: ResolvedModel<T>) {
    if (!this.onBefore("write", data)) return

    const request = this.store.add(data)
    return new Promise<IDBValidKey>((resolve, reject) => {
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        this.onAfter("write", data)
        resolve(request.result)
      }
    })
  }
  async read(id: IDBValidKey) {
    const request = this.store.get(id)
    return new Promise<ResolvedModel<T>>((resolve, reject) => {
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve(request.result)
    })
  }
  async update(id: IDBValidKey, data: ResolvedModel<T>) {
    if (!this.onBefore("write", data)) return

    const request = this.store.put(data, id)
    return new Promise<IDBValidKey>((resolve, reject) => {
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        this.onAfter("write", data)
        resolve(request.result)
      }
    })
  }
  async delete(id: IDBValidKey) {
    const data = await this.read(id)
    if (!this.onBefore("delete", data)) return

    const request = this.store.delete(id)
    return new Promise<void>((resolve, reject) => {
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        this.onAfter("delete", data)
        resolve()
      }
    })
  }
  async clear() {
    const request = this.store.clear()
    return new Promise<void>((resolve, reject) => {
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve()
    })
  }
}

export async function idb<T extends ModelSchema>(
  name: string,
  models: T,
  version?: number
): Promise<{
  [key in keyof T]: AsyncIDBStore<T[key]["definition"]>
}> {
  const db = await new AsyncIDB(name, models, version).init()

  return Object.values(models).reduce((acc, store) => {
    return {
      ...acc,
      [store.name]: db.stores[store.name],
    }
  }, {} as any)
}
