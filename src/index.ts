import { idb } from "idb"
import { Field, model } from "model"

const pets = model("Pet", {
  id: Field.number().uniqueKey(),
  name: Field.string(),
  age: Field.number(),
  species: Field.string(),
  alive: Field.boolean(),
})

const users = model("User", {
  id: Field.number().uniqueKey(),
  name: Field.string().default("John"),
  age: Field.number().optional(),
  pets: Field.array(pets),
  alive: Field.boolean().optional(),
})

users.on("beforewrite", (data, cancel) => {
  console.log(data)
  return cancel()
})

users.on("delete", (data) => {
  console.log(data)
})

const db = await idb("test", { pets, users })

const key = await db.users.create({
  id: 1,
  name: "John",
  pets: [],
})

if (key === undefined) throw new Error("key is undefined")

const user = await db.users.read(key)
user.pets
