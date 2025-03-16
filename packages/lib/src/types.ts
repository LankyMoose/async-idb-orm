import type { $COLLECTION_INTERNAL } from "./constants"
export type CollectionEvent = "write" | "delete" | "write|delete"

export type Schema = {
  [key: string]: Collection<any, any>
}

export type Collection<RecordType extends Record<string, any>, DTO extends Record<string, any>> = {
  [$COLLECTION_INTERNAL]: CollectionConfig<RecordType, DTO>
}
export type CollectionEventCallback<T extends Collection<any, any>> = (
  data: InferCollectionRecord<T>
) => void

export type InferCollectionRecord<T extends Collection<any, any>> =
  T[typeof $COLLECTION_INTERNAL] extends CollectionConfig<infer RecordType, any>
    ? RecordType
    : never

export type InferCollectionIndexes<T extends Collection<any, any>> =
  T[typeof $COLLECTION_INTERNAL]["indexes"]

export type InferCollectionDTO<T extends Collection<any, any>> =
  T[typeof $COLLECTION_INTERNAL] extends CollectionConfig<any, infer DTO> ? DTO : any

type CollectionIndex<T extends Record<string, any>> = {
  name: string
  keyPath: keyof T | Iterable<keyof T>
  options?: IDBIndexParameters
}

export type CollectionConfig<
  RecordType extends Record<string, any>,
  DTO extends Record<string, any> = any
> = {
  keyPath?: keyof RecordType | (keyof RecordType)[] | null | undefined
  autoIncrement?: boolean
  indexes: CollectionIndex<RecordType>[]
  transform: {
    create?: (data: DTO) => RecordType
    update?: (record: RecordType, data: RecordType) => RecordType
  }
}
