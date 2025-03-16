import { idb, collection } from "async-idb-orm"

export type Pet = {
  id: string
  name: string
  age: number
  species?: string
}
export type User = {
  id: string
  name: string
  age: number
  pets: Pet[]
  alive?: boolean
}
export type UserDTO = {
  name?: string
  age: number
  pets: Pet[]
  alive?: boolean
}

const users = collection<User, UserDTO>({
  keyPath: "id", // string | string[] | null | undefined
  autoIncrement: true,
  indexes: [
    {
      keyPath: "id",
      name: "idx_id",
      options: { unique: true },
    },
    {
      keyPath: "age",
      name: "idx_age",
      //options: { unique: false },
    },
  ],
  transform: {
    create: (dto) => ({ ...dto, id: crypto.randomUUID(), name: dto.name ?? "John Doe" }),
    update: (record, dto) => ({ ...record, ...dto }),
  },
})

export const db = idb("users", { users }, 1)
