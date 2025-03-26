import { useAsync, useEffect } from "kaioken"
import { db } from "$/db"
export const useLiveCollection = <T extends keyof typeof db>(collection: T) => {
  const { invalidate, ...rest } = useAsync(() => db[collection].all(), [])

  useEffect(() => {
    db[collection].addEventListener("write|delete", invalidate)
    return () => db[collection].removeEventListener("write|delete", invalidate)
  }, [invalidate])
  return { ...rest, invalidate }
}
