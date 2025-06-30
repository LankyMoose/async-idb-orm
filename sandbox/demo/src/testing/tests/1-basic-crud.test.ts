import { assert, assertThrows } from "$/testing/assert"
import { db, TimeStamp } from "$/db"
import { TestRunner } from "../framework"
import { clearAllCollections } from "../utils"

export default async () => {
  await new TestRunner()
    .suite("Basic CRUD", {
      onBeforeEach: async () => {
        await clearAllCollections()
      },
      tests: (test) => {
        test("should create a user", async () => {
          const user = await db.collections.users.create({ name: "John Doe", age: 30 })
          assert(user.name === "John Doe", "User name should be John Doe")
          assert(user.age === 30, "User age should be 30")
        })
        test("should get a user", async () => {
          const user = await db.collections.users.create({ name: "John Doe", age: 30 })
          const retrievedUser = await db.collections.users.find(user.id)
          assert(retrievedUser, "User should be found")
          assert(retrievedUser.name === "John Doe", "User name should be John Doe")
          assert(retrievedUser.age === 30, "User age should be 30")
        })
        test("should update a user", async () => {
          const user = await db.collections.users.create({ name: "John Doe", age: 30 })
          const updatedUser = await db.collections.users.update({
            ...user,
            name: "Jane Doe",
            age: 25,
          })
          assert(updatedUser.name === "Jane Doe", "User name should be Jane Doe")
          assert(updatedUser.age === 25, "User age should be 25")
        })
        test("throws error when updating non-existent record", async () => {
          await assertThrows(
            async () => {
              await db.collections.users.update({
                id: 12345,
                name: "John Doe",
                age: 30,
                createdAt: new TimeStamp(),
              })
            },
            "Should throw an Error",
            `[async-idb-orm]: record in collection users with key 12345 not found.`
          )
        })

        test("should delete a user", async () => {
          const user = await db.collections.users.create({ name: "John Doe", age: 30 })
          await db.collections.users.delete(user.id)
          const retrievedUser = await db.collections.users.find(user.id)
          assert(retrievedUser === null, "User should be deleted")
        })
      },
    })
    .run()
}
