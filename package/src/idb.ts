import { FieldType, Model } from "./model.js"
import type {
  ModelSchema,
  ModelDefinition,
  ResolvedModel,
  IModel,
  ModelRecord,
  ModelEvent,
  Prettify,
  RecordField,
  OptionalField,
  KeyField,
  DefaultField,
} from "./types"

export function idb<T extends ModelSchema>(
  name: string,
  models: T,
  version: number = 1
): {
  [key in keyof T]: AsyncIDBStore<T[key]["definition"]>
} {
  validateModelSchema(models)
  const db = new AsyncIDB(name, models, version)

  return Object.entries(models).reduce((acc, [key]) => {
    return {
      ...acc,
      [key]: db.stores[key],
    }
  }, {} as any)
}

function validateModelSchema(models: ModelSchema) {
  for (const [modelName, model] of Object.entries(models)) {
    let foundKey = false
    for (const [_, field] of Object.entries(model.definition)) {
      if (field.options.key) {
        foundKey = true
        break
      }
    }
    if (!foundKey) {
      throw new Error(`[async-idb-orm]: Model "${modelName}" must have a key field`)
    }
  }
}

//scan for multiple in range - https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/getKey
type DBTaskFn = (db: IDBDatabase) => any
class AsyncIDB {
  db: IDBDatabase | null = null
  stores: { [key: string]: AsyncIDBStore<ModelDefinition> } = {}
  taskQueue: DBTaskFn[] = []
  constructor(private name: string, private models: ModelSchema, private version: number) {
    for (const [key, model] of Object.entries(this.models)) {
      this.stores[key] = new AsyncIDBStore(this, model, key)
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
      this.db = request.result
      this.initializeStores(this.db)
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

      const keys = Object.keys(store.model.definition).filter(
        (key) => store.model.definition[key].options.key
      )

      const objectStore = db.createObjectStore(store.name, {
        keyPath: keys.length === 1 ? keys[0] : keys,
        autoIncrement:
          keys.length === 1 && store.model.definition[keys[0]].type === FieldType.Number,
      })

      const indexes = Object.entries(store.model.definition as ModelDefinition).filter(
        ([_, val]) => val.options.index
      )

      for (const [key, val] of indexes) {
        objectStore.createIndex(`idx_${key}_${store.name}_${this.name}`, key, {
          unique: val.options.key,
        })
      }
    }
  }
}

type InferDto<T extends ModelDefinition> = Prettify<
  {
    [key in keyof T as T[key] extends DefaultField | OptionalField | KeyField
      ? never
      : key]: RecordField<T[key]>
  } & {
    [key in keyof T as T[key] extends DefaultField | OptionalField | KeyField
      ? key
      : never]?: RecordField<T[key]>
  }
>

export class AsyncIDBStore<T extends ModelDefinition> {
  model: Model<T>
  name: string
  constructor(private db: AsyncIDB, model: IModel<T>, name: string) {
    this.model = model as Model<T>
    this.name = name
  }

  create(data: InferDto<T>) {
    const record = this.model.applyDefaults(data as any)
    return this.queueTask<ModelRecord<T>>((ctx, resolve, reject) => {
      const request = ctx.objectStore.add(record)
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        this.read(request.result).then((data) => {
          this.onAfter("write", data!)
          this.onAfter("write|delete", data!)
          resolve(data!)
        })
      }
    })
  }
  update(data: ResolvedModel<T>) {
    const record = this.model.applyDefaults(data as any)
    return this.queueTask<ModelRecord<T>>((ctx, resolve, reject) => {
      const request = ctx.objectStore.put(record)
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        this.read(request.result).then((data) => {
          this.onAfter("write", data!)
          this.onAfter("write|delete", data!)
          resolve(data!)
        })
      }
    })
  }

  async delete(predicateOrIdbKey: IDBValidKey | ((item: ModelRecord<T>) => boolean)) {
    if (predicateOrIdbKey instanceof Function) {
      return this.deleteByPredicate(predicateOrIdbKey)
    }
    const data = await this.read(predicateOrIdbKey)
    if (data === null) return null
    return this.queueTask<ModelRecord<T> | null>((ctx, resolve, reject) => {
      const request = ctx.objectStore.delete(predicateOrIdbKey)
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        this.onAfter("delete", data)
        this.onAfter("write|delete", data)
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

  find(predicateOrIdbKey: IDBValidKey | ((item: ModelRecord<T>) => boolean)) {
    if (predicateOrIdbKey instanceof Function) {
      return this.findByPredicate(predicateOrIdbKey)
    }
    return this.read(predicateOrIdbKey)
  }

  findMany(predicate: (item: ModelRecord<T>) => boolean, limit = Infinity) {
    return this.queueTask<ModelRecord<T>[]>((ctx, resolve, reject) => {
      const request = ctx.objectStore.openCursor()
      const results: ModelRecord<T>[] = []
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
    return this.queueTask<ModelRecord<T>[]>((ctx, resolve, reject) => {
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

  async upsert(...data: ResolvedModel<T>[]) {
    return Promise.all(data.map((item) => this.update(item)))
  }

  max<U extends keyof T & string>(field: U): Promise<IDBValidKey | null> {
    return this.firstByKeyDirection(field, "prev")
  }

  min<U extends keyof T & string>(field: U): Promise<IDBValidKey | null> {
    return this.firstByKeyDirection(field, "next")
  }

  private firstByKeyDirection<U extends keyof T & string>(
    field: U,
    direction: "next" | "prev"
  ): Promise<IDBValidKey | null> {
    const fieldDef = this.model.definition[field]
    if (!fieldDef) throw new Error(`Unknown field ${field}`)
    if (!fieldDef.options.index && !fieldDef.options.key)
      throw new Error(`Field ${field} is not indexed`)

    return this.queueTask<IDBValidKey | null>((ctx, resolve, reject) => {
      const request = ctx.objectStore
        .index(`idx_${field}_${this.name}_${ctx.db.name}`)
        .openCursor(null, direction)
      request.onerror = (err) => reject(err)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return resolve(null)
        resolve(cursor.key)
      }
    })
  }

  private read(id: IDBValidKey) {
    return this.queueTask<ModelRecord<T> | null>((ctx, resolve, reject) => {
      const request = ctx.objectStore.get(id)
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve(request.result ?? null)
    })
  }

  private deleteByPredicate(predicate: (item: ModelRecord<T>) => boolean) {
    return this.queueTask<ModelRecord<T> | null>((ctx, resolve, reject) => {
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
  private findByPredicate(predicate: (item: ModelRecord<T>) => boolean) {
    return this.queueTask<ModelRecord<T> | null>((ctx, resolve, reject) => {
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

  private onAfter<U extends ModelEvent>(evtName: U, data: ModelRecord<T>) {
    const callbacks = this.model.callbacks(evtName)
    for (const callback of callbacks) {
      callback(data)
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
}
