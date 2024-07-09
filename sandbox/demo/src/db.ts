import { model, Field, idb } from "async-idb-orm"

export const users = model({
  id: Field.number({ primaryKey: true }),
  name: Field.string({ default: "John Doe" }),
  age: Field.number({ index: true }),
  //birthday: Field.date({ default: () => new Date(), optional: true }),
  pets: Field.array(
    model({
      id: Field.string(),
      name: Field.string(),
      age: Field.number(),
      species: Field.string({ optional: true }),
    })
  ),
  alive: Field.boolean({ default: true }),
})

const pairs = model({
  itemA: Field.string({ primaryKey: true }),
  itemB: Field.string({ primaryKey: true }),
})

export const db = idb("demo", { users, pairs })

//db.pairs.create({ itemA: "a", itemB: "b" })
const pair = await db.pairs.find(["a", "b"])
console.log(pair)
export type Pet = {
  id: string
  name: string
  age: number
  species?: string
}

export type User = {
  id: number
  name: string
  age: number
  pets: Pet[]
  alive: boolean
}
export type UserDto = Omit<User, "id"> & { id?: number }
