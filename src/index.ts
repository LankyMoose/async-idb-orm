import { Field, model } from "model"

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
          const uniqueKeys = Object.keys(model.definition).filter((key) =>
            model.definition[key].unique()
          )

          this.db.createObjectStore(model.name, {
            keyPath: uniqueKeys.length > 0 ? uniqueKeys : undefined,
          })
          this.stores[model.name] = new AsyncIDBStore(model.name, this.db)
        }

        resolve(this)
      }
    })
  }
}

class AsyncIDBStore<T extends ModelDefinition> {
  name: string
  db: IDBDatabase
  store: IDBObjectStore
  constructor(name: string, db: IDBDatabase) {
    this.name = name
    this.db = db
    this.store = db.transaction(name, "readwrite").objectStore(name)
  }
  async create(data: T) {
    const request = this.store.add(data)
    return new Promise<IDBValidKey>((resolve, reject) => {
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve(request.result)
    })
  }
  async read(id: IDBValidKey) {
    const request = this.store.get(id)
    return new Promise<T>((resolve, reject) => {
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve(request.result)
    })
  }
  async update(id: IDBValidKey, data: object) {
    const request = this.store.put(data, id)
    return new Promise<IDBValidKey>((resolve, reject) => {
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve(request.result)
    })
  }
  async delete(id: IDBValidKey) {
    const request = this.store.delete(id)
    return new Promise<void>((resolve, reject) => {
      request.onerror = (err) => reject(err)
      request.onsuccess = () => resolve(request.result)
    })
  }
}

async function CreateAsyncIDB<T extends ModelSchema>(
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

const pets = model("Pet", {
  id: Field.number().unique(),
  name: Field.string(),
  age: Field.number(),
  species: Field.string(),
})

const users = model("User", {
  id: Field.number().unique(),
  name: Field.string(),
  age: Field.number(),
  pets: Field.array(pets),
})

const db = await CreateAsyncIDB("test", { pets, users })
db.users.create({
  id: 1,
  name: "John",
  age: 30,
  pets: [
    {
      id: 1,
      name: "Fluffy",
      age: 2,
      species: "cat",
    },
  ],
})

const user = await db.users.read(1)
