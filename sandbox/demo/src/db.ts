import { model, Field, idb, type InferRecord, type InferDto } from "async-idb-orm"

const petModel = model({
  id: Field.string(),
  name: Field.string(),
  age: Field.number(),
  species: Field.string({ optional: true }),
})

export const users = model({
  id: Field.number({ key: true }),
  name: Field.string({ default: "John Doe" }),
  age: Field.number({ index: true }),
  //birthday: Field.date({ default: () => new Date(), optional: true }),
  pets: Field.array(petModel),
  alive: Field.boolean({ optional: true }),
})

export type User = InferRecord<typeof users>
export type UserDto = InferDto<typeof users>
export type Pet = InferRecord<typeof petModel>
export type PetDto = InferDto<typeof petModel>

export const db = idb("demo", { users })
