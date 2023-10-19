enum FieldType {
  String,
  Number,
  BigInt,
  Boolean,
  Date,
  Model,
  Array,
}

export class Field<T extends FieldType> {
  type: T
  _unique: boolean = false
  model?: ModelDefinition
  constructor(type: T, model?: ModelDefinition) {
    this.type = type
    this.model = model
  }

  unique() {
    this._unique = true
    return this
  }

  static string() {
    return new Field(FieldType.String)
  }

  static number() {
    return new Field(FieldType.Number)
  }

  static bigint() {
    return new Field(FieldType.BigInt)
  }

  static boolean() {
    return new Field(FieldType.Boolean)
  }

  static date() {
    return new Field(FieldType.Date)
  }

  static model<T extends ModelDefinition>(model: T) {
    return new Field(FieldType.Model, model)
  }

  static array<T extends ModelDefinition | Field<FieldType>>(modelOrField: T) {
    return new ArrayField(modelOrField)
  }
}

class ArrayField<T extends ModelDefinition | Field<FieldType>> extends Field<FieldType> {
  _fieldType: T

  constructor(type: T) {
    super(FieldType.Array)
    this._fieldType = type
  }
}

export function model<T extends ModelDefinition>(name: string, definition: T): Model<T> {
  return {
    name,
    definition,
  }
}
