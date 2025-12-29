import type { CollectionRecord, CollectionKeyPathType, ActiveRecord, AnyCollection } from "../types"

/**
 * Manages the active record pattern for collections
 */
export class ActiveRecordWrapper<T extends AnyCollection> {
  constructor(
    private getRecordKey: (record: CollectionRecord<T>) => CollectionKeyPathType<T>,
    private updateRecord: (record: CollectionRecord<T>) => Promise<CollectionRecord<T>>,
    private deleteRecord: (key: CollectionKeyPathType<T>) => Promise<CollectionRecord<T> | null>,
    private assertNoRelations: (record: CollectionRecord<T>, action: string) => void
  ) {}

  /**
   * Wraps a record in an active record, enabling the use of the `save` and `delete` methods
   */
  wrap(record: CollectionRecord<T>): ActiveRecord<CollectionRecord<T>> {
    this.assertNoRelations(record, "wrap")

    const activeRecord = Object.assign({}, record, {
      save: async () => {
        const res = await this.updateRecord(activeRecord)
        if (res === null) {
          throw new Error("[async-idb-orm]: record not found")
        }
        return this.wrap(res)
      },
      delete: async () => {
        const key = this.getRecordKey(activeRecord)
        await this.deleteRecord(key)
      },
    })

    return activeRecord as ActiveRecord<CollectionRecord<T>>
  }

  /**
   * Unwraps an active record, removing the `save` and `delete` methods
   */
  unwrap(
    activeRecord: CollectionRecord<T> | ActiveRecord<CollectionRecord<T>>
  ): CollectionRecord<T> {
    const { save, delete: _del, ...rest } = activeRecord as any
    return rest
  }

  /**
   * Unwraps multiple active records
   */
  unwrapMany(
    activeRecords: (CollectionRecord<T> | ActiveRecord<CollectionRecord<T>>)[]
  ): CollectionRecord<T>[] {
    return activeRecords.map((record) => this.unwrap(record))
  }

  /**
   * Checks if a record is an active record
   */
  isActiveRecord(record: any): record is ActiveRecord<CollectionRecord<T>> {
    return (
      typeof record === "object" &&
      record !== null &&
      typeof record.save === "function" &&
      typeof record.delete === "function"
    )
  }
}
