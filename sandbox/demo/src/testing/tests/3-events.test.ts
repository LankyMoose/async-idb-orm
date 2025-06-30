import { assert, assertThrows } from "$/testing/assert"
import { db } from "$/db"
import { TestRunner } from "../testRunner"
import { clearAllCollections, createEventTrackers } from "../utils"

export default (testRunner: TestRunner) => {
  testRunner.suite("Events", {
    onAfterEach: async () => {
      await clearAllCollections()
    },
    tests: (test) => {
      test("should emit write events on create operations", async () => {
        const events: any[] = []
        const listener = (data: any) => events.push({ type: "write", data })

        db.collections.users.addEventListener("write", listener)

        await db.collections.users.create({ name: "John Doe", age: 30 })
        await db.collections.users.create({ name: "Jane Doe", age: 25 })

        assert(events.length === 2, "Should have received 2 write events")
        assert(events[0].type === "write", "First event should be write type")
        assert(events[0].data.name === "John Doe", "First event should contain user data")
        assert(events[1].data.name === "Jane Doe", "Second event should contain user data")

        db.collections.users.removeEventListener("write", listener)
      })

      test("should emit write events on update operations", async () => {
        const user = await db.collections.users.create({ name: "John Doe", age: 30 })

        const events: any[] = []
        const listener = (data: any) => events.push({ type: "write", data })

        db.collections.users.addEventListener("write", listener)

        await db.collections.users.update({
          ...user,
          name: "John Smith",
          age: 31,
        })

        assert(events.length === 1, "Should have received 1 write event for update")
        assert(events[0].data.name === "John Smith", "Event should contain updated data")
        assert(events[0].data.age === 31, "Event should contain updated age")
        assert(events[0].data.updatedAt, "Event should contain updatedAt timestamp")

        db.collections.users.removeEventListener("write", listener)
      })

      test("should emit delete events on delete operations", async () => {
        const user = await db.collections.users.create({ name: "John Doe", age: 30 })

        const events: any[] = []
        const listener = (data: any) => events.push({ type: "delete", data })

        db.collections.users.addEventListener("delete", listener)

        await db.collections.users.delete(user.id)

        assert(events.length === 1, "Should have received 1 delete event")
        assert(events[0].type === "delete", "Event should be delete type")
        assert(events[0].data.id === user.id, "Event should contain deleted record data")
        assert(events[0].data.name === "John Doe", "Event should preserve original name")

        db.collections.users.removeEventListener("delete", listener)
      })

      test("should emit write|delete events for all operations", async () => {
        const events: any[] = []
        const listener = (data: any) => events.push({ operation: "write|delete", data })

        db.collections.users.addEventListener("write|delete", listener)

        // Create operation
        const user = await db.collections.users.create({ name: "John Doe", age: 30 })

        // Update operation
        await db.collections.users.update({ ...user, name: "John Smith" })

        // Delete operation
        await db.collections.users.delete(user.id)

        assert(events.length === 3, "Should have received 3 write|delete events")
        assert(events[0].data.name === "John Doe", "First event should be from create")
        assert(events[1].data.name === "John Smith", "Second event should be from update")
        assert(
          events[2].data.name === "John Smith",
          "Third event should be from delete with updated data"
        )

        db.collections.users.removeEventListener("write|delete", listener)
      })

      test("should emit clear events on clear operations", async () => {
        await db.collections.users.create({ name: "User 1", age: 20 })
        await db.collections.users.create({ name: "User 2", age: 25 })

        const events: any[] = []
        const listener = (data: any) => events.push({ type: "clear", data })

        db.collections.users.addEventListener("clear", listener)

        await db.collections.users.clear()

        assert(events.length === 1, "Should have received 1 clear event")
        assert(events[0].type === "clear", "Event should be clear type")
        assert(events[0].data === null, "Clear event data should be null")

        db.collections.users.removeEventListener("clear", listener)
      })

      test("should support multiple listeners on the same event", async () => {
        const events1: any[] = []
        const events2: any[] = []
        const events3: any[] = []

        const listener1 = (data: any) => events1.push(data)
        const listener2 = (data: any) => events2.push(data)
        const listener3 = (data: any) => events3.push(data)

        db.collections.users.addEventListener("write", listener1)
        db.collections.users.addEventListener("write", listener2)
        db.collections.users.addEventListener("write", listener3)

        await db.collections.users.create({ name: "John Doe", age: 30 })

        assert(events1.length === 1, "First listener should receive event")
        assert(events2.length === 1, "Second listener should receive event")
        assert(events3.length === 1, "Third listener should receive event")

        assert(events1[0].name === "John Doe", "All listeners should receive same data")
        assert(events2[0].name === "John Doe", "All listeners should receive same data")
        assert(events3[0].name === "John Doe", "All listeners should receive same data")

        db.collections.users.removeEventListener("write", listener1)
        db.collections.users.removeEventListener("write", listener2)
        db.collections.users.removeEventListener("write", listener3)
      })

      test("should properly remove event listeners", async () => {
        const events: any[] = []
        const listener = (data: any) => events.push(data)

        db.collections.users.addEventListener("write", listener)

        // Create a record to verify listener is working
        await db.collections.users.create({ name: "Test User", age: 30 })
        assert(events.length === 1, "Listener should receive first event")

        // Remove the listener
        db.collections.users.removeEventListener("write", listener)

        // Create another record
        await db.collections.users.create({ name: "Another User", age: 25 })
        assert(events.length === 1, "Listener should not receive event after removal")
      })

      test("should emit events for active record operations", async () => {
        const writeEvents: any[] = []
        const deleteEvents: any[] = []

        const writeListener = (data: any) => writeEvents.push(data)
        const deleteListener = (data: any) => deleteEvents.push(data)

        db.collections.users.addEventListener("write", writeListener)
        db.collections.users.addEventListener("delete", deleteListener)

        // Create active record
        const activeUser = await db.collections.users.createActive({ name: "John Doe", age: 30 })
        assert(writeEvents.length === 1, "Should emit write event for createActive")

        // Save changes via active record
        activeUser.name = "John Smith"
        await activeUser.save()
        assert(writeEvents.length === 2, "Should emit write event for active record save")

        // Delete via active record
        await activeUser.delete()
        assert(deleteEvents.length === 1, "Should emit delete event for active record delete")

        db.collections.users.removeEventListener("write", writeListener)
        db.collections.users.removeEventListener("delete", deleteListener)
      })

      test("should emit events for batch operations", async () => {
        const events: any[] = []
        const listener = (data: any) => {
          events.push(data.name)
        }

        db.collections.users.addEventListener("write", listener)

        // Upsert multiple records
        await db.collections.users.upsert(
          { name: "User 1", age: 20 },
          { name: "User 2", age: 25 },
          { name: "User 3", age: 30 }
        )

        assert(events.length === 3, "Should emit events for all upserted records")
        assert(events.includes("User 1"), "Should include User 1")
        assert(events.includes("User 2"), "Should include User 2")
        assert(events.includes("User 3"), "Should include User 3")

        // Clear events for delete test
        events.length = 0
        db.collections.users.removeEventListener("write", listener)

        const deleteEvents: any[] = []
        const deleteListener = (data: any) => deleteEvents.push(data.name)
        db.collections.users.addEventListener("delete", deleteListener)

        // Delete multiple records
        const deletedUsers = await db.collections.users.deleteMany((user) => user.age >= 20)

        assert(deletedUsers.length === 3, "Should delete 3 users")
        assert(deleteEvents.length === 3, "Should emit delete events for all deleted records")

        db.collections.users.removeEventListener("delete", deleteListener)
      })

      test("should emit events for foreign key cascade operations", async () => {
        const userDeleteEvents: any[] = []
        const postDeleteEvents: any[] = []

        const userDeleteListener = (data: any) => userDeleteEvents.push(data)
        const postDeleteListener = (data: any) => postDeleteEvents.push(data)

        db.collections.users.addEventListener("delete", userDeleteListener)
        db.collections.posts.addEventListener("delete", postDeleteListener)

        // Create user and posts
        const user = await db.collections.users.create({ name: "John Doe", age: 30 })
        await db.collections.posts.create({ content: "Post 1", userId: user.id })
        await db.collections.posts.create({ content: "Post 2", userId: user.id })

        // Delete user (should cascade to posts)
        await db.collections.users.delete(user.id)

        assert(userDeleteEvents.length === 1, "Should emit delete event for user")
        assert(postDeleteEvents.length === 2, "Should emit delete events for cascaded posts")
        assert(userDeleteEvents[0].id === user.id, "User delete event should contain correct user")

        db.collections.users.removeEventListener("delete", userDeleteListener)
        db.collections.posts.removeEventListener("delete", postDeleteListener)
      })

      test("should track events across multiple collections", async () => {
        const [userTracker, postTracker] = createEventTrackers("users", "posts")

        // Create user
        const user = await db.collections.users.create({ name: "John Doe", age: 30 })

        // Create post
        const post = await db.collections.posts.create({
          content: "Hello World",
          userId: user.id,
        })

        // Update user
        await db.collections.users.update({ ...user, name: "John Smith" })

        // Delete post
        await db.collections.posts.delete(post.id)

        assert(
          userTracker.events.length === 2,
          "User tracker should have 2 events (create + update)"
        )
        assert(
          postTracker.events.length === 2,
          "Post tracker should have 2 events (create + delete)"
        )

        // Verify event data
        assert(userTracker.events[0].name === "John Doe", "First user event should be create")
        assert(userTracker.events[1].name === "John Smith", "Second user event should be update")
        assert(postTracker.events[0].content === "Hello World", "First post event should be create")
        assert(
          postTracker.events[1].content === "Hello World",
          "Second post event should be delete"
        )

        userTracker.unTrack()
        postTracker.unTrack()
      })

      test("should handle listener errors gracefully", async () => {
        const goodEvents: any[] = []
        const errorListener = () => {
          throw new Error("Intentional error")
        }
        const goodListener = (data: any) => goodEvents.push(data)

        // Add both listeners
        db.collections.users.addEventListener("write", errorListener)
        db.collections.users.addEventListener("write", goodListener)

        // Create user - should not throw despite error listener
        await db.collections.users.create({ name: "John Doe", age: 30 })

        // Good listener should still work
        assert(
          goodEvents.length === 1,
          "Good listener should receive event despite error in other listener"
        )
        assert(goodEvents[0].name === "John Doe", "Good listener should receive correct data")

        db.collections.users.removeEventListener("write", errorListener)
        db.collections.users.removeEventListener("write", goodListener)
      })

      test("should not emit events for failed operations", async () => {
        const writeEvents: any[] = []
        const listener = (data: any) => writeEvents.push(data)

        db.collections.users.addEventListener("write", listener)

        // Try to create a post with invalid foreign key (should fail)
        await assertThrows(async () => {
          await db.collections.posts.create({ content: "Invalid post", userId: 99999 })
        }, "Should throw for invalid foreign key")

        // Try to update non-existent record (should fail)
        const tempUser = await db.collections.users.create({ name: "Temp User", age: 30 })
        await db.collections.users.delete(tempUser.id)

        await assertThrows(async () => {
          await db.collections.users.update({ ...tempUser, name: "Updated Name" })
        }, "Should throw for non-existent record")

        assert(
          writeEvents.length === 1,
          "Should not emit events for failed operations - got " + writeEvents + " events"
        )

        db.collections.users.removeEventListener("write", listener)
      })
    },
  })
}
