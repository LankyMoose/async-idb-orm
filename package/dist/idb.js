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
        const primaryKeys = Object.keys(model.definition).filter((key) => model.definition[key].options.primaryKey);
        const indexes = Object.keys(model.definition).filter((key) => model.definition[key].options.index);
        this.store = db.createObjectStore(model.name, {
            keyPath: primaryKeys ?? undefined,
            autoIncrement: primaryKeys.length > 0,
        });
        for (const index of indexes) {
            this.store.createIndex(`idx_${this.name}_${index}`, index, { unique: true });
        }
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
    async create(data) {
        if (!this.onBefore("write", data))
            return;
        const request = this.store.add(data);
        return new Promise((resolve, reject) => {
            request.onerror = (err) => reject(err);
            request.onsuccess = () => this.read(request.result).then((data) => {
                this.onAfter("write", data);
                resolve(data);
            });
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
        const request = this.store.delete(id);
        return new Promise((resolve, reject) => {
            request.onerror = (err) => reject(err);
            request.onsuccess = () => {
                this.onAfter("delete", data);
                resolve();
            };
        });
    }
    async clear() {
        const request = this.store.clear();
        return new Promise((resolve, reject) => {
            request.onerror = (err) => reject(err);
            request.onsuccess = () => resolve();
        });
    }
}
async function getMaxByKey(store) {
    const request = store.store.openCursor("id", "prev");
    return new Promise((resolve, reject) => {
        request.onerror = (err) => reject(err);
        request.onsuccess = () => {
            resolve(request.result?.key);
        };
    });
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
