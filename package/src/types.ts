import { AsyncIDBStore } from "idb.js"
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
} from "./model.js"

export interface IModel<T extends ModelDefinition> {
  definition: T
}

export type ModelDefinition = Record<string, Field<FieldType>>

export type ModelSchema = Record<string, IModel<ModelDefinition>>

type OptionalField = { options: { optional: true } }
type UniqueField = { options: { unique: true } }
type DefaultField = { options: { default: FieldDefault<unknown> } }
type KeyField = { options: { key: true } }

export type ResolvedModel<T extends ModelDefinition> = {
  [key in keyof T as T[key] extends OptionalField | UniqueField | DefaultField | KeyField
    ? never
    : key]: ResolvedField<T[key]>
} & {
  [key in keyof T as T[key] extends OptionalField | UniqueField | DefaultField | KeyField
    ? key
    : never]?: ResolvedField<T[key]> | undefined
}

export type ModelRecord<T extends ModelDefinition> = {
  [key in keyof T as T[key] extends OptionalField ? never : key]: RecordField<T[key]>
} & {
  [key in keyof T as T[key] extends OptionalField ? key : never]?: RecordField<T[key]> | undefined
}
/** */
export interface FieldArgs<T> {
  /** Flags the field to be used as an IDBValidKey */
  key?: boolean
  /** Flags the field to be used as an index */
  index?: boolean
  /** Makes the field omittable in create() calls, and T | undefined in query results */
  optional?: boolean
  /** Sets a default value for the field */
  default?: FieldDefault<T>
}

export type FieldDefault<T> = T | (() => T)

export type ResolvedField<T extends Field<FieldType>> = T extends StringField<FieldArgs<string>>
  ? string
  : T extends NumberField<FieldArgs<number>>
  ? number
  : T extends BigIntField<FieldArgs<bigint>>
  ? bigint
  : T extends BooleanField<FieldArgs<boolean>>
  ? boolean
  : T extends DateField<FieldArgs<Date>>
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

export type RecordField<T extends Field<FieldType>> = T extends StringField<FieldArgs<string>>
  ? string
  : T extends NumberField<FieldArgs<number>>
  ? number
  : T extends BigIntField<FieldArgs<bigint>>
  ? bigint
  : T extends BooleanField<FieldArgs<boolean>>
  ? boolean
  : T extends DateField<FieldArgs<Date>>
  ? Date
  : T extends ModelField<infer U>
  ? ModelRecord<U["definition"]>
  : T extends ArrayField<infer U>
  ? U extends Field<FieldType>
    ? RecordField<U>[]
    : U extends IModel<ModelDefinition>
    ? ModelRecord<U["definition"]>[]
    : never
  : never

export type ModelEvent = "write" | "beforewrite" | "delete" | "beforedelete"

export type NonCancellableModelEventCallback<T extends ModelDefinition> = (
  data: ModelRecord<T>
) => void

export type CancellableModelEventCallback<T extends ModelDefinition> = (
  data: ResolvedModel<T>,
  cancel: () => void
) => void

export type ModelEventCallback<T extends ModelDefinition, U extends ModelEvent> = U extends
  | "write"
  | "delete"
  ? NonCancellableModelEventCallback<T>
  : CancellableModelEventCallback<T>
