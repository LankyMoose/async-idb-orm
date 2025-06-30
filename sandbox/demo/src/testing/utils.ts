import { db } from "$/db"

export async function clearAllCollections() {
  await db.collections.todos.clear()
  await db.collections.postComments.clear()
  await db.collections.posts.clear()
  await db.collections.users.clear()
  await db.collections.notes.clear()
}

export function createEventTrackers(...collectionNames: (keyof typeof db.collections)[]) {
  return collectionNames.map((collectionName) => {
    const collection = db.collections[collectionName]
    let debugEnabled = false
    const events: any[] = []
    const listener = (evt) => {
      if (debugEnabled) console.log(collectionName, evt)
      events.push(evt)
    }
    collection.addEventListener("write|delete", listener)
    return {
      events,
      unTrack: () => collection.removeEventListener("write|delete", listener),
      enableDebug: () => (debugEnabled = true),
    }
  })
}
