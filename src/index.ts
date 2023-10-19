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
  name: Field.string(),
  age: Field.number().optional(),
  //pets: Field.array(pets),
  //father: Field.model(pets),
  alive: Field.boolean().optional(),
})

const db = await idb("test", { pets, users })
db.users.create({
  id: 1,
  name: "John",
  age: 30,
  alive: undefined,
  // pets: [
  //   {
  //     id: 1,
  //     name: "Dog",
  //     age: 10,
  //     species: "Dog",
  //     alive: true,
  //   },
  //   {
  //     id: 2,
  //     name: "Cat",
  //     age: 5,
  //     species: "Cat",
  //     alive: true,
  //   },
  // ],

  // father: {
  //   id: 2,
  //   name: "Asd",
  //   age: 50,
  //   species: "Asd",
  //   alive: true,
  // },
})

const user = await db.users.read(1)
