import { idb } from "async-idb-orm"
import { Post } from "./types"
import * as schema from "./schema"
import * as relations from "./relations"
import * as selectors from "./selectors"
export * from "./types"

const VERSION = parseInt(localStorage.getItem("version") ?? "1")
export const db = idb("demo", {
  schema,
  relations,
  selectors,
  version: VERSION,
  onError: console.error,
  onOpen: (db) => {
    console.log("db opened", db)
  },
  onUpgrade: async (ctx, event) => {
    if (event.oldVersion === 0) return // skip initial db setup
    let currentVersion = event.oldVersion

    while (currentVersion < VERSION) {
      switch (currentVersion) {
        case 1:
          console.log("migrating from v1 -> v2")
          const oldPosts = (await ctx.collections.posts.all()) as Omit<Post, "someNewKey">[]
          ctx.deleteStore("posts")
          ctx.createStore("posts")
          const newPosts = oldPosts.map((post) => ({ ...post, someNewKey: 42 }))
          await ctx.collections.posts.upsert(...newPosts)
          console.log("successfully migrated to v2")
          break
      }
      currentVersion++
    }
  },
  onBeforeReinit: (oldVersion, newVersion) => {
    console.log(`reinitializing db from v${oldVersion} to v${newVersion}`)
  },
})
