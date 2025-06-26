import * as schema from "./schema"
import * as relations from "./relations"
import { Selector } from "async-idb-orm"

export const allUserNames = Selector.create<typeof schema, typeof relations>().as(async (ctx) => {
  return (await ctx.users.all()).map((user) => user.name)
})
