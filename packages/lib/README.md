# **async-idb-orm**

#### Async wrapper for IndexedDB with an ORM-like API

### Usage

```ts
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
      keyPath: "age",
      name: "idx_users_age",
      options: { unique: false },
    },
  ],
  transform: {
    create: (dto) => ({
      ...dto,
      id: crypto.randomUUID(),
      name: dto.name ?? "John Doe",
    }),
    update: (record, dto) => ({ ...record, ...dto }),
  },
})

export const db = idb("users", { users }, 1)

const user = await db.users.create({ name: "John Doe", age: 69, pets: [] })
const user2 = await db.users.create({ name: "Jane Doe", age: 42, pets: [] })
console.log(user, user2)

const updatedUser = await db.users.update({ ...user, age: 65 })
console.log(updatedUser)

const foundUser = await db.users.find(user.id)
const foundUser2 = await db.users.find((user) => user.name === "Jane Doe")
console.log(foundUser)

const deletedUser = await db.users.delete(user.id)
const otherDeletedUser = await db.users.delete((user) => user.name === "Jane Doe")
console.log(deletedUser)

const allUsers = await db.users.all()
console.log(allUsers)

const filteredUsers = await db.users.find((user) => user.age > 25)
console.log(filteredUsers)

const maxAge = await db.users.max("age")
console.log(maxAge)

const minAge = await db.users.min("age")
console.log(minAge)
```
