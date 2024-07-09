import { idb } from "./idb.js"
import { Field, model } from "./model.js"
export { idb, Field, model }

// const users = model({
//   id: Field.number({ key: true }),
//   name: Field.string({ default: "John Doe" }),
//   age: Field.number({ index: true }),
//   birthday: Field.date({ default: () => new Date() }),
//   pets: Field.array(
//     model({
//       name: Field.string(),
//       age: Field.number(),
//       species: Field.string({ optional: true }),
//       birthday: Field.date({ default: () => new Date() }),
//     })
//   ),
//   alive: Field.boolean(),
// })

// users.on("beforewrite", (data, cancel) => {
//   console.log("beforewrite", data.id)
//   // cancel is a function we can call to abort the transaction
// })

// users.on("beforedelete", (data, cancel) => {
//   console.log("beforedelete", data.id)
//   // cancel is a function we can call to abort the transaction
// })

// users.on("delete", (data) => {
//   console.log("delete", data.id)
// })

// users.on("write", (data) => {
//   console.log("write", data)
// })

// const db = idb("demo", { users })

// db.users.clear()

// db.users
//   .create({
//     age: 25,
//     pets: [
//       {
//         name: "Fido",
//         age: 1,
//         species: "dog",
//       },
//     ],
//     alive: true,
//   })
//   .then((user) => {
//     console.log(user)
//   })
