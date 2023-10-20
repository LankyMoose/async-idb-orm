import "./style.css"
import { model, Field, idb } from "async-idb-orm"

const users = model({
  id: Field.number({ primaryKey: true }),
  name: Field.string({ default: "John Doe" }),
  age: Field.number({ index: true }),
  birthday: Field.date({ default: () => new Date() }),
  pets: Field.array(
    model({
      name: Field.string(),
      age: Field.number(),
      species: Field.string({ optional: true }),
      birthday: Field.date({ default: () => new Date() }),
    })
  ),
  alive: Field.boolean(),
})

// users.on("beforewrite", (data, cancel) => {
//   console.log(data.id)
//   return cancel()
// })

// users.on("beforedelete", (data, cancel) => {
//   console.log(data.id)
//   return cancel()
// })

// users.on("delete", (data) => {
//   console.log(data.id)
// })

// users.on("write", (data) => {
//   console.log(data.id)
// })

const db = idb("demo", { users })

console.log(db)

db.users
  .create({
    age: 25,
    pets: [
      {
        name: "Fido",
        age: 1,
        species: "dog",
      },
    ],
    alive: true,
  })
  .then((user) => {
    console.log(user!.pets[0]!.birthday)
  })
