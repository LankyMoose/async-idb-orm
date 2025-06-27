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
  #resolvers: ((data: Data) => void)[]
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
    this.#resolvers = []
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
    if (this.#data !== $DATA_EMPTY) return Promise.resolve(this.#data)
    this.refresh()
    return new Promise<Data>((res) => this.#resolvers.push(res))
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
        } catch (e) {
          throw e
        } finally {
          AsyncIDBSelector.observed.delete(tx)
        }

        this.#subscriptions.forEach((unsub, store) => stores.has(store) || unsub())
        stores.forEach((store) => {
          if (this.#subscriptions.has(store)) return
          store.addEventListener("write|delete", this.#storeUpdateListener)
          store.addEventListener("clear", this.#storeUpdateListener)
          this.#subscriptions.set(store, () => {
            store.removeEventListener("write|delete", this.#storeUpdateListener)
            store.removeEventListener("clear", this.#storeUpdateListener)
          })
        })

        this.#subscribers.forEach((cb) => cb(data))
        while (this.#resolvers.length) this.#resolvers.shift()!(data)

        this.#refreshQueued = false
      })
    })
  }

  static observe(tx: IDBTransaction, store: AnyStore) {
    this.observed.get(tx)?.add(store)
  }
}
