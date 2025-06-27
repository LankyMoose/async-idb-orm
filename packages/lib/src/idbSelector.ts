import { Selector } from "builders/selector"
import type { AsyncIDB } from "./idb"
import type { AsyncIDBInstance, CollectionSchema, RelationsSchema } from "./types"

export const selectorStoreObservations = {
  enabled: false,
  observed: new Set<string>(),
}

const $DATA_EMPTY = Symbol("DATA_EMPTY")

export type InferSelectorReturn<S extends Selector<CollectionSchema, RelationsSchema>> = Awaited<
  ReturnType<S["selector"]>
>

export class AsyncIDBSelector<Data> {
  #subscribers: Set<(data: Data) => void>
  #data: Data | typeof $DATA_EMPTY
  #unsubs: (() => void)[]
  #storeUpdateListener: () => void
  #refreshQueued: boolean
  #resolvers: ((data: Data) => void)[]

  constructor(
    private db: AsyncIDB<CollectionSchema, RelationsSchema, any>,
    private selector: (
      data: AsyncIDBInstance<CollectionSchema, RelationsSchema, any>["collections"]
    ) => Promise<Data>
  ) {
    this.#subscribers = new Set()
    this.#data = $DATA_EMPTY
    this.#unsubs = []
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
      selectorStoreObservations.enabled = true
      this.selector(this.db.stores).then((data) => {
        this.#data = data
        this.updateStoreSubscriptions()

        this.#subscribers.forEach((cb) => cb(data))
        while (this.#resolvers.length) this.#resolvers.shift()!(data)

        this.#refreshQueued = false
      })
    })
  }

  private updateStoreSubscriptions() {
    while (this.#unsubs.length) this.#unsubs.pop()!()

    selectorStoreObservations.observed.forEach((name) => {
      const store = this.db.stores[name]
      store.addEventListener("write|delete", this.#storeUpdateListener)
      store.addEventListener("clear", this.#storeUpdateListener)
      this.#unsubs.push(() => {
        store.removeEventListener("write|delete", this.#storeUpdateListener)
        store.removeEventListener("clear", this.#storeUpdateListener)
      })
    })
    selectorStoreObservations.enabled = false
    selectorStoreObservations.observed.clear()
  }
}
