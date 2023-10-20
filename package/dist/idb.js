import { UniqueField } from "model";
class AsyncIDB {
    name;
    models;
    version;
    db = null;
    stores = {};
    constructor(name, models, version) {
        this.name = name;
        this.models = models;
        this.version = version;
    }
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, this.version);
            request.onerror = (e) => reject(e);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this);
            };
            request.onupgradeneeded = () => {
                this.db = request.result;
                const _models = Object.values(this.models);
                for (const model of _models) {
                    if (this.db.objectStoreNames.contains(model.name))
                        continue;
                    const uniqueKeys = Object.keys(model.definition).filter((key) => model.definition[key] instanceof UniqueField);
                    this.db.createObjectStore(model.name, {
                        keyPath: uniqueKeys.length > 0 ? uniqueKeys : undefined,
                    });
                    this.stores[model.name] = new AsyncIDBStore(model, this.db);
                }
                resolve(this);
            };
        });
    }
}
class AsyncIDBStore {
    model;
    name;
    db;
    store;
    constructor(model, db) {
        this.model = model;
        this.name = model.name;
        this.db = db;
        this.store = db.transaction(model.name, "readwrite").objectStore(model.name);
    }
    onBefore(evtName, data) {
        const callbacks = this.model.callbacks(`before${evtName}`);
        for (const callback of callbacks) {
            let cancelled = false;
            callback(data, () => (cancelled = true));
            if (cancelled)
                return false;
        }
        return true;
    }
    onAfter(evtName, data) {
        const callbacks = this.model.callbacks(evtName);
        for (const callback of callbacks) {
            callback(data);
        }
    }
    async create(data) {
        if (!this.onBefore("write", data))
            return;
        const request = this.store.add(data);
        return new Promise((resolve, reject) => {
            request.onerror = (err) => reject(err);
            request.onsuccess = () => {
                this.onAfter("write", data);
                resolve(request.result);
            };
        });
    }
    async read(id) {
        const request = this.store.get(id);
        return new Promise((resolve, reject) => {
            request.onerror = (err) => reject(err);
            request.onsuccess = () => resolve(request.result);
        });
    }
    async update(id, data) {
        if (!this.onBefore("write", data))
            return;
        const request = this.store.put(data, id);
        return new Promise((resolve, reject) => {
            request.onerror = (err) => reject(err);
            request.onsuccess = () => {
                this.onAfter("write", data);
                resolve(request.result);
            };
        });
    }
    async delete(id) {
        const data = await this.read(id);
        if (!this.onBefore("delete", data))
            return;
        const request = this.store.delete(id);
        return new Promise((resolve, reject) => {
            request.onerror = (err) => reject(err);
            request.onsuccess = () => {
                this.onAfter("delete", data);
                resolve();
            };
        });
    }
}
export async function idb(name, models, version) {
    const db = await new AsyncIDB(name, models, version).init();
    return Object.values(models).reduce((acc, store) => {
        return {
            ...acc,
            [store.name]: db.stores[store.name],
        };
    }, {});
}
