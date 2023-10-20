import { idb } from "./idb.js"
import { Field, model } from "./model.js"
export { idb, Field, model }

// const users = model("User", {
//   id: Field.number({ primaryKey: true }),
//   name: Field.string({ default: "John Doe" }),
//   age: Field.number({ index: true }),
//   birthday: Field.date({ default: () => new Date() }),
//   pets: Field.array(
//     model("Pet", {
//       name: Field.string({ optional: true }),
//       age: Field.number(),
//       species: Field.string(),
//       birthday: Field.date({ default: () => new Date() }),
//     })
//   ),
//   alive: Field.boolean(),
// })

// const db = idb("demo", { users })

// db.users
//   .create({
//     id: 1,
//     age: 25,
//     pets: [
//       {
//         age: 1,
//         species: "dog",
//       },
//     ],
//     alive: true,
//   })
//   .then((user) => {
//     console.log(user!.pets[0]!.birthday)
//   })
