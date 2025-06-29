import type { TaskContext } from "../types"
import { abortTx, createTaskContext } from "../utils.js"

/**
 * Manages transaction queuing and execution
 */
export class TransactionManager {
  constructor(private getDb: () => Promise<IDBDatabase>, private storeNames: string[]) {}

  /**
   * Queues a task to be executed within a transaction
   */
  async queueTask<TResult>(
    taskHandler: (
      ctx: TaskContext,
      resolve: (value: TResult) => void,
      reject: (reason?: any) => void
    ) => void | Promise<void>,
    currentContext?: TaskContext
  ): Promise<TResult> {
    return new Promise<TResult>(async (outerResolve, outerReject) => {
      // If we're already in a transaction context, use it
      if (currentContext) {
        return taskHandler(currentContext, outerResolve, outerReject)
      }

      // Otherwise create a new transaction
      const db = await this.getDb()
      const taskCtx = createTaskContext(db, db.transaction(this.storeNames, "readwrite"))

      const reject = (reason?: any) => {
        abortTx(taskCtx.tx)
        outerReject(reason)
      }

      const resolve = async (result: TResult) => {
        try {
          // Execute all pre-commit callbacks
          await Promise.all(Array.from(taskCtx.onWillCommit.values()).map((cb) => cb()))

          // Wait for transaction to complete
          await new Promise((res, rej) => {
            taskCtx.tx.addEventListener("complete", res, { once: true })
            taskCtx.tx.addEventListener("error", rej, { once: true })
            taskCtx.tx.addEventListener("abort", rej, { once: true })
          })

          outerResolve(result)
        } catch (error) {
          reject(error)
        }
      }

      try {
        await taskHandler(taskCtx, resolve, reject)
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Executes a task within a readonly transaction
   */
  async queueReadTask<TResult>(
    taskHandler: (
      tx: IDBTransaction,
      resolve: (value: TResult) => void,
      reject: (reason?: any) => void
    ) => void,
    currentTx?: IDBTransaction
  ): Promise<TResult> {
    return new Promise<TResult>(async (resolve, reject) => {
      if (currentTx) {
        return taskHandler(currentTx, resolve, reject)
      }

      const db = await this.getDb()
      const tx = db.transaction(this.storeNames, "readonly")

      tx.onerror = () => reject(tx.error)
      taskHandler(tx, resolve, reject)
    })
  }

  /**
   * Creates a store-specific transaction manager
   */
  forStore(storeName: string): TransactionManager {
    return new TransactionManager(this.getDb, [storeName])
  }
}
