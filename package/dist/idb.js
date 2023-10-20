class AsyncIDB {
    name;
    models;
    version;
    db = null;
    stores = {};
    initialization = undefined;
    constructor(name, models, version) {
        this.name = name;
        this.models = models;
        this.version = version;
        for (const [key, model] of Object.entries(this.models)) {
            this.stores[key] = new AsyncIDBStore(model, this, key);
        }
        this.init();
    }
    async init() {
        if (this.initialization)
            return this.initialization;
        this.initialization = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, this.version);
            request.onerror = (e) => reject(e);
            request.onsuccess = () => {
                this.db = request.result;
                this.onConnected(this.db);
                resolve(this);
            };
            request.onupgradeneeded = () => {
                this.db = request.result;
                this.onConnected(this.db);
                resolve(this);
            };
        });
        return this;
    }
    onConnected(db) {
        for (const store of Object.values(this.stores)) {
            this.initializeStore(store, db);
        }
    }
    initializeStore(store, db) {
        const primaryKeys = Object.keys(store.model.definition).filter((key) => store.model.definition[key].options.primaryKey);
        const hasStore = db.objectStoreNames.contains(store.name);
        store.store = hasStore
            ? db.transaction(store.name, "readwrite").objectStore(store.name)
            : db.createObjectStore(store.name, {
                keyPath: primaryKeys.length === 1 ? primaryKeys[0] : primaryKeys,
                autoIncrement: primaryKeys.length === 1,
            });
        if (!hasStore) {
            const indexes = Object.entries(store.model.definition).filter(([_, val]) => val.options.index);
            for (const [key, val] of indexes) {
                store.store.createIndex(`idx_${key}_${store.name}_${this.name}`, key, {
                    unique: val.options.primaryKey,
                });
            }
        }
    }
}
export class AsyncIDBStore {
    model;
    name;
    store = undefined;
    db;
    constructor(model, db, name) {
        this.model = model;
        this.name = name;
        this.db = db;
    }
    onBefore(evtName, data) {
        const callbacks = this.model.callbacks(`before${evtName}`);
        let cancelled = false;
        for (const callback of callbacks) {
            ;
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
    async getStore() {
        if (this.store)
            return this.store;
        await this.db.init();
        return this.store;
    }
    async create(data) {
        const record = this.model.applyDefaults(data);
        if (!this.onBefore("write", record))
            return;
        const request = (this.store ?? (await this.getStore())).add(record);
        return new Promise((resolve, reject) => {
            request.onerror = (err) => reject(err);
            request.onsuccess = () => this.read(request.result).then((data) => {
                this.onAfter("write", data);
                resolve(data);
            });
        });
    }
    async read(id) {
        const request = (this.store ?? (await this.getStore())).get(id);
        return new Promise((resolve, reject) => {
            request.onerror = (err) => reject(err);
            request.onsuccess = () => resolve(request.result);
        });
    }
    async update(id, data) {
        const record = this.model.applyDefaults(data);
        if (!this.onBefore("write", record))
            return;
        const request = (this.store ?? (await this.getStore())).put(record, id);
        return new Promise((resolve, reject) => {
            request.onerror = (err) => reject(err);
            request.onsuccess = () => this.read(request.result).then((data) => {
                this.onAfter("write", data);
                resolve(data);
            });
        });
    }
    async delete(id) {
        const data = await this.read(id);
        if (!this.onBefore("delete", data))
            return;
        const request = (this.store ?? (await this.getStore())).delete(id);
        return new Promise((resolve, reject) => {
            request.onerror = (err) => reject(err);
            request.onsuccess = () => {
                this.onAfter("delete", data);
                resolve();
            };
        });
    }
    async clear() {
        const request = (this.store ?? (await this.getStore())).clear();
        return new Promise((resolve, reject) => {
            request.onerror = (err) => reject(err);
            request.onsuccess = () => resolve();
        });
    }
}
export function idb(name, models, version) {
    const db = new AsyncIDB(name, models, version);
    return Object.entries(models).reduce((acc, [key]) => {
        return {
            ...acc,
            [key]: db.stores[key],
        };
    }, {});
}
