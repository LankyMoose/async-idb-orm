/**
 * Utility class for handling cursor iterations in IndexedDB
 */
export class CursorIterator {
  /**
   * Iterates through all records matching a predicate with optional limit
   */
  static async findByPredicate<T>(
    objectStore: IDBObjectStore,
    predicate: (value: T) => boolean,
    options: {
      limit?: number
      deserialize?: (value: any) => T
    } = {}
  ): Promise<T[]> {
    const { limit = Infinity, deserialize = (v) => v } = options
    const results: T[] = []

    return new Promise((resolve, reject) => {
      const request = objectStore.openCursor()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor || results.length >= limit) {
          return resolve(results)
        }

        const value = deserialize(cursor.value)
        if (predicate(value)) {
          results.push(value)
        }

        cursor.continue()
      }
    })
  }

  /**
   * Deletes records matching a predicate with optional limit
   */
  static async deleteByPredicate<T>(
    objectStore: IDBObjectStore,
    predicate: (value: T) => boolean,
    options: {
      limit?: number
      deserialize?: (value: any) => T
      onBeforeDelete?: (record: T, key: IDBValidKey) => Promise<void>
      onAfterDelete?: (record: T) => void
    } = {}
  ): Promise<T[]> {
    const { limit = Infinity, deserialize = (v) => v, onBeforeDelete, onAfterDelete } = options
    const results: T[] = []
    let remaining = limit

    return new Promise((resolve, reject) => {
      const request = objectStore.openCursor()

      request.onerror = () => reject(request.error)
      request.onsuccess = async () => {
        const cursor = request.result
        if (!cursor || remaining <= 0) {
          return resolve(results)
        }

        const record = deserialize(cursor.value)
        if (!predicate(record)) {
          return cursor.continue()
        }

        try {
          if (onBeforeDelete) {
            await onBeforeDelete(record, cursor.key)
          }

          const deleteRequest = cursor.delete()
          deleteRequest.onerror = () => reject(deleteRequest.error)
          deleteRequest.onsuccess = () => {
            if (onAfterDelete) {
              onAfterDelete(record)
            }
            results.push(record)
            remaining--
            cursor.continue()
          }
        } catch (error) {
          reject(error)
        }
      }
    })
  }

  /**
   * Gets records from an index within a key range
   */
  static async getIndexRange<T>(
    index: IDBIndex,
    keyRange: IDBKeyRange,
    deserialize: (value: any) => T = (v) => v
  ): Promise<T[]> {
    const results: T[] = []

    return new Promise((resolve, reject) => {
      const request = index.openCursor(keyRange)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) {
          return resolve(results)
        }

        results.push(deserialize(cursor.value))
        cursor.continue()
      }
    })
  }

  /**
   * Gets the first record from an index in the specified direction
   */
  static async getFirstByDirection<T>(
    index: IDBIndex,
    direction: IDBCursorDirection,
    deserialize: (value: any) => T = (v) => v
  ): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const request = index.openCursor(null, direction)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) {
          return resolve(null)
        }

        resolve(deserialize(cursor.value))
      }
    })
  }

  /**
   * Creates an async iterator for cursor results
   */
  static createAsyncIterator<T>(
    request: IDBRequest<IDBCursorWithValue | null>,
    deserialize: (value: any) => T = (v) => v
  ): AsyncIterableIterator<T> {
    let resolveNext: (value: IteratorResult<T>) => void
    let rejectNext: (error: any) => void
    let nextPromise = new Promise<IteratorResult<T>>((resolve, reject) => {
      resolveNext = resolve
      rejectNext = reject
    })

    let finished = false

    request.onerror = () => {
      finished = true
      rejectNext(request.error)
    }

    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        finished = true
        resolveNext({ done: true, value: undefined })
        return
      }

      const value = deserialize(cursor.value)
      resolveNext({ done: false, value })

      // Prepare next promise
      nextPromise = new Promise<IteratorResult<T>>((resolve, reject) => {
        resolveNext = resolve
        rejectNext = reject
      })

      cursor.continue()
    }

    return {
      [Symbol.asyncIterator]() {
        return this
      },
      async next(): Promise<IteratorResult<T>> {
        if (finished) {
          return { done: true, value: undefined }
        }
        return nextPromise
      },
    }
  }
}
