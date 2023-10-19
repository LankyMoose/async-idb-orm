import { Field, ArrayField, FieldType, ModelField, OptionalField } from "model"

export type ModelDefinition = Record<string, Field<FieldType>>

export type Model<T extends ModelDefinition> = {
  name: string
  definition: T
}

export type ModelSchema = Record<string, Model<ModelDefinition>>

export type ResolvedModel<T extends ModelDefinition> = {
  [key in keyof T as T[key] extends OptionalField<FieldType> ? never : key]: ResolvedField<T[key]>
} & {
  [key in keyof T as T[key] extends OptionalField<FieldType> ? key : never]?:
    | ResolvedField<T[key]>
    | undefined
}

export type ResolvedField<T extends Field<FieldType>> = T extends Field<FieldType.String>
  ? string
  : T extends Field<FieldType.Number>
  ? number
  : T extends Field<FieldType.BigInt>
  ? bigint
  : T extends Field<FieldType.Boolean>
  ? boolean
  : T extends Field<FieldType.Date>
  ? Date
  : T extends ModelField<infer U>
  ? ResolvedModel<U["definition"]>
  : T extends ArrayField<infer U>
  ? U extends Model<ModelDefinition>
    ? ResolvedModel<U["definition"]>[]
    : U extends Field<FieldType>
    ? ResolvedField<U>[]
    : never
  : never
