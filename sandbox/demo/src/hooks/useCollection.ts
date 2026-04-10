import { onMount, resource } from "kiru"
import { db } from "$/db"
import type * as schema from "$/db/schema"

export const useLiveCollection = <T extends keyof typeof schema>(name: T) => {
  const collection = db.collections[name]
  const state = resource(() => collection.all())
  const refetch = () => state.refetch()

  onMount(() => {
    collection.addEventListener("write|delete", refetch)
    collection.addEventListener("clear", refetch)
    return () => {
      collection.removeEventListener("write|delete", refetch)
      collection.removeEventListener("clear", refetch)
    }
  })

  return state
}
