import { IModel, ModelDefinition, ResolvedField, ResolvedModel } from "types"

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
  private _unique: boolean = false
  private _default?: ResolvedField<Field<this["type"]>>

  constructor(
    public type: T,
    public model?: IModel<ModelDefinition>,
    public field?: Field<FieldType>
  ) {}

  unique() {
    this._unique = true
    return this
  }

  optional() {
    return new OptionalField(this.type, this.model, this.field)
  }

  default(value: ResolvedField<Field<this["type"]>>) {
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

type ModelEvent = "write" | "beforewrite" | "delete" | "beforedelete"

type NonCancellableModelEventCallback<T extends ModelDefinition> = (data: ResolvedModel<T>) => void
type CancellableModelEventCallback<T extends ModelDefinition> = (
  data: ResolvedModel<T>,
  cancel: () => void
) => void

type ModelEventCallback<T extends ModelDefinition, U extends ModelEvent> = U extends
  | "write"
  | "delete"
  ? NonCancellableModelEventCallback<T>
  : CancellableModelEventCallback<T>

export class Model<T extends ModelDefinition> implements IModel<T> {
  private writeCallbacks: ModelEventCallback<T, ModelEvent>[] = []
  private beforeWriteCallbacks: ModelEventCallback<T, ModelEvent>[] = []
  private deleteCallbacks: ModelEventCallback<T, ModelEvent>[] = []
  private beforeDeleteCallbacks: ModelEventCallback<T, ModelEvent>[] = []

  constructor(public name: string, public definition: T) {
    this.name = name
    this.definition = definition
  }

  on<U extends ModelEvent>(evtName: U, callback: ModelEventCallback<T, U>) {
    switch (evtName) {
      case "write":
        this.writeCallbacks.push(callback)
        break
      case "beforewrite":
        this.beforeWriteCallbacks.push(callback)
        break
      case "delete":
        this.deleteCallbacks.push(callback)
        break
      case "beforedelete":
        this.beforeDeleteCallbacks.push(callback)
        break
      default:
        throw new Error(`Unknown event ${evtName}`)
    }
  }
}

export function model<T extends ModelDefinition>(name: string, definition: T): Model<T> {
  return new Model(name, definition)
}
