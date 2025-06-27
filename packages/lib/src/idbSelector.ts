import { Selector } from "builders/selector"
import type { AsyncIDB } from "./idb"
import type { AsyncIDBInstance, CollectionSchema, RelationsSchema } from "./types"
import { AsyncIDBStore } from "idbStore"

const $DATA_EMPTY = Symbol("DATA_EMPTY")

export type InferSelectorReturn<S extends Selector<CollectionSchema, RelationsSchema>> = Awaited<
  ReturnType<S["selector"]>
>

type AnyStore = AsyncIDBStore<any, any>

export class AsyncIDBSelector<Data> {
  #subscribers: Set<(data: Data) => void>
  #subscriptions: Map<AnyStore, () => void>
  #data: Data | typeof $DATA_EMPTY
  #storeUpdateListener: () => void
  #refreshQueued: boolean
  #getterPromises: [(data: Data) => void, (reason?: any) => void][]
  private static observed = new Map<IDBTransaction, Set<AnyStore>>()

  constructor(
    private db: AsyncIDB<CollectionSchema, RelationsSchema, any>,
    private selector: (
      data: AsyncIDBInstance<CollectionSchema, RelationsSchema, any>["collections"]
    ) => Promise<Data>
  ) {
    this.#subscribers = new Set()
    this.#subscriptions = new Map()
    this.#data = $DATA_EMPTY
    this.#refreshQueued = false
    this.#storeUpdateListener = () => this.refresh()
    this.#getterPromises = []
  }

  subscribe(callback: (data: Data) => void): () => void {
    this.#subscribers.add(callback)
    if (this.#data !== $DATA_EMPTY) {
      callback(this.#data)
    } else {
      this.refresh()
    }
    return () => (this.#subscribers.delete(callback), void 0)
  }

  get(): Promise<Data> {
    if (this.#data !== $DATA_EMPTY && !this.#refreshQueued) return Promise.resolve(this.#data)
    this.refresh()
    return new Promise<Data>((res, rej) => this.#getterPromises.push([res, rej]))
  }

  private async refresh() {
    if (this.#refreshQueued) return

    this.#refreshQueued = true
    queueMicrotask(() => {
      this.db.transaction(async (ctx, tx) => {
        const stores = new Set<AnyStore>()
        AsyncIDBSelector.observed.set(tx, stores)

        let data
        try {
          data = this.#data = await this.selector(ctx)
          this.registerListeners(stores)
        } catch (e) {
          while (this.#getterPromises.length) {
            const [_, rej] = this.#getterPromises.shift()!
            rej(e)
          }
          throw e
        } finally {
          this.#refreshQueued = false
          AsyncIDBSelector.observed.delete(tx)
        }

        this.#subscribers.forEach((cb) => cb(data))
        while (this.#getterPromises.length) {
          const [res] = this.#getterPromises.shift()!
          res(data)
        }
      })
    })
  }

  static observe(tx: IDBTransaction, store: AnyStore) {
    this.observed.get(tx)?.add(store)
  }

  private registerListeners(stores: Set<AnyStore>) {
    this.#subscriptions.forEach((unsub, store) => {
      if (!stores.has(store)) unsub()
    })

    stores.forEach((store) => {
      if (this.#subscriptions.has(store)) return
      const remove = () => {
        store.removeEventListener("write|delete", this.#storeUpdateListener)
        store.removeEventListener("clear", this.#storeUpdateListener)
      }
      store.addEventListener("write|delete", this.#storeUpdateListener)
      store.addEventListener("clear", this.#storeUpdateListener)
      this.#subscriptions.set(store, remove)
    })
  }
}
