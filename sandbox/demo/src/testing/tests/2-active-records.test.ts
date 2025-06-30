import { assert, assertThrows } from "$/testing/assert"
import { db } from "$/db"
import { TestRunner } from "../framework"
import { clearAllCollections } from "../utils"

export default async () => {
  await new TestRunner()
    .suite("Active Records", {
      onBeforeEach: async () => {
        await clearAllCollections()
      },
      tests: (test) => {
        test("should wrap a record with save and delete methods", async () => {
          const user = await db.collections.users.create({ name: "John Doe", age: 30 })
          const activeUser = db.collections.users.wrap(user)

          // Should have the original properties
          assert(
            activeUser.name === "John Doe",
            "Active record should preserve original properties"
          )
          assert(activeUser.age === 30, "Active record should preserve original properties")
          assert(activeUser.id === user.id, "Active record should preserve original properties")

          // Should have active record methods
          assert(typeof activeUser.save === "function", "Active record should have save method")
          assert(typeof activeUser.delete === "function", "Active record should have delete method")
        })

        test("should unwrap active records correctly", async () => {
          const activeUser = await db.collections.users.createActive({ name: "John Doe", age: 30 })
          const unwrapped = db.collections.users.unwrap(activeUser)

          // Should not have active record methods
          assert(
            // @ts-expect-error - unwrapped is not an active record
            typeof unwrapped.save === "undefined" && typeof unwrapped.delete === "undefined",
            "Unwrapped record should not have save and delete methods"
          )

          // Should preserve original properties
          assert(
            unwrapped.name === "John Doe",
            "Unwrapped record should preserve original properties"
          )
          assert(unwrapped.age === 30, "Unwrapped record should preserve original properties")
          assert(
            unwrapped.id === activeUser.id,
            "Unwrapped record should preserve original properties"
          )
        })

        test("should save changes using active record save method", async () => {
          const activeUser = await db.collections.users.createActive({ name: "John Doe", age: 30 })

          // Modify the active record
          activeUser.name = "Jane Doe"
          activeUser.age = 25

          // Save changes
          const savedActiveUser = await activeUser.save()

          // Should return a new active record with updated values
          assert(savedActiveUser.name === "Jane Doe", "Saved record should have updated name")
          assert(savedActiveUser.age === 25, "Saved record should have updated age")
          assert(
            typeof savedActiveUser.save === "function",
            "Saved record should still be an active record"
          )

          // Verify changes were persisted to database
          const retrievedUser = await db.collections.users.find(activeUser.id)
          assert(retrievedUser, "User should exist in database")
          assert(retrievedUser.name === "Jane Doe", "Database should contain updated name")
          assert(retrievedUser.age === 25, "Database should contain updated age")
        })

        test("should delete record using active record delete method", async () => {
          const activeUser = await db.collections.users.createActive({ name: "John Doe", age: 30 })

          // Delete the record
          await activeUser.delete()

          // Verify record was deleted from database
          const retrievedUser = await db.collections.users.find(activeUser.id)
          assert(retrievedUser === null, "User should be deleted from database")
        })

        test("should throw error when saving non-existent record", async () => {
          const activeUser = await db.collections.users.createActive({ name: "John Doe", age: 30 })

          // Delete the record from database directly
          await db.collections.users.delete(activeUser.id)

          // Try to save the active record
          await assertThrows(
            async () => {
              await activeUser.save()
            },
            "Should throw an Error",
            `[async-idb-orm]: record in collection users with key ${activeUser.id} not found.`
          )
        })

        test("does not throw error when deleting non-existent record", async () => {
          const activeUser = await db.collections.users.createActive({ name: "John Doe", age: 30 })
          await db.collections.users.delete(activeUser.id)
          await activeUser.delete()
        })
      },
    })
    .run()
}
