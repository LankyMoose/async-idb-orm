import {
  FieldArgs,
  IModel,
  ModelDefinition,
  ModelEvent,
  ModelEventCallback,
  ModelRecord,
  ResolvedModel,
} from "./types.js"

export enum FieldType {
  String = "string",
  Number = "number",
  BigInt = "bigint",
  Boolean = "boolean",
  Date = "date",
  Model = "model",
  Array = "array",
}

export abstract class Field<
  T extends FieldType,
  U extends FieldArgs<unknown> = FieldArgs<unknown>
> {
  type: T
  options: U = {} as U

  constructor(type: T, args: U) {
    this.type = type
    this.options = args
  }

  static string<T extends FieldArgs<string>>(args: T = {} as T) {
    return new StringField(args)
  }

  static number<T extends FieldArgs<number>>(args: T = {} as T) {
    return new NumberField(args)
  }

  static bigint<T extends FieldArgs<bigint>>(args: T = {} as T) {
    return new BigIntField(args)
  }

  static boolean<T extends FieldArgs<boolean>>(args: T = {} as T) {
    return new BooleanField(args)
  }

  static date<T extends FieldArgs<Date>>(args: T = {} as T) {
    return new DateField(args)
  }

  static model<T extends Model<ModelDefinition>>(model: T) {
    return new ModelField(model)
  }

  static array<U extends IModel<ModelDefinition> | Field<FieldType>>(modelOrField: U) {
    return new ArrayField(modelOrField)
  }
}

export class StringField<T extends FieldArgs<string>> extends Field<FieldType.String, T> {
  constructor(args: T) {
    super(FieldType.String, args)
  }
}

export class NumberField<T extends FieldArgs<number>> extends Field<FieldType.Number, T> {
  constructor(args: T) {
    super(FieldType.Number, args)
  }
}

export class BigIntField<T extends FieldArgs<bigint>> extends Field<FieldType.BigInt, T> {
  constructor(args: T) {
    super(FieldType.BigInt, args)
  }
}

export class BooleanField<T extends FieldArgs<boolean>> extends Field<FieldType.Boolean, T> {
  constructor(args: T) {
    super(FieldType.Boolean, args)
  }
}

export class DateField<T extends FieldArgs<Date>> extends Field<FieldType.Date, T> {
  constructor(args: T) {
    super(FieldType.Date, args)
  }
}

export class ModelField<T extends Model<ModelDefinition>> extends Field<FieldType.Model> {
  model: T
  constructor(model: T) {
    super(FieldType.Model, {})
    this.model = model
  }
}

export class ArrayField<
  T extends IModel<ModelDefinition> | Field<FieldType>
> extends Field<FieldType.Array> {
  field?: Field<FieldType>
  model?: IModel<ModelDefinition>
  constructor(modalOrField: T) {
    super(FieldType.Array, {})
    if (modalOrField instanceof Field) {
      this.field = modalOrField
    } else {
      this.model = modalOrField
    }
  }
}

export class Model<T extends ModelDefinition> implements IModel<T> {
  definition: T
  private _callbacks: Record<ModelEvent, ModelEventCallback<T, ModelEvent>[]> = {
    write: [],
    beforewrite: [],
    delete: [],
    beforedelete: [],
  }

  constructor(definition: T) {
    this.definition = definition
  }

  getIDBValidKeys<U extends ModelRecord<T>>(item: U) {
    return Object.keys(this.definition)
      .filter((field) => this.definition[field].options.primaryKey)
      .map((field) => item[field as keyof U])
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

  applyDefaults<U extends ResolvedModel<T>>(data: U): ResolvedModel<T> {
    const record = { ...data } as ResolvedModel<T>

    for (const [key, field] of Object.entries(this.definition)) {
      if (field.options.default && record[key as keyof ResolvedModel<T>] === undefined) {
        record[key as keyof ResolvedModel<T>] =
          typeof field.options.default === "function"
            ? field.options.default()
            : field.options.default
        continue
      }

      if (field instanceof ModelField) {
        record[key as keyof ResolvedModel<T>] = field.model.applyDefaults(
          record[key as keyof ResolvedModel<T>] as ResolvedModel<T>
        )
        continue
      }

      if (field instanceof ArrayField) {
        // @ts-expect-error TODO: improve this
        record[key as keyof ResolvedModel<T>] = (
          (record[key as keyof ResolvedModel<T>] ?? []) as ResolvedModel<T>[]
        ).map((item) => {
          if (field.model) {
            return (field.model as Model<ModelDefinition>).applyDefaults(item)
          }
          return item
        })
        continue
      }
    }
    return record
  }
}

export function model<T extends ModelDefinition>(definition: T) {
  return new Model(definition)
}
