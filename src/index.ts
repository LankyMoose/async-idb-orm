import { idb } from "idb"
import { Field, model } from "model"

const pets = model("Pet", {
  id: Field.number({ unique: true }),
  name: Field.string({ optional: true }),
  age: Field.number(),
  species: Field.string(),
  alive: Field.boolean(),
  birthday: Field.date({ default: () => new Date() }),
})

const users = model("User", {
  id: Field.number({ unique: true }),
  name: Field.string({ default: "John Doe", optional: true }),
  age: Field.number(),
  pets: Field.array(pets),
  alive: Field.boolean(),
})

users.on("beforewrite", (data, cancel) => {
  console.log(data)
  return cancel()
})

users.on("delete", (data) => {
  console.log(data)
})

const db = await idb("test", { pets, users })

const user = await db.users.create({
  id: 1,
  age: 20,
  name: "John",
  pets: [
    {
      id: 1,
      name: "Fluffy",
      age: 2,
      species: "cat",
      alive: true,
      birthday: new Date(),
    },
  ],
  alive: true,
})

console.log(user?.pets)
