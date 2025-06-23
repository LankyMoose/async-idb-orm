# **async-idb-orm**

**_Promise-based IndexedDB wrapper with an ORM-like API and support for Active Records, relations and migrations_**

## Contents:

> - [Getting Started](#getting-started)
> - [Events](#events)
> - [Active Records](#active-records)
> - [Transactions](#transactions)
> - [Relations](#relations)
> - [Foreign Keys](#foreign-keys)
> - [Async Iteration](#async-iteration)
> - [Serialization](#serialization)
> - [Migrations](#migrations)
> - [Automatic Block Resolution](#automatic-block-resolution)

---

### Getting Started

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

/**
 * for numeric keyPaths, you can also specify `autoIncrement: true` to get
 * an auto-incrementing key. The key becomes optional in the expected
 * return type of a `create` transformer.
 */
type Post = { id: number; text: string; userId: string }
const posts = Collection.create<Post>().withKeyPath("id", { autoIncrement: true })

export const db = idb("users", {
  schema: { users, posts },
  version: 1,
})
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

const usersYoungerThan30 = await db.collections.users.getIndexRange(
  "idx_age",
  IDBKeyRange.bound(0, 30)
)
```

---

### Events

**async-idb-orm** supports the following events:

- `write` - triggered when a record is created or updated
- `delete` - triggered when a record is deleted
- `write|delete` - triggered when a record is created, updated, or deleted
- `clear` - triggered when all records are deleted via `db.<collection>.clear`

```ts
const onUserDeleted = (user: User) => {
  console.log("User deleted:", user)
}

db.collections.users.addEventListener("delete", onUserDeleted)
db.collections.users.delete(user.id)
// User deleted: {...}
db.collections.users.removeEventListener("delete", onUserDeleted)
```

By default, **async-idb-orm** automatically relays events to other tabs/windows that are using the same database.
To disable this, set the `relayEvents` option to `false`:

```ts
export const db = idb("users", {
  schema,
  version: 1,
  relayEvents: false,
})
```

---

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

---

### Transactions

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

### Relations

Relations allow you to define and load related data across collections with a powerful, type-safe interface. It supports one-to-one and one-to-many relationships with filtering, limiting, and nested relation loading.

#### Defining Relations

Relations are defined separately from collections using the `Relations.create()` method:

```ts
import { Relations, Collection, idb } from "async-idb-orm"

// Collections
type User = { id: number; name: string; age: number }
type Post = { id: string; content: string; userId: number }
type Comment = { id: string; content: string; postId: string; userId: number }

const users = Collection.create<User>().withKeyPath("id", { autoIncrement: true })
const posts = Collection.create<Post>()
const comments = Collection.create<Comment>()

// Define relations
const userPostRelations = Relations.create(users, posts).as({
  userPosts: (userFields, postFields) => ({
    type: "one-to-many",
    from: userFields.id,
    to: postFields.userId,
  }),
})

const postUserRelations = Relations.create(posts, users).as({
  author: (postFields, userFields) => ({
    type: "one-to-one",
    from: postFields.userId,
    to: userFields.id,
  }),
})

const postCommentRelations = Relations.create(posts, comments).as({
  postComments: (postFields, commentFields) => ({
    type: "one-to-many",
    from: postFields.id,
    to: commentFields.postId,
  }),
})

// Setup database with relations
const db = idb("my-app", {
  schema: { users, posts, comments },
  relations: {
    userPostRelations,
    postUserRelations,
    postCommentRelations,
  },
  version: 1,
})
```

#### Loading Relations

Use the `with` option in query methods to load related data:

```ts
// Load user with all their posts
const userWithPosts = await db.collections.users.find(1, {
  with: {
    userPosts: true,
  },
})
// userWithPosts.userPosts: Post[]

// Load posts with their authors
const postsWithAuthors = await db.collections.posts.all({
  with: {
    author: true,
  },
})
// Each post now has an `author` property: User

// Load multiple relations
const userWithPostsAndComments = await db.collections.users.find(1, {
  with: {
    userPosts: true,
    userComments: true,
  },
})
```

#### Filtering Relations

Apply filters to loaded relations using the `where` option:

```ts
// Load user with only important posts
const userWithImportantPosts = await db.collections.users.find(1, {
  with: {
    userPosts: {
      where: (post) => post.content.includes("Important"),
    },
  },
})

// Load posts with comments by specific user
const postsWithSpecificComments = await db.collections.posts.all({
  with: {
    postComments: {
      where: (comment) => comment.userId === specificUserId,
    },
  },
})
```

#### Limiting Relations

Control the number of related records loaded using the `limit` option:

```ts
// Load user with only their 5 most recent posts
const userWithRecentPosts = await db.collections.users.find(1, {
  with: {
    userPosts: {
      limit: 5,
    },
  },
})

// Combine filtering and limiting
const userWithRecentImportantPosts = await db.collections.users.find(1, {
  with: {
    userPosts: {
      where: (post) => post.content.includes("Important"),
      limit: 3,
    },
  },
})
```

#### Nested Relations

Load relations of relations for deep data fetching:

```ts
// Load user with posts and their comments
const userWithPostsAndComments = await db.collections.users.find(1, {
  with: {
    userPosts: {
      limit: 10,
      with: {
        postComments: true,
      },
    },
  },
})
// userWithPostsAndComments.userPosts[0].postComments: Comment[]

// Complex nested example with filtering
const userWithFilteredNestedData = await db.collections.users.find(1, {
  with: {
    userPosts: {
      where: (post) => post.content.includes("Tutorial"),
      limit: 5,
      with: {
        postComments: {
          where: (comment) => comment.content.length > 10,
          limit: 3,
        },
      },
    },
  },
})
```

#### Working with Multiple Query Methods

The Relations API works with all collection query methods:

```ts
// find()
const user = await db.collections.users.find(1, { with: { userPosts: true } })

// findMany()
const activeUsers = await db.collections.users.findMany((user) => user.age > 18, {
  with: { userPosts: { limit: 5 } },
})

// all()
const allUsersWithPosts = await db.collections.users.all({
  with: { userPosts: true },
})

// Note: Relations are read-only, you cannot upgrade relational records to active records
```

#### Type Safety

The Relations API is fully type-safe. TypeScript will enforce:

- Only defined relation names can be used in `with` clauses
- Relation types match the expected data structure
- Nested relations are properly typed
- Filter functions receive correctly typed parameters

```ts
// ✅ Valid - userPosts is defined in relations
const user = await db.collections.users.find(1, {
  with: { userPosts: true },
})

// ❌ TypeScript error - invalidRelation doesn't exist
const user = await db.collections.users.find(1, {
  with: { invalidRelation: true },
})

// ✅ Fully typed filter function
const user = await db.collections.users.find(1, {
  with: {
    userPosts: {
      where: (post) => post.content.includes("test"), // post is typed as Post
    },
  },
})
```

---

### Foreign Keys

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

const db = idb("my-app-db", {
  schema: { users, posts, postComments },
  version: 1,
})

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

### Async Iteration

Collections implement `[Symbol.asyncIterator]`, allowing on-demand iteration.

```ts
for await (const user of db.collections.users) {
  console.log(user)
}

// You can also iterate over indexes, like so:
const ageKeyRange = IDBKeyRange.bound(0, 30)
for await (const user of db.collections.users.iterateIndex("idx_age", ageKeyRange)) {
  console.log(user)
}
```

---

### Serialization

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

### Migrations

**async-idb-orm** supports database migrations. This is useful for upgrading your database schema over time.

Collections that were not previously created will be created automatically during the migration process.

```ts
// in this scenario, we decided to add a new key to our Post collection.

const VERSION = 2
export const db = idb("users", {
  schema,
  version: VERSION,
  onUpgrade: async (ctx, event: IDBVersionChangeEvent) => {
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
  },
})
```

---

### Automatic Block resolution

**async-idb-orm** implements automatic block resolution. This is useful for resolving version conflicts between multiple concurrent instances in separate tabs or windows.

#### How it works:

_Consider the following scenario:_

> - A user loads your app for the first time and initializes the database with version **1**.
> - Some time passes, and the app is now redeployed with a new version **2**.
> - The user opens your app in a new tab, keeping the previous tab open, and attempts to open the database with version **2**.
> - This causes a [blocked](https://developer.mozilla.org/en-US/docs/Web/API/IDBOpenDBRequest/blocked_event) event to be fired. The new tab's `open` request remains in a pending state until all other transactions are complete and connections are closed.

As you can see, using IndexedDB is inevitably complex and error-prone.

_How do you close the other connections if they're from different windows or tabs? How do you make sure every tab is using the most up-to-date version of the database?_

#### **async-idb-orm** automatically solves this for you.

Under the hood, we make use of a [BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel). This is a feature that's natively supported by all major browsers and allows us to send messages between tabs.

> - When a `blocked` event is fired during the `open` request, the new tab sends a message to the old tab, indicating that it should close the connection.
> - Once the all transactions are complete and the old connection is closed, the new tab's `open` request continues and initializes the database with version **2**.
> - Once the new tab has initialized the database, it sends a message back to the old tab to indicate that it should reinitialize the database with version **2**.

![Block Resolution Diagram](https://raw.githubusercontent.com/LankyMoose/async-idb-orm/main/packages/lib/assets/block-resolution.png)

_This all happens automatically behind the scenes, so you don't need to worry about it._

In the config object, you can provide an `onBeforeReinit` callback that will be called before the database is reinitialized. This is a useful time to perform any necessary cleanup steps, or to reload the page in the case it is too old.

```ts
const VERSION = 1
export const db = idb("users", {
  schema,
  version: VERSION,
  onUpgrade: async (ctx, event) => {
    // handle migrations
  },
  onBeforeReinit: (oldVersion, newVersion) => {
    // let's imagine the latest tab has set a "breakingChangesVersion" value, which indicates that any old tabs using a version less than this should reload.

    const breakingChangesVersion = parseInt(localStorage.getItem("breakingChangesVersion") ?? "0")

    if (oldVersion < breakingChangesVersion) {
      window.location.reload()
    }
  },
})
```
