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
    onConnected(db: IDBDatabase): void;
    initializeStore(store: AsyncIDBStore<ModelDefinition>, db: IDBDatabase): void;
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
    create(data: ResolvedModel<T>): Promise<ModelRecord<T> | undefined>;
    read(id: IDBValidKey): Promise<ModelRecord<T>>;
    update(data: ResolvedModel<T>): Promise<ModelRecord<T> | undefined>;
    delete(id: IDBValidKey): Promise<void>;
    clear(): Promise<void>;
    find(predicate: (item: ModelRecord<T>) => boolean): Promise<void | ModelRecord<T>>;
    findMany(predicate: (item: ModelRecord<T>) => boolean): Promise<ModelRecord<T>[]>;
    all(): Promise<ModelRecord<T>[]>;
    count(): Promise<number>;
    upsert(...data: ResolvedModel<T>[]): Promise<(Awaited<ModelRecord<T>> | undefined)[]>;
    max<U extends keyof T & string>(field: U): Promise<IDBValidKey>;
}
export declare function idb<T extends ModelSchema>(name: string, models: T, version?: number): {
    [key in keyof T]: AsyncIDBStore<T[key]["definition"]>;
};
export {};
