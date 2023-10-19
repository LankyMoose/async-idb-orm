type ModelDefinition = Record<string, Field<FieldType>>

type Model<T extends ModelDefinition> = {
  name: string
  definition: T
}

type ModelSchema = Record<string, Model<ModelDefinition>>
