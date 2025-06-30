import { assert, assertExists } from "$/testing/assert"
import { db, TimeStamp } from "$/db"
import { TestRunner } from "../framework"
import { clearAllCollections } from "../utils"

export default (testRunner: TestRunner) => {
  testRunner.suite("Serialization", {
    onAfterEach: async () => {
      await clearAllCollections()
    },
    tests: (test) => {
      test("should serialize and deserialize TimeStamp objects", async () => {
        // Create user with TimeStamp
        const user = await db.collections.users.create({ name: "Serialization User", age: 30 })

        // Verify createdAt is a TimeStamp instance
        assert(user.createdAt instanceof TimeStamp, "createdAt should be TimeStamp instance")
        assert(user.createdAt.date instanceof Date, "TimeStamp should contain Date object")

        // Retrieve user from database
        const retrievedUser = await db.collections.users.find(user.id)
        assertExists(retrievedUser, "User should be found")

        // Verify deserialization worked
        assert(
          retrievedUser.createdAt instanceof TimeStamp,
          "Retrieved createdAt should be TimeStamp instance"
        )
        assert(
          retrievedUser.createdAt.date instanceof Date,
          "Retrieved TimeStamp should contain Date object"
        )
        assert(
          retrievedUser.createdAt.date.getTime() === user.createdAt.date.getTime(),
          "Dates should be equal"
        )
      })

      test("should handle updatedAt timestamp serialization", async () => {
        // Create and update user
        const user = await db.collections.users.create({ name: "Update User", age: 25 })

        // Initially no updatedAt
        assert(user.updatedAt === undefined, "updatedAt should be undefined initially")

        // Update user
        const updatedUser = await db.collections.users.update({ ...user, age: 26 })

        // Verify updatedAt was added
        assertExists(updatedUser.updatedAt, "updatedAt should be present after update")
        assert(updatedUser.updatedAt instanceof TimeStamp, "updatedAt should be TimeStamp instance")

        // Retrieve and verify serialization
        const retrievedUser = await db.collections.users.find(user.id)
        assertExists(retrievedUser, "User should be found")
        assertExists(retrievedUser.updatedAt, "Retrieved user should have updatedAt")
        assert(
          retrievedUser.updatedAt instanceof TimeStamp,
          "Retrieved updatedAt should be TimeStamp instance"
        )
        assert(
          retrievedUser.updatedAt.date instanceof Date,
          "Retrieved updatedAt should contain Date object"
        )
      })

      test("should preserve TimeStamp values across multiple operations", async () => {
        // Create user
        const user = await db.collections.users.create({ name: "Preserve User", age: 30 })
        const originalCreatedAt = user.createdAt.date.getTime()

        // Wait a bit to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 10))

        // Update user
        const updatedUser = await db.collections.users.update({ ...user, age: 31 })

        // Verify createdAt was preserved
        assert(
          updatedUser.createdAt.date.getTime() === originalCreatedAt,
          "createdAt should be preserved"
        )

        // Verify updatedAt is different
        assertExists(updatedUser.updatedAt, "updatedAt should exist")
        assert(
          updatedUser.updatedAt.date.getTime() > originalCreatedAt,
          "updatedAt should be later than createdAt"
        )

        // Retrieve and verify
        const retrievedUser = await db.collections.users.find(user.id)
        assertExists(retrievedUser, "User should be found")
        assert(
          retrievedUser.createdAt.date.getTime() === originalCreatedAt,
          "Retrieved createdAt should be preserved"
        )
        assertExists(retrievedUser.updatedAt, "Retrieved user should have updatedAt")
        assert(
          retrievedUser.updatedAt.date.getTime() === updatedUser.updatedAt.date.getTime(),
          "Retrieved updatedAt should match"
        )
      })

      test("should handle serialization with active records", async () => {
        // Create active user
        const activeUser = await db.collections.users.createActive({
          name: "Active Serialization User",
          age: 28,
        })

        // Verify TimeStamp is properly serialized
        assert(
          activeUser.createdAt instanceof TimeStamp,
          "Active user createdAt should be TimeStamp instance"
        )

        // Modify and save
        activeUser.age = 29
        const savedUser = await activeUser.save()

        // Verify timestamps are properly handled
        assert(
          savedUser.createdAt instanceof TimeStamp,
          "Saved user createdAt should be TimeStamp instance"
        )
        assertExists(savedUser.updatedAt, "Saved user should have updatedAt")
        assert(
          savedUser.updatedAt instanceof TimeStamp,
          "Saved user updatedAt should be TimeStamp instance"
        )

        // Retrieve and verify
        const retrievedUser = await db.collections.users.find(activeUser.id)
        assertExists(retrievedUser, "User should be found")
        assert(
          retrievedUser.createdAt instanceof TimeStamp,
          "Retrieved createdAt should be TimeStamp instance"
        )
        assertExists(retrievedUser.updatedAt, "Retrieved user should have updatedAt")
        assert(
          retrievedUser.updatedAt instanceof TimeStamp,
          "Retrieved updatedAt should be TimeStamp instance"
        )
      })

      test("should handle serialization in batch operations", async () => {
        // Create multiple users
        const users = await Promise.all([
          db.collections.users.create({ name: "Batch User 1", age: 25 }),
          db.collections.users.create({ name: "Batch User 2", age: 30 }),
          db.collections.users.create({ name: "Batch User 3", age: 35 }),
        ])

        // Verify all have TimeStamp instances
        users.forEach((user) => {
          assert(user.createdAt instanceof TimeStamp, "Each user should have TimeStamp createdAt")
        })

        // Retrieve all users
        const allUsers = await db.collections.users.all()
        assert(allUsers.length === 3, "Should have 3 users")

        // Verify serialization worked for all
        allUsers.forEach((user) => {
          assert(
            user.createdAt instanceof TimeStamp,
            "Each retrieved user should have TimeStamp createdAt"
          )
          assert(user.createdAt.date instanceof Date, "Each TimeStamp should contain Date object")
        })
      })

      test("should handle serialization with relations", async () => {
        // Create user and post
        const user = await db.collections.users.create({ name: "Relation User", age: 32 })
        const post = await db.collections.posts.create({
          content: "Relation Post",
          userId: user.id,
        })

        // Verify TimeStamp serialization in both
        assert(user.createdAt instanceof TimeStamp, "User should have TimeStamp createdAt")
        assert(typeof post.createdAt === "number", "Post should have numeric createdAt")

        // Load with relations
        const userWithPosts = await db.collections.users.find(user.id, {
          with: { userPosts: true },
        })

        assertExists(userWithPosts, "User should be found")
        assert(
          userWithPosts.createdAt instanceof TimeStamp,
          "User in relation should have TimeStamp createdAt"
        )
        assert(userWithPosts.userPosts.length === 1, "Should have one post")
        assert(
          typeof userWithPosts.userPosts[0].createdAt === "number",
          "Post in relation should have numeric createdAt"
        )
      })

      test("should handle TimeStamp methods correctly", async () => {
        // Create user
        const user = await db.collections.users.create({ name: "Method User", age: 27 })

        // Test TimeStamp methods
        const staticJson = TimeStamp.toJSON(user.createdAt)
        assert(typeof staticJson === "string", "toJSON should return string")
        assert(staticJson.includes("T"), "toJSON should return ISO string")

        // Create new TimeStamp from JSON
        const recreatedTimeStamp = new TimeStamp(staticJson)
        assert(
          recreatedTimeStamp.date.getTime() === user.createdAt.date.getTime(),
          "Recreated TimeStamp should have same time"
        )
      })

      test("should handle serialization edge cases", async () => {
        // Test with undefined updatedAt
        const user = await db.collections.users.create({ name: "Edge Case User", age: 40 })
        assert(user.updatedAt === undefined, "updatedAt should be undefined")

        // Retrieve and verify
        const retrievedUser = await db.collections.users.find(user.id)
        assertExists(retrievedUser, "User should be found")
        assert(
          retrievedUser.updatedAt === undefined,
          "Retrieved updatedAt should still be undefined"
        )

        // Update to create updatedAt
        const updatedUser = await db.collections.users.update({ ...user, age: 41 })
        assertExists(updatedUser.updatedAt, "updatedAt should now exist")
        assert(updatedUser.updatedAt instanceof TimeStamp, "updatedAt should be TimeStamp instance")

        // Verify serialization persisted
        const finalUser = await db.collections.users.find(user.id)
        assertExists(finalUser, "User should be found")
        assertExists(finalUser.updatedAt, "Final user should have updatedAt")
        assert(
          finalUser.updatedAt instanceof TimeStamp,
          "Final updatedAt should be TimeStamp instance"
        )
      })

      test("should handle serialization in concurrent operations", async () => {
        // Create multiple users concurrently
        const userPromises = Array.from({ length: 10 }, (_, i) =>
          db.collections.users.create({ name: `Concurrent User ${i + 1}`, age: 20 + i })
        )

        const users = await Promise.all(userPromises)

        // Verify all have proper TimeStamp serialization
        users.forEach((user, index) => {
          assert(
            user.createdAt instanceof TimeStamp,
            `User ${index + 1} should have TimeStamp createdAt`
          )
          assert(
            user.createdAt.date instanceof Date,
            `User ${index + 1} TimeStamp should contain Date`
          )
        })

        // Retrieve all and verify
        const allUsers = await db.collections.users.all()
        assert(allUsers.length === 10, "Should have 10 users")

        allUsers.forEach((user, index) => {
          assert(
            user.createdAt instanceof TimeStamp,
            `Retrieved user ${index + 1} should have TimeStamp createdAt`
          )
          assert(
            user.createdAt.date instanceof Date,
            `Retrieved user ${index + 1} TimeStamp should contain Date`
          )
        })
      })
    },
  })
}
