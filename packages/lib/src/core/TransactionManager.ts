import { TaskContext } from "./TaskContext.js"

/**
 * Manages transaction queuing and execution
 */
export class TransactionManager {
  constructor(private getDb: () => Promise<IDBDatabase>, private storeNames: string[]) {}

  /**
   * Queues a task to be executed within a transaction
   */
  async queueTask<TResult>(
    taskHandler: (ctx: TaskContext) => Promise<TResult>,
    currentContext?: TaskContext
  ): Promise<TResult> {
    if (currentContext) {
      return taskHandler(currentContext)
    }
    const db = await this.getDb()
    const tx = db.transaction(this.storeNames, "readwrite")
    return new TaskContext(db, tx).run(taskHandler)
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
}
