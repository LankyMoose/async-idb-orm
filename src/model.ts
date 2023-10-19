import { Model, ModelDefinition } from "types"

export enum FieldType {
  String,
  Number,
  BigInt,
  Boolean,
  Date,
  Model,
  Array,
}

export class Field<T extends FieldType> {
  _unique: boolean = false
  constructor(
    public type: T,
    public model?: Model<ModelDefinition>,
    public field?: Field<FieldType>
  ) {}

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

  static model<T extends Model<ModelDefinition>>(model: T) {
    return new ModelField(model)
  }

  static array<U extends Model<ModelDefinition> | Field<FieldType>>(modelOrField: U) {
    return new ArrayField(modelOrField)
  }
}

export class ModelField<T extends Model<ModelDefinition>> extends Field<FieldType.Model> {
  constructor(model: T) {
    super(FieldType.Model, model)
  }
}

export class ArrayField<
  T extends Model<ModelDefinition> | Field<FieldType>
> extends Field<FieldType> {
  constructor(modalOrField: T) {
    super(FieldType.Array)
    if (modalOrField instanceof Field) {
      this.field = modalOrField
    } else {
      this.model = modalOrField
    }
  }
}

export function model<T extends ModelDefinition>(name: string, definition: T): Model<T> {
  return {
    name,
    definition,
  }
}
