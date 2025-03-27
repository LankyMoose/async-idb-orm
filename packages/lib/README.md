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
const user = await db.collections.users.create({ name: "John Doe", age: 69 })
console.log(user)
//          ^? User

const updatedUser = await db.collections.users.update({ ...user, age: 65 })
console.log(updatedUser)

const foundUser = await db.collections.users.find(user.id)
const foundUser2 = await db.collections.users.find((user) => user.name === "Jane Doe")
console.log(foundUser)

const deletedUser = await db.collections.users.delete(user.id)
const otherDeletedUser = await db.collections.users.delete((user) => user.name === "Jane Doe")
console.log(deletedUser)

const allUsers = await db.collections.users.all()
console.log(allUsers)

const filteredUsers = await db.collections.users.findMany((user) => user.age > 25)
console.log(filteredUsers)

const maxAge = await db.collections.users.max("idx_age")
console.log(maxAge)

const minAge = await db.collections.users.min("idx_age")
console.log(minAge)
```

### Async Iteration

Collections implement `[Symbol.asyncIterator]`, allowing on-demand iteration.

```ts
for await (const user of db.collections.users) {
  console.log(user)
}
```

### Active Records

`create`, `find`, `findMany`, and `all` each have an `Active` equivalent that returns an `ActiveRecord<T>` which includes `save` and `delete` methods.

```ts
async function setUserAge(userId: string, age: number) {
  const user = await db.collections.users.findActive(userId)
  if (!user) throw new Error("User not found")
  user.age = 42
  await user.save()
}
```

We can also 'upgrade' a record to an active record via the `wrap` method:

```ts
async function setUserAge(userId: string, age: number) {
  const user = await db.collections.users.find(userId)
  if (!user) throw new Error("User not found")
  const activeUser = db.collections.users.wrap(user)
  activeUser.age = 42
  await activeUser.save()

  // and we can 'downgrade' the active record back to a regular record via the `unwrap` method
  return db.users.unwrap(activeUser)
}
```

### Transactions

```ts
async function transferFunds(senderId: string, recipientId: string, transferAmount: number) {
  try {
    const res: TransferResult = await db.transaction(async (ctx, tx) => {
      // Fetch sender and recipient accounts
      const sender = await ctx.accounts.findActive({ id: senderId })
      const recipient = await ctx.accounts.findActive({ id: recipientId })

      if (!sender || !recipient) {
        tx.abort()
        return TransferResult.InvalidAccount
      }

      // Check if sender has sufficient balance
      if (sender.balance < transferAmount) {
        // we can abort the transaction here by throwing, the thrown value will be re-thrown outside the transaction.
        throw TransferResult.InsufficientFunds
      }

      // Update balances
      sender.balance -= transferAmount
      recipient.balance += transferAmount

      await sender.save()
      await recipient.save()

      // Commit transaction (not mandatory, a transaction will automatically commit when all outstanding requests have been satisfied and no new requests have been made)
      tx.commit()

      // Return success
      return TransferResult.Success
    })
  } catch (error) {
    console.error(error)
  }
}
```
