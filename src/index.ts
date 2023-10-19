import { idb } from "idb"
import { Field, model } from "model"

const pets = model("Pet", {
  id: Field.number().unique(),
  name: Field.string(),
  age: Field.number(),
  species: Field.string(),
  alive: Field.boolean(),
})

const users = model("User", {
  id: Field.number().unique(),
  name: Field.string().default("John"),
  age: Field.number().optional(),
  pets: Field.array(pets),
  alive: Field.boolean().optional(),
})

const db = await idb("test", { pets, users })

const key = await db.users.create({
  id: 1,
  name: "John",
  pets: [],
})

const user = await db.users.read(key)
