import type { Collection, $COLLECTION_INTERNAL } from "./collection"

export type DBTaskFn = (db: IDBDatabase) => any

type NonEmptyArray = [any, ...any[]]

export type CollectionSchema = {
  [key: string]: Collection<any, any, any, any>
}

export type ActiveRecord<T> = T & ActiveRecordMethods<T>
export type ActiveRecordMethods<T> = {
  save(): Promise<ActiveRecord<T>>
  delete(): Promise<void>
}

export type CollectionEvent = "write" | "delete" | "write|delete"
export type CollectionEventCallback<T extends Collection<any, any>> = (
  data: CollectionRecord<T>
) => void

export type CollectionIndexName<T extends Collection<any, any, any, any>> =
  T["indexes"][number]["name"]
export type CollectionRecord<T extends Collection<any, any, any, any>> =
  T[typeof $COLLECTION_INTERNAL]["record"]
export type CollectionDTO<T extends Collection<any, any, any, any>> =
  T[typeof $COLLECTION_INTERNAL]["dto"]

export type CollectionKeyPathType<
  T extends Collection<any, any, any, any>,
  KeyPath = T["keyPath"]
> = KeyPath extends keyof T[typeof $COLLECTION_INTERNAL]["record"]
  ? T[typeof $COLLECTION_INTERNAL]["record"][KeyPath]
  : // handle case where keyPath is an array
  KeyPath extends NonEmptyArray
  ? ObjectValues<T[typeof $COLLECTION_INTERNAL]["record"], KeyPath>
  : never

export type CollectionIndexIDBValidKey<
  T extends Collection<any, any, any, any>,
  Name extends CollectionIndexName<T>
> = CollectionKeyPathType<T, Extract<T["indexes"][number], { name: Name }>["keyPath"]>

export type CollectionIndex<RecordType extends Record<string, any>> = {
  name: string
  keyPath: RecordKeyPath<RecordType>
  options?: IDBIndexParameters
}

export type RecordKeyPath<RecordType extends Record<string, any>> =
  | (keyof RecordType & string)
  | ((keyof RecordType & string)[] & NonEmptyArray)

type ObjectValues<T extends Record<string, any>, K extends Array<keyof T>> = K extends [
  infer First,
  ...infer Rest
]
  ? First extends keyof T
    ? [T[First], ...ObjectValues<T, Rest extends Array<keyof T> ? Rest : []>]
    : []
  : []
