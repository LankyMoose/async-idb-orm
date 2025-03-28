import { idb } from "async-idb-orm"
import * as schema from "./schema"
export * from "./types"

export const db = idb("users", schema, 1)

db.getInstance().then((idbInstance) => console.log("db initialized", idbInstance))
