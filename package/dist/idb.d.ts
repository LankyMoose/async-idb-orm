import { Model } from "./model.js";
import { ModelSchema, ModelDefinition, ResolvedModel, IModel, ModelRecord } from "./types.js";
declare class AsyncIDB {
    private name;
    private models;
    private version?;
    db: IDBDatabase | null;
    stores: {
        [key: string]: AsyncIDBStore<ModelDefinition>;
    };
    initialization: Promise<this> | undefined;
    constructor(name: string, models: ModelSchema, version?: number | undefined);
    init(): Promise<this>;
    private onConnected;
    private initializeStore;
}
export declare class AsyncIDBStore<T extends ModelDefinition> {
    model: Model<T>;
    name: string;
    store: IDBObjectStore | undefined;
    db: AsyncIDB;
    constructor(model: IModel<T>, db: AsyncIDB, name: string);
    private onBefore;
    private onAfter;
    private getStore;
    private applyDefaults;
    create(data: ResolvedModel<T>): Promise<ModelRecord<T> | undefined>;
    read(id: IDBValidKey): Promise<ModelRecord<T>>;
    update(id: IDBValidKey, data: ResolvedModel<T>): Promise<ModelRecord<T> | undefined>;
    delete(id: IDBValidKey): Promise<void>;
    clear(): Promise<void>;
}
export declare function idb<T extends ModelSchema>(name: string, models: T, version?: number): {
    [key in keyof T]: AsyncIDBStore<T[key]["definition"]>;
};
export {};
