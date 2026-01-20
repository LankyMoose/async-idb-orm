import type { Selector } from "./builders/Selector"
import type { AsyncIDB } from "./AsyncIDB"
import type { CollectionSchema, ReadOnlyTransactionContext, RelationsSchema } from "./types"
import type { AsyncIDBStore } from "./AsyncIDBStore"

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
  #disposed: boolean
  private static observed = new Map<IDBTransaction, Set<AnyStore>>()

  constructor(
    private db: AsyncIDB<CollectionSchema, RelationsSchema, any>,
    private selector: (
      data: ReadOnlyTransactionContext<CollectionSchema, RelationsSchema>
    ) => Promise<Data>
  ) {
    this.#subscribers = new Set()
    this.#subscriptions = new Map()
    this.#data = $DATA_EMPTY
    this.#refreshQueued = false
    this.#storeUpdateListener = () => this.refresh()
    this.#getterPromises = []
    this.#disposed = false
  }

  subscribe(callback: (data: Data) => void): () => void {
    this.assertNotDisposed()
    this.#subscribers.add(callback)
    if (this.#data !== $DATA_EMPTY) {
      callback(this.#data)
    } else {
      this.refresh()
    }
    return () => (this.#subscribers.delete(callback), void 0)
  }

  get(): Promise<Data> {
    this.assertNotDisposed()
    if (this.#data !== $DATA_EMPTY && !this.#refreshQueued) return Promise.resolve(this.#data)
    this.refresh()
    return new Promise<Data>((res, rej) => this.#getterPromises.push([res, rej]))
  }

  private assertNotDisposed() {
    if (this.#disposed) throw new Error("AsyncIDBSelector is disposed")
  }

  private async refresh() {
    if (this.#refreshQueued) return

    this.#refreshQueued = true
    queueMicrotask(() => {
      this.db.transaction(
        async (ctx, tx) => {
          const stores = new Set<AnyStore>()
          AsyncIDBSelector.observed.set(tx, stores)

          try {
            const data = (this.#data = await this.selector(ctx))
            this.#subscribers.forEach((cb) => cb(data))
            while (this.#getterPromises.length) {
              const [res] = this.#getterPromises.shift()!
              res(data)
            }
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
        },
        { mode: "readonly" }
      )
    })
  }

  static dispose(selector: AsyncIDBSelector<any>) {
    selector.#disposed = true
    selector.#subscribers.clear()
    selector.#subscriptions.forEach((cb) => cb())
    selector.#subscriptions.clear()
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

      store.addEventListener("write|delete", this.#storeUpdateListener)
      store.addEventListener("clear", this.#storeUpdateListener)
      this.#subscriptions.set(store, () => {
        store.removeEventListener("write|delete", this.#storeUpdateListener)
        store.removeEventListener("clear", this.#storeUpdateListener)
      })
    })
  }
}
