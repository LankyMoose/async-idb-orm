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
    options = {};
    constructor(type, args) {
        this.type = type;
        this.options = args;
    }
    static string(args = {}) {
        return new StringField(args);
    }
    static number(args = {}) {
        return new NumberField(args);
    }
    static bigint(args = {}) {
        return new BigIntField(args);
    }
    static boolean(args = {}) {
        return new BooleanField(args);
    }
    static date(args = {}) {
        return new DateField(args);
    }
    static model(model) {
        return new ModelField(model);
    }
    static array(modelOrField) {
        return new ArrayField(modelOrField);
    }
}
export class StringField extends Field {
    constructor(args) {
        super(FieldType.String, args);
    }
}
export class NumberField extends Field {
    constructor(args) {
        super(FieldType.Number, args);
    }
}
export class BigIntField extends Field {
    constructor(args) {
        super(FieldType.BigInt, args);
    }
}
export class BooleanField extends Field {
    constructor(args) {
        super(FieldType.Boolean, args);
    }
}
export class DateField extends Field {
    constructor(args) {
        super(FieldType.Date, args);
    }
}
export class ModelField extends Field {
    model;
    constructor(model) {
        super(FieldType.Model, {});
        this.model = model;
    }
}
export class ArrayField extends Field {
    field;
    model;
    constructor(modalOrField) {
        super(FieldType.Array, {});
        if (modalOrField instanceof Field) {
            this.field = modalOrField;
        }
        else {
            this.model = modalOrField;
        }
    }
}
export class Model {
    definition;
    _callbacks = {
        write: [],
        beforewrite: [],
        delete: [],
        beforedelete: [],
    };
    constructor(definition) {
        this.definition = definition;
        this.definition = definition;
    }
    getIDBValidKeys(item) {
        return Object.keys(this.definition)
            .filter((field) => this.definition[field].options.primaryKey)
            .map((field) => item[field]);
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
export function model(definition) {
    return new Model(definition);
}
