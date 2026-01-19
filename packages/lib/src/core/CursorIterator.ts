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
    const queue: IteratorResult<T>[] = []
    let resolveNext: ((value: IteratorResult<T>) => void) | null = null
    let finished = false
    let error: DOMException | null = null

    const enqueue = (result: IteratorResult<T>) => {
      if (!resolveNext) {
        // no one is waiting for the next value, so we'll buffer it
        queue.push(result)
        return
      }

      resolveNext(result)
      resolveNext = null
    }

    request.onerror = () => {
      finished = true
      error = request.error
      enqueue({ done: true, value: undefined })
    }

    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        finished = true
        enqueue({ done: true, value: undefined })
        return
      }

      const value = deserialize(cursor.value)
      enqueue({ done: false, value })
      cursor.continue()
    }

    return {
      [Symbol.asyncIterator]() {
        return this
      },
      async next(): Promise<IteratorResult<T>> {
        if (error) {
          throw error
        }

        if (queue.length > 0) {
          return queue.shift()!
        }

        if (finished) {
          return { done: true, value: undefined }
        }

        return new Promise<IteratorResult<T>>((resolve) => {
          resolveNext = resolve
        })
      },
    }
  }
}
