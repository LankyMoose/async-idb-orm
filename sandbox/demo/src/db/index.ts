import { idb } from "async-idb-orm"
import * as schema from "./schema"
import { Post } from "./types"
export * from "./types"

const VERSION = 2
export const db = idb("users", schema, VERSION)

db.onUpgrade = async (ctx, event) => {
  if (event.oldVersion === 0) return // skip initial db setup
  let currentVersion = event.oldVersion

  while (currentVersion < VERSION) {
    switch (currentVersion) {
      case 1:
        console.log("migrating from v1 -> v2")
        const oldPosts = (await ctx.getAll("posts")) as Omit<Post, "someNewKey">[]
        ctx.deleteStore("posts")
        ctx.createStore("posts")
        const newPosts = oldPosts.map((post) => ({ ...post, someNewKey: 42 }))
        await ctx.insert("posts", newPosts)
        console.log("successfully migrated to v2")
        break
    }
    currentVersion++
  }
}

db.getInstance().then((idbInstance) => console.log("db initialized", idbInstance))
