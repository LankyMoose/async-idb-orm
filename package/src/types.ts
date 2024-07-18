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

export type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

export interface IModel<T extends ModelDefinition> {
  definition: T
}

export type ModelDefinition = Record<string, Field<FieldType>>

export type ModelSchema = Record<string, IModel<ModelDefinition>>

type OptionalField = { options: { optional: true } }
type UniqueField = { options: { unique: true } }
type DefaultField = { options: { default: FieldDefault<unknown> } }
type KeyField = { options: { key: true } }
export type ResolvedModel<T extends ModelDefinition> = Prettify<
  {
    [key in keyof T as T[key] extends OptionalField | UniqueField | DefaultField
      ? never
      : key]: ResolvedField<T[key]>
  } & {
    [key in keyof T as T[key] extends OptionalField | UniqueField | DefaultField ? key : never]?:
      | ResolvedField<T[key]>
      | undefined
  }
>

export type ModelRecord<T extends ModelDefinition> = Prettify<{
  [key in keyof T]: T[key] extends OptionalField
    ? RecordField<T[key]> | undefined
    : RecordField<T[key]>
}>

export type InferRecord<T extends IModel<ModelDefinition>> = ModelRecord<T["definition"]>
export type InferDto<T extends IModel<ModelDefinition>> = Prettify<
  {
    [key in keyof T["definition"] as T["definition"][key] extends OptionalField | KeyField
      ? never
      : key]: RecordField<T["definition"][key]>
  } & {
    [key in keyof T["definition"] as T["definition"][key] extends OptionalField | KeyField
      ? key
      : never]?: RecordField<T["definition"][key]>
  }
>

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

export type ModelEvent = "write" | "delete" | "write|delete"

export type ModelEventCallback<T extends ModelDefinition> = (data: ModelRecord<T>) => void
