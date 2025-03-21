# **async-idb-orm**

#### Async wrapper for IndexedDB with an ORM-like API

### Usage

_db.ts_

```ts
import { Collection } from "async-idb-orm"

type User = {
  id: string
  name: string
  age: number
  createdAt: number
  updatedAt?: number
}
type UserDTO = {
  name: string
  age: number
}

const users = Collection.create<User, UserDTO>()
  .withKeyPath("id")
  .withIndexes([
    { keyPath: "age", name: "idx_age" },
    { keyPath: ["name", "age"], name: "idx_name_id" },
  ])
  .withTransformers({
    create: (dto) => ({
      ...dto,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    }),
    update: (updatedRecord) => ({
      ...updatedRecord,
      updatedAt: Date.now(),
    }),
  })

export const db = idb("users", { users }, 1)
```

```ts
import { db } from "$/db"
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
