import { idb } from "idb"
import { Field, model } from "model"

const users = model("User", {
  id: Field.number({ primaryKey: true }),
  name: Field.string({ default: "John Doe", optional: true }),
  age: Field.number({ index: true }),
  pets: Field.array(
    model("Pet", {
      name: Field.string({ optional: true }),
      age: Field.number(),
      species: Field.string(),
      birthday: Field.date({ default: () => new Date() }),
    })
  ),
  alive: Field.boolean(),
})

users.on("beforewrite", (data, cancel) => {
  console.log(data.id)
  return cancel()
})

users.on("beforedelete", (data, cancel) => {
  console.log(data.id)
  return cancel()
})

users.on("delete", (data) => {
  console.log(data.id)
})

users.on("write", (data) => {
  console.log(data.id)
})

const db = await idb("test", { users })

const user = await db.users.create({
  id: 1,
  age: 20,
  pets: [
    {
      name: "Fluffy",
      age: 2,
      species: "cat",
      birthday: new Date(),
    },
  ],
  alive: true,
})

console.log(user!.id)
