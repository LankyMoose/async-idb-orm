import { useAsync, useEffect } from "kaioken"
import { db } from "$/db"
import type * as schema from "$/db/schema"
export const useLiveCollection = <T extends keyof typeof schema>(name: T) => {
  const collection = db.collections[name]
  const state = useAsync(() => collection.all(), [])

  useEffect(() => {
    collection.addEventListener("write|delete", state.invalidate)
    return () => collection.removeEventListener("write|delete", state.invalidate)
  }, [])
  return state
}
