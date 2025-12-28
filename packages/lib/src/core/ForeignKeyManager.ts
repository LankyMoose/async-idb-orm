import type {
  CollectionKeyPathType,
  CollectionRecord,
  AnyCollection,
  CollectionForeignKeyConfig,
} from "../types"
// import type { CollectionForeignKeyConfig } from "../builders/collection.js"
import { RequestHelper } from "./RequestHelper.js"
import { CursorIterator } from "./CursorIterator.js"
import { StoreEventEmitter } from "./EventEmitter.js"
import { TaskContext } from "./TaskContext.js"

export type UpstreamValidatorCallback<T extends AnyCollection> = (
  ctx: TaskContext,
  record: CollectionRecord<T>
) => Promise<void>

export type DownstreamHandlerCallback<T extends AnyCollection> = (
  ctx: TaskContext,
  key: CollectionKeyPathType<T>
) => Promise<void>

export interface ForeignKeysInit<T extends AnyCollection> {
  [key: string]: {
    collection: AnyCollection
    name: string
    addDownstreamHandler: (handler: DownstreamHandlerCallback<T>) => void
  }
}

/**
 * Manages foreign key constraints and validation
 */
export class ForeignKeyManager<T extends AnyCollection> {
  private upstreamValidators: UpstreamValidatorCallback<T>[] = []
  private downstreamHandlers: DownstreamHandlerCallback<T>[] = []

  constructor(
    private storeName: string,
    private getRecordKey: (record: CollectionRecord<T>) => CollectionKeyPathType<T>,
    private deserialize: (value: any) => CollectionRecord<T>,
    private eventEmitter: StoreEventEmitter<T>
  ) {}

  /**
   * Initializes foreign key constraints for a collection
   */
  initializeForeignKeys(
    foreignKeys: Array<CollectionForeignKeyConfig<{}>>,
    stores: ForeignKeysInit<T>
  ): void {
    if (!foreignKeys.length) return

    // Set up upstream validation (check referenced records exist)
    this.upstreamValidators.push(async (ctx, record) => {
      await Promise.all(
        foreignKeys.map(async ({ ref, collection, onDelete }) => {
          const key = record[ref]

          // Allow null values if onDelete is "set null"
          if (key === null || key === undefined) {
            if (onDelete === "set null") {
              return
            }
            // If the key is null/undefined but onDelete is not "set null", that's an error
            throw new Error(
              `[async-idb-orm]: Foreign key constraint violation: ${this.storeName}.${ref} cannot be null`
            )
          }

          const targetStore = Object.values(stores).find((s) => s.collection === collection)
          if (!targetStore) {
            throw new Error(`[async-idb-orm]: Referenced collection not found for FK ${ref}`)
          }

          const objectStore = ctx.tx.objectStore(targetStore.name)
          const exists = await RequestHelper.exists(objectStore, key)

          if (!exists) {
            throw new Error(
              `[async-idb-orm]: Foreign key constraint violation: missing reference ${this.storeName}.${ref} -> ${targetStore.name} (${key})`
            )
          }
        })
      )
    })

    // Set up downstream handling (cascade, restrict, set null, no action)
    for (const { ref: field, collection, onDelete } of foreignKeys) {
      const targetStore = Object.values(stores).find((s) => s.collection === collection)
      if (!targetStore) continue

      switch (onDelete) {
        case "cascade":
          targetStore.addDownstreamHandler(async (ctx, key) => {
            await this.handleCascadeDelete(ctx, field, key)
          })
          break

        case "restrict":
          targetStore.addDownstreamHandler(async (ctx, key) => {
            await this.handleRestrictDelete(ctx, field, key)
          })
          break

        case "set null":
          targetStore.addDownstreamHandler(async (ctx, key) => {
            await this.handleSetNullDelete(ctx, field, key)
          })
          break

        case "no action":
          targetStore.addDownstreamHandler(async (ctx, key) => {
            await this.handleNoActionDelete(ctx, field, key)
          })
          break

        default:
          console.warn(
            `[async-idb-orm]: Unknown onDelete option ${onDelete} for foreign key ${field} in collection ${this.storeName}`
          )
      }
    }
  }

  /**
   * Validates upstream foreign key constraints
   */
  async validateUpstreamConstraints(ctx: TaskContext, record: CollectionRecord<T>): Promise<void> {
    await Promise.all(this.upstreamValidators.map((validator) => validator(ctx, record)))
  }

  /**
   * Handles downstream foreign key constraints
   */
  async handleDownstreamConstraints(
    ctx: TaskContext,
    key: CollectionKeyPathType<T>
  ): Promise<void> {
    await Promise.all(this.downstreamHandlers.map((handler) => handler(ctx, key)))
  }

  /**
   * Adds a downstream constraint handler
   */
  addDownstreamHandler(handler: DownstreamHandlerCallback<T>): void {
    this.downstreamHandlers.push(handler)
  }

  /**
   * Queues a pre-commit upstream check for records that might be affected by no-action constraints
   */
  queuePreCommitUpstreamCheck(
    ctx: TaskContext,
    record: CollectionRecord<T>,
    validate: (record: CollectionRecord<T>) => Promise<void>
  ): void {
    const recordKey = this.getRecordKey(record)
    ctx.onWillCommit(`${this.storeName}:${recordKey}`, async () => {
      const objectStore = ctx.tx.objectStore(this.storeName)
      const current = await RequestHelper.get(objectStore, recordKey as IDBValidKey)
      if (current) {
        await validate(this.deserialize(current))
      }
    })
  }

  private async handleCascadeDelete(ctx: TaskContext, field: string, key: any): Promise<void> {
    const objectStore = ctx.tx.objectStore(this.storeName)

    await CursorIterator.deleteByPredicate(
      objectStore,
      (record: CollectionRecord<T>) => record[field] === key,
      {
        deserialize: this.deserialize,
        onBeforeDelete: async (record) => {
          // Check downstream constraints for the record being cascade deleted
          await this.handleDownstreamConstraints(ctx, this.getRecordKey(record))
        },
        onAfterDelete: (record) => {
          // Event emission should be handled by the calling store
          ctx.onDidCommit(() => {
            this.eventEmitter.emit("delete", record)
            this.eventEmitter.emit("write|delete", record)
          })
        },
      }
    )
  }

  private async handleRestrictDelete(ctx: TaskContext, field: string, key: any): Promise<void> {
    const objectStore = ctx.tx.objectStore(this.storeName)
    const referencingRecords = await CursorIterator.findByPredicate(
      objectStore,
      (record: CollectionRecord<T>) => record[field] === key,
      { limit: 1, deserialize: this.deserialize }
    )

    if (referencingRecords.length > 0) {
      throw new Error(
        `[async-idb-orm]: Failed to delete record because it is referenced by another record in collection ${this.storeName}`
      )
    }
  }

  private async handleSetNullDelete(ctx: TaskContext, field: string, key: any): Promise<void> {
    const objectStore = ctx.tx.objectStore(this.storeName)

    return new Promise((resolve, reject) => {
      const request = objectStore.openCursor()

      request.onerror = () => reject(request.error)
      request.onsuccess = async () => {
        const cursor = request.result
        if (!cursor) return resolve()

        if (cursor.value[field] !== key) {
          return cursor.continue()
        }

        const updatedRecord = { ...cursor.value, [field]: null }

        try {
          await RequestHelper.promisify(cursor.update(updatedRecord))
          // Event emission should be handled by the calling store
          cursor.continue()
        } catch (error) {
          reject(error)
        }
      }
    })
  }

  private async handleNoActionDelete(ctx: TaskContext, field: string, key: any): Promise<void> {
    const objectStore = ctx.tx.objectStore(this.storeName)
    const referencingRecords = await CursorIterator.findByPredicate(
      objectStore,
      (record: CollectionRecord<T>) => record[field] === key,
      { deserialize: this.deserialize }
    )

    // Queue pre-commit checks for each referencing record
    for (const record of referencingRecords) {
      this.queuePreCommitUpstreamCheck(ctx, record, (r) => this.validateUpstreamConstraints(ctx, r))
    }
  }
}
