import * as schema from "./schema"
import * as relations from "./relations"
import { View } from "async-idb-orm"

export const allUserNames = View.create<typeof schema, typeof relations>().as(async (ctx) => {
  return (await ctx.users.all()).map((user) => user.name)
})
