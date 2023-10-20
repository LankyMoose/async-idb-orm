import { IModel, ModelDefinition, ModelEvent, ModelEventCallback, ResolvedModel } from "types"

export enum FieldType {
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

  constructor(
    public type: T,
    public model?: IModel<ModelDefinition>,
    public field?: Field<FieldType>,
    unique?: boolean
  ) {
    this._unique = unique
  }

  uniqueKey() {
    return new UniqueField(this.type, this.model, this.field)
  }

  optional() {
    return new OptionalField(this.type, this.model, this.field, this._unique)
  }

  static string() {
    return new StringField()
  }

  static number() {
    return new NumberField()
  }

  static bigint() {
    return new BigIntField()
  }

  static boolean() {
    return new BooleanField()
  }

  static date() {
    return new DateField()
  }

  static model<T extends Model<ModelDefinition>>(model: T) {
    return new ModelField(model)
  }

  static array<U extends IModel<ModelDefinition> | Field<FieldType>>(modelOrField: U) {
    return new ArrayField(modelOrField)
  }
}

class StringField extends Field<FieldType.String> {
  private _default?: string | (() => string)
  constructor() {
    super(FieldType.String)
  }
  default(value: string | (() => string)): this {
    this._default = value
    return this
  }
}

class NumberField extends Field<FieldType.Number> {
  private _default?: number | (() => number)
  constructor() {
    super(FieldType.Number)
  }
  default(value: number | (() => number)): this {
    this._default = value
    return this
  }
}

class BigIntField extends Field<FieldType.BigInt> {
  private _default?: bigint | (() => bigint)
  constructor() {
    super(FieldType.BigInt)
  }
  default(value: bigint | (() => bigint)): this {
    this._default = value
    return this
  }
}

class BooleanField extends Field<FieldType.Boolean> {
  private _default?: boolean | (() => boolean)
  constructor() {
    super(FieldType.Boolean)
  }
  default(value: boolean | (() => boolean)): this {
    this._default = value
    return this
  }
}

class DateField extends Field<FieldType.Date> {
  private _default?: Date | (() => Date)
  constructor() {
    super(FieldType.Date)
  }
  default(value: Date | (() => Date)): this {
    this._default = value
    return this
  }
}

export class UniqueField<T extends FieldType> extends Field<T> {
  constructor(type: T, model?: IModel<ModelDefinition>, field?: Field<FieldType>) {
    super(type, model, field, true)
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

  maxKey() {
    return this.definition.id.type === FieldType.Number ? Infinity : undefined
  }
}

export function model<T extends ModelDefinition>(name: string, definition: T) {
  return new Model(name, definition)
}
