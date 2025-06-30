import {
  type AsyncIDBInstance,
  type CollectionSchema,
  type DBInstanceCallback,
  type AsyncIDBConfig,
  type IDBTransactionCallback,
  type OnDBUpgradeCallback,
  type OnDBUpgradeCallbackContext,
  CollectionIDMode,
  RelationsSchema,
  SelectorSchema,
  TransactionOptions,
} from "./types"

import { Collection } from "./builders/Collection.js"
import { AsyncIDBStore } from "./AsyncIDBStore.js"
import { AsyncIDBSelector, InferSelectorReturn } from "./AsyncIDBSelector.js"
import { BROADCAST_MSG_TYPES, BroadcastChannelMessage } from "./utils.js"
import { TaskContext } from "./core/TaskContext.js"

/**
 * @private
 * Internal usage only. Do not use directly.
 */
export class AsyncIDB<
  T extends CollectionSchema,
  R extends RelationsSchema,
  S extends SelectorSchema
> {
  #db: IDBDatabase | null
  #instanceCallbacks: DBInstanceCallback[]
  stores: {
    [key in keyof T]: AsyncIDBStore<T[key], R>
  }
  storeNames: string[]
  onUpgrade?: OnDBUpgradeCallback<T, R>
  bc: BroadcastChannel
  relayEnabled?: boolean
  version: number
  schema: T
  relations: R
  selectors: {
    [key in keyof S]: AsyncIDBSelector<InferSelectorReturn<S[key]>>
  }
  constructor(private name: string, private config: AsyncIDBConfig<T, R, S>) {
    this.#db = null
    this.#instanceCallbacks = []
    this.schema = config.schema
    this.relations = config.relations ?? ({} as R)
    this.version = config.version
    this.storeNames = Object.keys(this.schema)
    this.stores = this.createStores()
    this.selectors = this.createSelectors()
    this.relayEnabled = config.relayEvents !== false

    let latest = this.version
    this.bc = new BroadcastChannel(`[async-idb-orm]:${this.name}`)
    this.bc.onmessage = (e: MessageEvent<BroadcastChannelMessage>) => {
      /**
       * - New tab with new version sends us a "CLOSE_FOR_UPGRADE" message, so we close the db.
       * - Once the other tab initializes it replies with an "REINIT" message.
       */
      switch (e.data.type) {
        case BROADCAST_MSG_TYPES.CLOSE_FOR_UPGRADE:
          if (this.version === e.data.newVersion) return
          this.#db?.close()
          latest = e.data.newVersion
          break
        case BROADCAST_MSG_TYPES.REINIT:
          if (this.version === latest) return
          this.config.onBeforeReinit?.(this.version, latest)
          this.version = latest
          this.stores = this.createStores()
          this.init()
          break
        case BROADCAST_MSG_TYPES.RELAY:
          const store = this.stores[e.data.name]
          if (!store) return
          AsyncIDBStore.relay(store, e.data.event, e.data.data)
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

  async transaction<CB extends IDBTransactionCallback<T, R, S>>(
    callback: CB,
    options?: TransactionOptions
  ): Promise<ReturnType<CB>> {
    const { durability, mode = "readwrite" } = options ?? {}
    const idbInstance = await new Promise<IDBDatabase>((res) => this.getInstance(res))
    const tx = idbInstance.transaction(this.storeNames, mode, { durability })

    const taskCtx = new TaskContext(idbInstance, tx)
    const txCollections = this.cloneStoresForTransaction(taskCtx)

    return taskCtx.run(async () => {
      return (await callback(txCollections, tx)) as ReturnType<CB>
    })
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
      AsyncIDBStore.init(store, this.stores)
    }

    const request = indexedDB.open(this.name, this.version)
    request.onerror = this.config.onError ?? console.error

    let wasBlocked = false
    request.onblocked = () => {
      wasBlocked = true
      // send a "blocking" message to the other tab, indicating that it should close the connection.
      this.bc.postMessage({ type: BROADCAST_MSG_TYPES.CLOSE_FOR_UPGRADE, newVersion: this.version })
    }
    request.onupgradeneeded = async (e) => {
      await this.initializeStores(request, e)
    }

    request.onsuccess = () => {
      this.#db = request.result
      this.config.onOpen?.(this.#db)
      if (wasBlocked) {
        // if our initialization was blocked, we can now let the other tab know we're ready
        this.bc.postMessage({ type: BROADCAST_MSG_TYPES.REINIT })
      }
      while (this.#instanceCallbacks.length) {
        this.#instanceCallbacks.shift()!(this.#db)
      }
    }
  }

  private createSelectors() {
    return Object.entries(this.config.selectors ?? {}).reduce(
      (acc, [name, selector]) => ({
        ...acc,
        [name]: new AsyncIDBSelector(this as any, selector.selector as any),
      }),
      {} as AsyncIDBInstance<T, R, S>["selectors"]
    )
  }

  private createStores() {
    return Object.entries(this.schema).reduce(
      (acc, [name, collection]) => ({
        ...acc,
        [name]: new AsyncIDBStore(this, collection, name),
      }),
      {} as AsyncIDBInstance<T, R, S>["collections"]
    )
  }

  private cloneStoresForTransaction(ctx: TaskContext) {
    return Object.entries(this.stores).reduce((acc, [name, store]) => {
      return {
        ...acc,
        [name]: AsyncIDBStore.cloneForTransaction(ctx, store),
      }
    }, {} as AsyncIDBInstance<T, R, S>["collections"])
  }

  private async initializeStores(request: IDBOpenDBRequest, event: IDBVersionChangeEvent) {
    const dbInstance = request.result
    if (this.onUpgrade) {
      const taskCtx = new TaskContext(dbInstance, request.transaction!)
      const ctx: OnDBUpgradeCallbackContext<T, R> = {
        db: dbInstance,
        collections: this.cloneStoresForTransaction(taskCtx),
        deleteStore: (name) => dbInstance.deleteObjectStore(name),
        createStore: (name) => this.createStore(dbInstance, name),
      }
      await taskCtx.run(() => this.onUpgrade!(ctx, event))
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
    const { keyPath, indexes, idMode } = AsyncIDBStore.getCollection(store)
    const objectStore = db.createObjectStore(store.name, {
      keyPath,
      autoIncrement: idMode === CollectionIDMode.AutoIncrement,
    })

    for (const { name, key, options } of indexes) {
      objectStore.createIndex(name, key, options)
    }
    return objectStore
  }
}
