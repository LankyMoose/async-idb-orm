import {
  Field,
  ArrayField,
  FieldType,
  ModelField,
  StringField,
  NumberField,
  BigIntField,
  BooleanField,
  DateField,
} from "model"

export interface IModel<T extends ModelDefinition> {
  name: string
  definition: T
}

export type ModelDefinition = Record<string, Field<FieldType>>

export type ModelSchema = Record<string, IModel<ModelDefinition>>

type OptionalField = { options: { optional: true } }
type UniqueField = { options: { unique: true } }

export type ResolvedModel<T extends ModelDefinition> = {
  [key in keyof T as T[key] extends OptionalField | UniqueField ? never : key]: ResolvedField<
    T[key]
  >
} & {
  [key in keyof T as T[key] extends OptionalField | UniqueField ? key : never]?:
    | ResolvedField<T[key]>
    | undefined
}

export type ResolvedModelWithUniqueKeys<T extends ModelDefinition> = {
  [key in keyof T as T[key] extends OptionalField ? never : key]: ResolvedField<T[key]>
} & {
  [key in keyof T as T[key] extends OptionalField ? key : never]?: ResolvedField<T[key]> | undefined
}
/** */
export interface FieldArgs<T> {
  /** Flags the field to be used as an IDBValidKey */
  unique?: boolean
  /** Makes the field omittable in create() calls, and T | undefined in query results */
  optional?: boolean
  /** Sets a default value for the field */
  default?: FieldDefault<T>
}

export type FieldDefault<T> = T | (() => T)

export type ResolvedField<T extends Field<FieldType>> = T extends StringField<any>
  ? string
  : T extends NumberField<any>
  ? number
  : T extends BigIntField<any>
  ? bigint
  : T extends BooleanField<any>
  ? boolean
  : T extends DateField<any>
  ? Date
  : T extends ModelField<infer U>
  ? ResolvedModel<U["definition"]>
  : T extends ArrayField<infer U>
  ? U extends Field<FieldType>
    ? ResolvedField<U>[]
    : U extends IModel<ModelDefinition>
    ? ResolvedModel<U["definition"]>[]
    : never
  : never

export type ModelEvent = "write" | "beforewrite" | "delete" | "beforedelete"

type NonCancellableModelEventCallback<T extends ModelDefinition> = (
  data: ResolvedModelWithUniqueKeys<T>
) => void

type CancellableModelEventCallback<T extends ModelDefinition> = (
  data: ResolvedModel<T>,
  cancel: () => void
) => void

export type ModelEventCallback<T extends ModelDefinition, U extends ModelEvent> = U extends
  | "write"
  | "delete"
  ? NonCancellableModelEventCallback<T>
  : CancellableModelEventCallback<T>
