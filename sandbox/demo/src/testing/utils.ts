import { db } from "$/db"

export async function clearAllCollections() {
  await db.transaction(async (ctx) => {
    await Promise.all([ctx.todos.clear(), ctx.noActionNotes.clear()])
    await Promise.all([
      ctx.postComments.clear(),
      ctx.posts.clear(),
      ctx.users.clear(),
      ctx.notes.clear(),
    ])
  })
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
