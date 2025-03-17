import type { Collection, $COLLECTION_INTERNAL } from "./collection"

export type Schema = {
  [key: string]: Collection<any, any, any, any>
}

export type CollectionEvent = "write" | "delete" | "write|delete"
export type CollectionEventCallback<T extends Collection<any, any>> = (
  data: InferCollectionRecord<T>
) => void

export type InferCollectionIndexName<T extends Collection<any, any, any, any>> =
  T["indexes"][number]["name"]

export type InferCollectionRecord<T extends Collection<any, any, any, any>> =
  T[typeof $COLLECTION_INTERNAL]["record"]

export type InferCollectionDTO<T extends Collection<any, any, any, any>> =
  T[typeof $COLLECTION_INTERNAL]["dto"]

export type InferCollectionKeyPathType<
  T extends Collection<any, any, any, any>,
  KeyPath = T["keyPath"]
> = KeyPath extends keyof T[typeof $COLLECTION_INTERNAL]["record"]
  ? T[typeof $COLLECTION_INTERNAL]["record"][KeyPath]
  : // handle case where keyPath is an array
  KeyPath extends NonEmptyArray
  ? ObjectValues<T[typeof $COLLECTION_INTERNAL]["record"], KeyPath>
  : never

type InferIndexKeyPathByName<
  Indexes extends CollectionIndex<any>[],
  IndexName extends Indexes[number]["name"]
> = Extract<Indexes[number], { name: IndexName }>["keyPath"]

export type InferCollectionIndexIDBValidKey<
  T extends Collection<any, any, any, any>,
  Name extends InferCollectionIndexName<T>
> = InferCollectionKeyPathType<T, InferIndexKeyPathByName<T["indexes"], Name>>

export type CollectionIndex<RecordType extends Record<string, any>> = {
  name: string
  keyPath: RecordKeyPath<RecordType>
  options?: IDBIndexParameters
}

export type RecordKeyPath<
  RecordType extends Record<string, any>,
  ValidKeys = keyof RecordType & string
> = (Partial<UniqueArray<ValidKeys>> & NonEmptyArray & NonNullable<ValidKeys[]>) | ValidKeys

type NonEmptyArray = [any, ...any[]]

export type UniqueArray<T> = [T] extends [never]
  ? []
  : [T] | [T] extends [infer U]
  ? U extends U
    ? [U, ...UniqueArray<Exclude<T, U>>]
    : never
  : never

type ObjectValues<T extends Record<string, any>, K extends Array<keyof T>> = K extends [
  infer First,
  ...infer Rest
]
  ? First extends keyof T
    ? [T[First], ...ObjectValues<T, Rest extends Array<keyof T> ? Rest : []>]
    : []
  : []
