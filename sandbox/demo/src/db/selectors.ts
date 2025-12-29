import { Selector } from "async-idb-orm"
import type * as schema from "./schema"
import type * as relations from "./relations"

export const allUserNames = Selector.create<typeof schema, typeof relations>().as(async (ctx) => {
  return (await ctx.users.all()).map((user) => user.name)
})
