export class TaskContext {
  private abortReason?: any
  private error?: any
  private afterCommitCallbacks: (() => void)[]
  private beforeCommitCallbacks: Map<string, () => Promise<any>>
  private abortPromise: Promise<unknown>
  private errorPromise: Promise<unknown>
  private completePromise: Promise<unknown>
  private isAborted: boolean

  constructor(public db: IDBDatabase, public tx: IDBTransaction) {
    this.afterCommitCallbacks = []
    this.beforeCommitCallbacks = new Map()
    tx.addEventListener("complete", () => this.afterCommitCallbacks.forEach((cb) => cb()), {
      once: true,
    })

    this.abortPromise = new Promise<void>((resolve) => {
      tx.addEventListener(
        "abort",
        (reason) => {
          this.abortReason = reason
          this.isAborted = true
          resolve()
        },
        { once: true }
      )
    })
    this.errorPromise = new Promise<void>((resolve) =>
      tx.addEventListener(
        "error",
        (reason) => {
          this.abort()
          this.error = reason
          resolve()
        },
        { once: true }
      )
    )
    this.completePromise = new Promise((resolve) =>
      tx.addEventListener("complete", resolve, { once: true })
    )
    this.isAborted = false
  }

  async run<T>(cb: (ctx: this) => Promise<T>): Promise<T> {
    try {
      const result = await cb(this)
      await Promise.all([...Array.from(this.beforeCommitCallbacks.values()).map((cb) => cb())])
      await Promise.race([this.abortPromise, this.errorPromise, this.completePromise])
      const error = this.abortReason || this.error
      if (error) {
        throw error
      }
      return result
    } catch (error) {
      this.abort()
      throw error
    }
  }

  onDidCommit(cb: () => void) {
    this.afterCommitCallbacks.push(cb)
  }

  onWillCommit(key: string, cb: () => Promise<any>) {
    this.beforeCommitCallbacks.set(key, cb)
  }

  private abort() {
    if (this.isAborted) return
    try {
      this.tx.abort()
      this.isAborted = true
    } catch (error) {
      console.error("error aborting task", error)
    }
  }
}
