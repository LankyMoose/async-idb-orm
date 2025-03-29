# **async-idb-orm**

#### _Promise-based IndexedDB wrapper with an ORM-like API and support for Active Records, relations and migrations_

---

### Contents:

> - [Getting Started](#getting-started)
> - [Async Iteration](#async-iteration)
> - [Active Records](#active-records)
> - [Transactions](#transactions)
> - [Relations & Foreign Keys](#relations)
> - [Serialization](#serialization)
> - [Migrations](#migrations)

---

<h3 id="#getting-started">
  Getting Started
</h3>

```ts
// db.ts
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
  .withKeyPath("id") // keyPath is optional - if not set, defaults to "id". Must be specified if there is no "id" field in the record.
  .withIndexes([
    { key: "age", name: "idx_age" },
    { key: ["name", "age"], name: "idx_name_id" },
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
// app.ts
import { db } from "$/db"

const user = await db.collections.users.create({ name: "Bob Smith", age: 69 })
//    ^? User

await db.collections.users.update({ ...user, age: 42 })

await db.collections.users.find(user.id)
await db.collections.users.find((user) => user.name === "Bob Smith")
await db.collections.users.delete(user.id)
await db.collections.users.all()
await db.collections.users.findMany((user) => user.age > 25)

const oldestUser = await db.collections.users.max("idx_age")
//    ^? User, or null if there are no records
const youngestUser = await db.collections.users.min("idx_age")
//    ^? User, or null if there are no records
```

---

<h3 id="#async-iteration">
  Async Iteration
</h3>

Collections implement `[Symbol.asyncIterator]`, allowing on-demand iteration.

```ts
for await (const user of db.collections.users) {
  console.log(user)
}
```

---

<h3 id="#active-records">
  Active Records
</h3>

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

---

<h3 id="#transactions">
  Transactions
</h3>

```ts
async function transferFunds(
  senderId: string,
  recipientId: string,
  transferAmount: number
): TransferResult {
  try {
    return await db.transaction(async (ctx, tx) => {
      // Fetch sender and recipient accounts
      const sender = await ctx.accounts.findActive({ id: senderId })
      const recipient = await ctx.accounts.findActive({ id: recipientId })

      if (!sender || !recipient) {
        // On throw, the transaction will be automatically aborted. The thrown value will be re-thrown outside the transaction.
        throw TransferResult.InvalidAccount
      }

      // Check if sender has sufficient balance
      if (sender.balance < transferAmount) {
        tx.abort()
        return TransferResult.InsufficientFunds
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
    return isTransferResult(error) ? error : TransferResult.Error
  }
}
```

---

<h3 id="#relations">
  Relations & Foreign Keys
</h3>

IndexedDB does not implement foreign key constraints. **async-idb-orm** allows you to define pseudo-foreign-keys on collections that are simulated during query execution.

Adding a foreign key to a collection enables two useful features:

- When inserting/updating a record that refers to another, the parent record's existence is checked. If it does not exist, the transaction is aborted and an error is thrown.

- When deleting a parent record, all children are acted on according to the `onDelete` option:
  - `cascade`: deletes all children
  - `restrict`: aborts the transaction & throws an error
  - `no action`: does nothing
  - `set null`: sets the foreign key to `null`

<br />

> _To keep this example brief, we'll omit setting up DTOs and transformers for our collections - pretend it's been done in the same way as previous examples._

```ts
import { db, Collection } from "async-idb-orm"

type User = { userId: string; name: string }
const users = Collection.create<User>()

type Post = { id: string; text: string; userId: string }
const posts = Collection.create<Post>().withForeignKeys((posts) => [
  { ref: posts.userId, collection: users, onDelete: "cascade" },
])

type PostComment = { id: string; content: string; postId: string; userId: string }
const postComments = Collection.create<PostComment>().withForeignKeys((comments) => [
  { ref: comments.postId, collection: posts, onDelete: "cascade" },
  { ref: comments.userId, collection: users, onDelete: "cascade" },
])

const db = idb("my-app-db", { users, posts, postComments }, 1)

// throws, because user with id "123" does not exist
await db.collections.posts.create({ text: "Hello world", userId: "123" })

const bob = await db.collections.users.create({ name: "Bob Smith" })
const alice = await db.collections.users.create({ name: "Alice Johnson" })

const post = await db.collections.posts.create({ text: "Hello world", userId: bob.id })
await db.collections.postComments.create({
  content: "Great post!",
  postId: post.id,
  userId: alice.id,
})

// deletes bob, his post and alice's comment
await db.collections.users.delete(bob.id)
```

---

<h3 id="#serialization">
  Serialization
</h3>

**async-idb-orm** provides a simple way to serialize and deserialize collection records. This is useful for storing values that would not otherwise be supported by IndexedDB.

```ts
class TimeStamp {
  date: Date
  constructor(initialValue?: string) {
    this.date = initialValue ? new Date(initialValue) : new Date()
  }

  toJSON() {
    return this.date.toISOString()
  }
}

type User = { id: string; name: string; createdAt: TimeStamp }
type UserDTO = { name: string }

export const users = Collection.create<User, UserDTO>()
  .withTransformers({
    create: (dto) => ({
      ...dto,
      id: crypto.randomUUID(),
      createdAt: new TimeStamp(),
    }),
  })
  .withSerialization({
    write: (user) => ({
      ...user,
      createdAt: user.createdAt.toJSON(),
    }),
    read: (serializedUser) => ({
      ...serializedUser,
      createdAt: new TimeStamp(serializedUser.createdAt),
    }),
  })
```

---

<h3 id="#migrations">
  Migrations
</h3>

**async-idb-orm** supports database migrations. This is useful for upgrading your database schema over time.

Collections that were not previously created will be created automatically during the migration process.

```ts
// in this scenario, we decided to add a new key to our Post collection.

const VERSION = 2
export const db = idb("users", schema, VERSION)

db.onUpgrade = async (ctx, event: IDBVersionChangeEvent) => {
  if (event.oldVersion === 0) return // skip initial db setup

  if (event.oldVersion === 1) {
    // migrate from v1 -> v2
    const oldPosts = (await ctx.collections.posts.all()) as Omit<Post, "someNewKey">[]
    ctx.deleteStore("posts")
    ctx.createStore("posts")
    const newPosts = oldPosts.map((post) => ({ ...post, someNewKey: 42 }))
    await ctx.collections.posts.upsert(...newPosts)
    console.log("successfully migrated from v1 -> v2")
  }
}
```
