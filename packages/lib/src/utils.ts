import type { TaskContext } from "./types"

export const keyPassThroughProxy = new Proxy({}, { get: (_: any, key: string) => key })

export const abortTx = (tx: IDBTransaction) => {
  try {
    if (tx.error) return
    tx.abort()
  } catch {}
}

export const createTaskContext = (db: IDBDatabase, tx: IDBTransaction): TaskContext => {
  const onDidCommit: TaskContext["onDidCommit"] = []
  const ctx: TaskContext = {
    db,
    tx,
    onDidCommit,
    onWillCommit: new Map(),
  }

  tx.addEventListener("complete", () => onDidCommit.forEach((cb) => cb()), { once: true })
  return ctx
}
