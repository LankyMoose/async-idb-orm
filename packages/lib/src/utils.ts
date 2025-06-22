export const keyPassThroughProxy = new Proxy({}, { get: (_: any, key: string) => key })

export const abortTx = (tx: IDBTransaction) => {
  try {
    if (tx.error) return
    tx.abort()
  } catch {}
}
