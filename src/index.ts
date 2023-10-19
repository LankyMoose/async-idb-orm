import { idb } from "idb"
import { Field, model } from "model"
import { ResolvedModel } from "types"

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
  age: Field.number(),
  //pets: Field.array(pets),
  father: Field.model(pets),
  alive: Field.boolean(),
})

//as ResolvedModel<(typeof pets)["definition"]>[]

const db = await idb("test", { pets, users })
db.users.create({
  id: 1,
  name: "John",
  age: 30,
  alive: true,
  // pets: [
  //   {
  //     id: 1,
  //     name: "Fluffy",
  //     age: 2,
  //     species: "cat",
  //   },
  // ],

  father: {
    id: 2,
    name: "Asd",
    age: 50,
    species: "Asd",
    alive: true,
  },
})

const user = await db.users.read(1)
//user.pets

const x = {
  id: 2,
  name: "Asd",
  age: 50,
  species: "asd",
  alive: true,
} as ResolvedModel<(typeof pets)["definition"]>
