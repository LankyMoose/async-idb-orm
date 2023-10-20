export var FieldType;
(function (FieldType) {
    FieldType["String"] = "string";
    FieldType["Number"] = "number";
    FieldType["BigInt"] = "bigint";
    FieldType["Boolean"] = "boolean";
    FieldType["Date"] = "date";
    FieldType["Model"] = "model";
    FieldType["Array"] = "array";
})(FieldType || (FieldType = {}));
export class Field {
    type;
    model;
    field;
    _unique;
    constructor(type, model, field, unique) {
        this.type = type;
        this.model = model;
        this.field = field;
        this._unique = unique;
    }
    uniqueKey() {
        return new UniqueField(this.type, this.model, this.field, true);
    }
    optional() {
        return new OptionalField(this.type, this.model, this.field, this._unique);
    }
    static string() {
        return new StringField();
    }
    static number() {
        return new Field(FieldType.Number);
    }
    static bigint() {
        return new Field(FieldType.BigInt);
    }
    static boolean() {
        return new Field(FieldType.Boolean);
    }
    static date() {
        return new Field(FieldType.Date);
    }
    static model(model) {
        return new ModelField(model);
    }
    static array(modelOrField) {
        return new ArrayField(modelOrField);
    }
}
export class StringField extends Field {
    _default;
    constructor() {
        super(FieldType.String);
    }
    default(value) {
        this._default = value;
        return this;
    }
}
export class NumberField extends Field {
    _default;
    constructor() {
        super(FieldType.Number);
    }
    default(value) {
        this._default = value;
        return this;
    }
}
export class BigIntField extends Field {
    _default;
    constructor() {
        super(FieldType.BigInt);
    }
    default(value) {
        this._default = value;
        return this;
    }
}
export class BooleanField extends Field {
    _default;
    constructor() {
        super(FieldType.Boolean);
    }
    default(value) {
        this._default = value;
        return this;
    }
}
export class DateField extends Field {
    _default;
    constructor() {
        super(FieldType.Date);
    }
    default(value) {
        this._default = value;
        return this;
    }
}
export class UniqueField extends Field {
}
export class ModelField extends Field {
    constructor(model) {
        super(FieldType.Model, model);
    }
}
export class OptionalField extends Field {
    _optional = true;
}
export class ArrayField extends Field {
    constructor(modalOrField) {
        super(FieldType.Array);
        if (modalOrField instanceof Field) {
            this.field = modalOrField;
        }
        else {
            this.model = modalOrField;
        }
    }
}
export class Model {
    name;
    definition;
    _callbacks = {
        write: [],
        beforewrite: [],
        delete: [],
        beforedelete: [],
    };
    constructor(name, definition) {
        this.name = name;
        this.definition = definition;
        this.name = name;
        this.definition = definition;
    }
    getIDBValidKeys(item) {
        return Object.keys(this.definition)
            .filter((key) => this.definition[key] instanceof UniqueField)
            .map((key) => item[key]);
    }
    callbacks(evtName) {
        return this._callbacks[evtName];
    }
    on(evtName, callback) {
        switch (evtName) {
            case "write":
                this._callbacks.write.push(callback);
                break;
            case "beforewrite":
                this._callbacks.beforewrite.push(callback);
                break;
            case "delete":
                this._callbacks.delete.push(callback);
                break;
            case "beforedelete":
                this._callbacks.beforedelete.push(callback);
                break;
            default:
                throw new Error(`Unknown event ${evtName}`);
        }
    }
}
export function model(name, definition) {
    return new Model(name, definition);
}
