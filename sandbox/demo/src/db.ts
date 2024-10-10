import { model, Field, idb, type InferRecord, type InferDto } from "async-idb-orm"

const petModel = model({
  id: Field.string(),
  name: Field.string({ default: () => "bob" }),
  age: Field.number(),
  species: Field.string({ optional: true }),
})

export const users = model({
  id: Field.number({ key: true }),
  name: Field.string({ default: "John Doe" }),
  age: Field.number({ index: true }),
  //birthday: Field.date({ default: () => new Date(), optional: true }),
  //pet: Field.model(petModel),
  pets: Field.array(Field.model(petModel)),
  alive: Field.boolean({ optional: true }),
})

const boards = model({
  id: Field.number({ key: true }),
  uuid: Field.string({ default: () => crypto.randomUUID() as string }),
  title: Field.string({ default: () => "" }),
  created: Field.date({ default: () => new Date() }),
  archived: Field.boolean({ default: () => false }),
  order: Field.number({ default: () => 0 }),
})

export type User = InferRecord<typeof users>
export type UserDto = InferDto<typeof users>
export type Pet = InferRecord<typeof petModel>
export type PetDto = InferDto<typeof petModel>

export const db = idb("demo", { users, boards }, 2)
debugger
await db.users.create({
  name: "John Doe",
  age: 30,
  alive: true,
  pets: [],
})

const x = await db.users.update({
  id: 1,
  name: "John Doe",
  age: 30,
  alive: true,
  pets: [],
})

const y = await db.users.delete(1)
const board = await db.boards.create({})
