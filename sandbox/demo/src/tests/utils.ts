import { db } from "$/db"

export async function clearAllCollections() {
  await db.collections.todos.clear()
  await db.collections.postComments.clear()
  await db.collections.posts.clear()
  await db.collections.users.clear()
  await db.collections.todos.clear()
}
