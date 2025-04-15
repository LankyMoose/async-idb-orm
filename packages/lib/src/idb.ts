import {
  type AsyncIDBInstance,
  type CollectionSchema,
  type DBInstanceCallback,
  type AsyncIDBConfig,
  type IDBTransactionCallback,
  type OnDBUpgradeCallback,
  type OnDBUpgradeCallbackContext,
} from "./types"

import { Collection } from "./collection.js"
import { AsyncIDBStore } from "./idbStore.js"
import { type BroadcastChannelMessage, MSG_TYPES } from "./broadcastChannel.js"

/**
 * @private
 * Internal usage only. Do not use directly.
 */
export class AsyncIDB<T extends CollectionSchema> {
  #db: IDBDatabase | null
  #instanceCallbacks: DBInstanceCallback[]
  stores: {
    [key in keyof T]: AsyncIDBStore<T[key]>
  }
  onUpgrade?: OnDBUpgradeCallback<T>
  bc: BroadcastChannel
  relayEnabled?: boolean
  version: number
  schema: T
  constructor(private name: string, private config: AsyncIDBConfig<T>) {
    this.#db = null
    this.#instanceCallbacks = []
    this.schema = config.schema
    this.version = config.version
    this.stores = this.createStores()
    this.relayEnabled = config.relayEvents !== false

    let latest = this.version
    this.bc = new BroadcastChannel(`[async-idb-orm]:${this.name}`)
    this.bc.onmessage = (e: MessageEvent<BroadcastChannelMessage>) => {
      /**
       * - New tab with new version sends us a "CLOSE_FOR_UPGRADE" message, so we close the db.
       * - Once the other tab initializes it replies with an "REINIT" message.
       */
      switch (e.data.type) {
        case MSG_TYPES.CLOSE_FOR_UPGRADE:
          if (this.version === e.data.newVersion) return
          this.#db?.close()
          latest = e.data.newVersion
          break
        case MSG_TYPES.REINIT:
          if (this.version === latest) return
          this.config.onBeforeReinit?.(this.version, latest)
          this.version = latest
          this.stores = this.createStores()
          this.init()
          break
        case MSG_TYPES.RELAY:
          const store = this.stores[e.data.event.name]
          if (!store) return
          AsyncIDBStore.relay(store, e.data.event.name, e.data.event.data)
          break
      }
    }

    this.init()
  }

  getInstance(instanceCallback: DBInstanceCallback): void {
    if (!this.#db) {
      this.#instanceCallbacks.push(instanceCallback)
      return
    }
    instanceCallback(this.#db)
  }

  async transaction(callback: IDBTransactionCallback<T>, options?: IDBTransactionOptions) {
    const idbInstance = await new Promise<IDBDatabase>((res) => this.getInstance(res))
    const tx = idbInstance.transaction(Object.keys(this.schema), "readwrite", options)

    const eventQueue: Function[] = []
    const txCollections = this.cloneStoresForTransaction(tx, eventQueue)

    let aborted = false
    tx.addEventListener("abort", () => (aborted = true))

    try {
      const res = (await callback(txCollections, tx)) as any
      for (let i = 0; i < eventQueue.length; i++) eventQueue[i]()
      return res
    } catch (error) {
      if (!aborted) tx.abort()
      throw error
    }
  }

  private init() {
    let schemaValid = true
    for (const [name, collection] of Object.entries(this.schema)) {
      Collection.validate(
        this,
        collection,
        (err) => (
          (schemaValid = false),
          (this.config.onError ?? console.error)(
            `[async-idb-orm]: encountered error with collection "${name}":`,
            err
          )
        )
      )
    }
    if (!schemaValid) return

    for (const store of Object.values(this.stores)) {
      AsyncIDBStore.init(store)
    }
    for (const store of Object.values(this.stores)) {
      AsyncIDBStore.finalizeDependencies(this, store)
    }

    const request = indexedDB.open(this.name, this.version)
    request.onerror = this.config.onError ?? console.error

    let wasBlocked = false
    request.onblocked = () => {
      wasBlocked = true
      // send a "blocking" message to the other tab, indicating that it should close the connection.
      this.bc.postMessage({ type: MSG_TYPES.CLOSE_FOR_UPGRADE, newVersion: this.version })
    }
    request.onupgradeneeded = async (e) => {
      await this.initializeStores(request, e)
    }

    request.onsuccess = () => {
      this.#db = request.result
      this.config.onOpen?.(this.#db)
      if (wasBlocked) {
        // if our initialization was blocked, we can now let the other tab know we're ready
        this.bc.postMessage({ type: MSG_TYPES.REINIT })
      }
      while (this.#instanceCallbacks.length) {
        this.#instanceCallbacks.shift()!(this.#db)
      }
    }
  }

  private createStores() {
    return Object.entries(this.schema).reduce(
      (acc, [name, collection]) => ({
        ...acc,
        [name]: new AsyncIDBStore(this, collection, name),
      }),
      {} as AsyncIDBInstance<T>["collections"]
    )
  }

  private cloneStoresForTransaction(tx: IDBTransaction, eventQueue: Function[]) {
    return Object.entries(this.stores).reduce((acc, [name, store]) => {
      return {
        ...acc,
        [name]: AsyncIDBStore.cloneForTransaction(tx, store, eventQueue),
      }
    }, {} as AsyncIDBInstance<T>["collections"])
  }

  private async initializeStores(request: IDBOpenDBRequest, event: IDBVersionChangeEvent) {
    const dbInstance = request.result
    if (this.onUpgrade) {
      const ctx: OnDBUpgradeCallbackContext<T> = {
        db: dbInstance,
        collections: this.cloneStoresForTransaction(request.transaction!, []),
        deleteStore: (name) => dbInstance.deleteObjectStore(name),
        createStore: (name) => this.createStore(dbInstance, name),
      }
      await this.onUpgrade(ctx, event)
    }
    for (const storeName of Object.keys(this.stores)) {
      if (dbInstance.objectStoreNames.contains(storeName)) {
        continue
      }
      this.createStore(dbInstance, storeName)
    }
  }

  private createStore(db: IDBDatabase, name: keyof T): IDBObjectStore {
    const store = this.stores[name]
    const { keyPath, indexes } = AsyncIDBStore.getCollection(store)
    const objectStore = db.createObjectStore(store.name, { keyPath })

    for (const { name, key, options } of indexes) {
      objectStore.createIndex(name, key, options)
    }
    return objectStore
  }
}
