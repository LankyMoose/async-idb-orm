import { assert, assertThrows } from "$/assert"
import { db, TimeStamp } from "$/db"
import { randomUserName } from "$/random"
import { selectedUser } from "$/state/selectedUser"
import { clearAllCollections, createEventTrackers } from "./utils"

export const runBasicTest = async () => {
  selectedUser.value = null
  await clearAllCollections()

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

  await assertThrows(async () => {
    await db.collections.posts.create({ userId: john.id, content: "Hello world" })
  }, "Expected to throw when creating post that references invalid userId")

  await assertThrows(async () => {
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
  await assertThrows(async () => {
    await db.collections.users.delete(bob.id)
  }, "Expected to throw when deleting user has todo(s)")

  await db.collections.todos.delete(todo.id)
  await db.collections.users.delete(bob.id)
  assert((await db.collections.todos.count()) === 0, "Expected 0 todos")
  assert((await db.collections.users.count()) === 0, "Expected 0 users")

  // key ranges

  const [userEventsTracker] = createEventTrackers("users")
  await db.collections.users.upsert(
    ...Array.from({ length: 100 }, (_, i) => ({
      age: i,
      id: i + 1000,
      name: randomUserName(),
    }))
  )
  const users = await db.collections.users.all()
  assert(users.length === 100, "Expected 100 users, got " + users.length)
  assert(
    userEventsTracker.events.length === 100,
    "Expected 100 events, got " + userEventsTracker.events.length
  )
  userEventsTracker.unTrack()

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

  const aaron = await db.collections.users.create({ name: "Aaron Smith", age: 30 })
  await db.collections.notes.create({ userId: aaron.id, content: "Hello world" })
  await db.collections.users.delete(aaron.id)
  const note = await db.collections.notes.find((note) => note.content === "Hello world")
  assert(note, "Expected to find note")
  assert(note.userId === null, "Expected note userId to be null")

  await clearAllCollections()
  // ~~~~~~~ Event Batching
  {
    const eventTrackers = createEventTrackers("users", "posts", "postComments")
    const [userEvts, postEvts, postCommentEvts] = eventTrackers.map((t) => t.events)

    await db.transaction(async (c) => {
      const john = await c.users.create({ name: "John Doe", age: 30 })
      const sarah = await c.users.create({ name: "Sarah Connor", age: 30 })
      const post = await c.posts.create({ userId: john.id, content: "Hello world" })
      await c.postComments.create({
        postId: post.id,
        content: "Great post!",
        userId: sarah.id,
      })
      assert(userEvts.length === 0, "Expected 0 user events, got " + userEvts.length)
      assert(postEvts.length === 0, "Expected 0 post events, got " + postEvts.length)
      assert(
        postCommentEvts.length === 0,
        "Expected 0 post comment events, got " + postCommentEvts.length
      )
    })

    assert(userEvts.length === 2, "Expected 2 user events, got " + userEvts.length)
    assert(postEvts.length === 1, "Expected 1 post event, got " + postEvts.length)
    assert(
      postCommentEvts.length === 1,
      "Expected 1 post comment event, got " + postCommentEvts.length
    )

    userEvts.length = 0
    postEvts.length = 0
    postCommentEvts.length = 0

    await db.transaction(async (c) => {
      const john = await c.users.find((u) => u.name === "John Doe")
      assert(john, "Expected to find John Doe")
      await c.users.delete(john.id)
      assert(userEvts.length === 0, "Expected 0 user events, got " + userEvts.length)
      assert(postEvts.length === 0, "Expected 0 post events, got " + postEvts.length)
      assert(
        postCommentEvts.length === 0,
        "Expected 0 post comment events, got " + postCommentEvts.length
      )
      eventTrackers[0].enableDebug()
    })

    assert(userEvts.length === 1, "Expected 1 user events, got " + userEvts.length)
    assert(postEvts.length === 1, "Expected 1 post event, got " + postEvts.length)
    assert(
      postCommentEvts.length === 1,
      "Expected 1 post comment event, got " + postCommentEvts.length
    )

    eventTrackers.forEach((tracker) => tracker.unTrack())
  }
  await clearAllCollections()
}
