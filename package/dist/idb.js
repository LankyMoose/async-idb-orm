class AsyncIDB {
    name;
    models;
    version;
    db = null;
    stores = {};
    initialization = null;
    constructor(name, models, version) {
        this.name = name;
        this.models = models;
        this.version = version;
        for (const model of Object.values(this.models)) {
            this.stores[model.name] = new AsyncIDBStore(model, this);
        }
    }
    async init() {
        if (this.initialization)
            return this.initialization;
        this.initialization = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, this.version);
            request.onerror = (e) => reject(e);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this);
            };
            request.onupgradeneeded = () => {
                this.db = request.result;
                for (const store of Object.values(this.stores)) {
                    if (this.db.objectStoreNames.contains(store.name)) {
                        console.debug(`Store ${store.name} already exists, skipping...`);
                        continue;
                    }
                    this.initializeStore(store, this.db);
                }
                resolve(this);
            };
        });
        return this.initialization;
    }
    initializeStore(wrapper, db) {
        const primaryKeys = Object.keys(wrapper.model.definition).filter((key) => wrapper.model.definition[key].options.primaryKey);
        const indexes = Object.keys(wrapper.model.definition).filter((key) => wrapper.model.definition[key].options.index);
        wrapper.store = db.createObjectStore(wrapper.model.name, {
            keyPath: primaryKeys ?? undefined,
            autoIncrement: primaryKeys.length > 0,
        });
        for (const index of indexes) {
            wrapper.store.createIndex(`idx_${this.name}_${index}`, index, { unique: true });
        }
    }
}
export class AsyncIDBStore {
    model;
    name;
    store = null;
    db;
    constructor(model, db) {
        this.model = model;
        this.name = model.name;
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
        const db = await this.db.init();
        this.store = db.db.transaction(this.name, "readwrite").objectStore(this.name);
        return this.store;
    }
    async create(data) {
        if (!this.onBefore("write", data))
            return;
        const request = (this.store ?? (await this.getStore())).add(data);
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
        if (!this.onBefore("write", data))
            return;
        const request = (this.store ?? (await this.getStore())).put(data, id);
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
    db.init();
    return Object.values(models).reduce((acc, store) => {
        return {
            ...acc,
            [store.name]: db.stores[store.name],
        };
    }, {});
}
