import { FieldArgs, IModel, ModelDefinition, ModelEvent, ModelEventCallback, ModelRecord } from "./types.js";
export declare enum FieldType {
    String = "string",
    Number = "number",
    BigInt = "bigint",
    Boolean = "boolean",
    Date = "date",
    Model = "model",
    Array = "array"
}
export declare abstract class Field<T extends FieldType, U extends FieldArgs<any> = FieldArgs<any>> {
    type: T;
    options: U;
    constructor(type: T, args: U);
    static string<T extends FieldArgs<string>>(args?: T): StringField<T>;
    static number<T extends FieldArgs<number>>(args?: T): NumberField<T>;
    static bigint<T extends FieldArgs<bigint>>(args?: T): BigIntField<T>;
    static boolean<T extends FieldArgs<boolean>>(args?: T): BooleanField<T>;
    static date<T extends FieldArgs<Date>>(args?: T): DateField<T>;
    static model<T extends Model<ModelDefinition>>(model: T): ModelField<T>;
    static array<U extends IModel<ModelDefinition> | Field<FieldType>>(modelOrField: U): ArrayField<U>;
}
export declare class StringField<T extends FieldArgs<string>> extends Field<FieldType.String, T> {
    constructor(args: T);
}
export declare class NumberField<T extends FieldArgs<number>> extends Field<FieldType.Number, T> {
    constructor(args: T);
}
export declare class BigIntField<T extends FieldArgs<bigint>> extends Field<FieldType.BigInt, T> {
    constructor(args: T);
}
export declare class BooleanField<T extends FieldArgs<boolean>> extends Field<FieldType.Boolean, T> {
    constructor(args: T);
}
export declare class DateField<T extends FieldArgs<Date>> extends Field<FieldType.Date, T> {
    constructor(args: T);
}
export declare class ModelField<T extends Model<ModelDefinition>> extends Field<FieldType.Model> {
    model: T;
    constructor(model: T);
}
export declare class ArrayField<T extends IModel<ModelDefinition> | Field<FieldType>> extends Field<FieldType.Array> {
    field?: T;
    model?: IModel<ModelDefinition>;
    constructor(modalOrField: T);
}
export declare class Model<T extends ModelDefinition> implements IModel<T> {
    definition: T;
    private _callbacks;
    constructor(definition: T);
    getIDBValidKeys<U extends ModelRecord<T>>(item: U): U[keyof U][];
    callbacks<T extends ModelEvent>(evtName: T): Record<ModelEvent, ModelEventCallback<T, ModelEvent>[]>[T];
    on<U extends ModelEvent>(evtName: U, callback: ModelEventCallback<T, U>): void;
}
export declare function model<T extends ModelDefinition>(definition: T): Model<T>;
