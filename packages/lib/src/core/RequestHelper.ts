/**
 * Utility class to wrap IndexedDB requests in promises and handle common patterns
 */
export class RequestHelper {
  /**
   * Wraps an IDB request in a promise
   */
  static promisify<T = any>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  /**
   * Executes a callback-style IDB operation and wraps it in a promise
   */
  static execute<T>(
    operation: (resolve: (value: T) => void, reject: (reason?: any) => void) => void
  ): Promise<T> {
    return new Promise(operation)
  }

  /**
   * Gets a record by key from an object store
   */
  static async get<T>(objectStore: IDBObjectStore, key: IDBValidKey): Promise<T | null> {
    const request = objectStore.get(key)
    const result = await this.promisify(request)
    return result || null
  }

  /**
   * Checks if a record exists by key
   */
  static async exists(objectStore: IDBObjectStore, key: IDBValidKey): Promise<boolean> {
    if (key === undefined) return false
    const request = objectStore.getKey(key)
    const result = await this.promisify(request)
    return result === key
  }

  /**
   * Counts records in an object store
   */
  static count(objectStore: IDBObjectStore): Promise<number> {
    return this.promisify(objectStore.count())
  }

  /**
   * Clears all records from an object store
   */
  static clear(objectStore: IDBObjectStore): Promise<void> {
    return this.promisify(objectStore.clear())
  }

  /**
   * Adds a record to an object store
   */
  static add<T>(objectStore: IDBObjectStore, value: T): Promise<IDBValidKey> {
    return this.promisify(objectStore.add(value))
  }

  /**
   * Puts a record in an object store
   */
  static put<T>(objectStore: IDBObjectStore, value: T): Promise<IDBValidKey> {
    return this.promisify(objectStore.put(value))
  }

  /**
   * Deletes a record from an object store
   */
  static delete(objectStore: IDBObjectStore, key: IDBValidKey): Promise<void> {
    return this.promisify(objectStore.delete(key))
  }
}
