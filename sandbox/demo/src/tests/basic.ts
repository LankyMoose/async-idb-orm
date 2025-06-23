import { assert, assertThrows } from "$/assert"
import { db, TimeStamp } from "$/db"
import { randomUserName } from "$/random"
import { selectedUser } from "$/state/selectedUser"

export const runBasicTest = async () => {
  selectedUser.value = null
  await db.collections.postComments.clear()
  await db.collections.posts.clear()
  await db.collections.users.clear()

  let johnsCreationTime: TimeStamp | null = null
  await db.transaction(async (c) => {
    const john = await c.users.create({ name: "John Doe", age: 30 })
    johnsCreationTime = john.createdAt
    const sarah = await c.users.create({ name: "Sarah Connor", age: 25 })
    assert(sarah.id === john.id + 1, "Expected Sarah to have the next id")

    const post = await c.posts.create({ userId: john.id, content: "Hello world" })
    await c.postComments.create({
      postId: post.id,
      content: "Great post!",
      userId: sarah.id,
    })
  })

  const john = await db.collections.users.findActive((user) => user.name === "John Doe")
  assert(john, "Expected to find John Doe")
  assert(john.createdAt instanceof TimeStamp, "Expected createdAt to be a TimeStamp")
  assert(
    TimeStamp.toJSON(john.createdAt) === TimeStamp.toJSON(johnsCreationTime!),
    "Expected createdAt to match"
  )
  assert((await db.collections.users.count()) === 2, "Expected 2 users")
  assert((await db.collections.posts.count()) === 1, "Expected 1 post")
  assert((await db.collections.postComments.count()) === 1, "Expected 1 post comment")
  await john.delete()
  const john2 = await db.collections.users.create(db.collections.users.unwrap(john))
  assert(john.id === john2.id, "Expected to create a new user with the same id")
  await db.collections.users.delete(john.id)
  assert((await db.collections.users.count()) === 1, "Expected 1 user")
  // posts & post comments have `cascade delete`, so there should be no posts or post comments
  assert((await db.collections.posts.count()) === 0, "Expected 0 posts")
  assert((await db.collections.postComments.count()) === 0, "Expected 0 post comments")

  assertThrows(async () => {
    await db.collections.posts.create({ userId: john.id, content: "Hello world" })
  }, "Expected to throw when creating post that references invalid userId")

  assertThrows(async () => {
    await db.transaction(async (c) => {
      await c.posts.create({ userId: john.id, content: "Hello world" })
    })
  }, "Expected to throw when creating post that references invalid userId whilst in transaction")

  const sarah = await db.collections.users.findActive((user) => user.name === "Sarah Connor")
  assert(sarah, "Expected to find Sarah Connor")
  await sarah.delete()
  assert((await db.collections.users.count()) === 0, "Expected 0 users")

  const bob = await db.collections.users.create({ name: "Bob Smith", age: 30 })
  assert(bob, "Expected to create Bob Smith")

  const todo = await db.collections.todos.create({ userId: bob.id, content: "Buy milk" })
  assert(todo, "Expected to create todo")
  // todos have 'restrict' fk mode, so this should throw
  assertThrows(async () => {
    await db.collections.users.delete(bob.id)
  }, "Expected to throw when deleting user has todo(s)")

  await db.collections.todos.delete(todo.id)
  await db.collections.users.delete(bob.id)
  assert((await db.collections.todos.count()) === 0, "Expected 0 todos")
  assert((await db.collections.users.count()) === 0, "Expected 0 users")

  // key ranges

  await db.collections.users.upsert(
    // @ts-ignore
    ...Array.from({ length: 100 }, (_, i) => ({
      age: i,
      id: crypto.randomUUID(),
      name: randomUserName(),
    }))
  )

  const usersYoungerThan30 = await db.collections.users.getIndexRange(
    "idx_age",
    IDBKeyRange.bound(0, 30)
  )
  assert(
    usersYoungerThan30.length === 31,
    `Expected 31 users younger than 30, got ${usersYoungerThan30.length}`
  )
  await db.collections.users.clear()
  const count = await db.collections.users.count()
  assert(count === 0, "Expected 0 users, got " + count)
}
