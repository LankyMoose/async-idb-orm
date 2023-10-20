import {
  IModel,
  ModelDefinition,
  ModelEvent,
  ModelEventCallback,
  ResolvedField,
  ResolvedModel,
} from "types"

export enum FieldType {
  None = "none",
  String = "string",
  Number = "number",
  BigInt = "bigint",
  Boolean = "boolean",
  Date = "date",
  Model = "model",
  Array = "array",
}

export class Field<T extends FieldType> {
  private _unique?: boolean
  private _default?: ResolvedField<T>

  constructor(
    public type: T,
    public model?: IModel<ModelDefinition>,
    public field?: Field<FieldType>,
    unique?: boolean,
    defaultValue?: ResolvedField<T>
  ) {
    this._unique = unique
    this._default = defaultValue
  }

  uniqueKey() {
    return new UniqueField(
      this.type,
      this.model,
      this.field,
      true,
      // @ts-ignore
      this._default as ResolvedField<T>
    )
  }

  optional() {
    return new OptionalField(
      this.type,
      this.model,
      this.field,
      this._unique,
      this._default as ResolvedField<T>
    )
  }

  default(value: ResolvedField<T>) {
    this._default = value
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

  static array<U extends IModel<ModelDefinition> | Field<FieldType>>(modelOrField: U) {
    return new ArrayField(modelOrField)
  }
}

export class UniqueField<T extends FieldType> extends Field<T> {}

export class ModelField<T extends Model<ModelDefinition>> extends Field<FieldType.Model> {
  constructor(model: T) {
    super(FieldType.Model, model)
  }
}

export class OptionalField<T extends FieldType> extends Field<T> {
  _optional: boolean = true
}

export class ArrayField<
  T extends IModel<ModelDefinition> | Field<FieldType>
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

export class Model<T extends ModelDefinition> implements IModel<T> {
  private _callbacks: Record<ModelEvent, ModelEventCallback<T, ModelEvent>[]> = {
    write: [],
    beforewrite: [],
    delete: [],
    beforedelete: [],
  }

  constructor(public name: string, public definition: T) {
    this.name = name
    this.definition = definition
  }

  getIDBValidKeys(item: ResolvedModel<T>) {
    return Object.keys(this.definition)
      .filter((key) => this.definition[key] instanceof UniqueField)
      .map((key) => item[key as keyof ResolvedModel<T>])
  }

  callbacks<T extends ModelEvent>(evtName: T) {
    return this._callbacks[evtName]
  }

  on<U extends ModelEvent>(evtName: U, callback: ModelEventCallback<T, U>) {
    switch (evtName) {
      case "write":
        this._callbacks.write.push(callback)
        break
      case "beforewrite":
        this._callbacks.beforewrite.push(callback)
        break
      case "delete":
        this._callbacks.delete.push(callback)
        break
      case "beforedelete":
        this._callbacks.beforedelete.push(callback)
        break
      default:
        throw new Error(`Unknown event ${evtName}`)
    }
  }
}

export function model<T extends ModelDefinition>(name: string, definition: T) {
  return new Model(name, definition)
}
