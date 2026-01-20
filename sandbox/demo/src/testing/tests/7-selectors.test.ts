import { assert, assertExists, assertThrows } from "$/testing/assert"
import { db } from "$/db"
import { TestRunner } from "../testRunner"
import { clearAllCollections } from "../utils"

export default (testRunner: TestRunner) => {
  testRunner.suite("Selectors", {
    onAfterEach: async () => {
      await clearAllCollections()
    },
    onBeforeEach: async () => {
      // ensure selectors are up to date
      await Promise.all(Object.values(db.selectors).map((selector) => selector.get()))
    },
    tests: (test) => {
      test("should get selector data using get() method", async () => {
        // Create some users
        await db.collections.users.create({ name: "Alice", age: 25 })
        await db.collections.users.create({ name: "Bob", age: 30 })
        await db.collections.users.create({ name: "Charlie", age: 35 })

        // Get selector data
        const userNames = await db.selectors.allUserNames.get()

        assert(Array.isArray(userNames), "User names should be an array")
        assert(userNames.length === 3, "Should have 3 user names")
        assert(userNames.includes("Alice"), "Should include Alice")
        assert(userNames.includes("Bob"), "Should include Bob")
        assert(userNames.includes("Charlie"), "Should include Charlie")
      })

      test("should update selector when underlying data changes", async () => {
        // Initial state
        let userNames = await db.selectors.allUserNames.get()
        assert(userNames.length === 0, "Should start with no users")

        // Add a user
        await db.collections.users.create({ name: "Initial User", age: 25 })
        userNames = await db.selectors.allUserNames.get()
        assert(userNames.length === 1, "Should have 1 user after creation")
        assert(userNames[0] === "Initial User", "Should have correct user name")

        // Add another user
        await db.collections.users.create({ name: "Second User", age: 30 })
        userNames = await db.selectors.allUserNames.get()
        assert(userNames.length === 2, "Should have 2 users after second creation")

        // Update a user
        const users = await db.collections.users.all()
        const firstUser = users[0]
        await db.collections.users.update({ ...firstUser, name: "Updated User" })

        userNames = await db.selectors.allUserNames.get()
        assert(userNames.includes("Updated User"), "Should reflect updated name")
        assert(!userNames.includes("Initial User"), "Should not have old name")

        // Delete a user
        await db.collections.users.delete(firstUser.id)
        userNames = await db.selectors.allUserNames.get()
        assert(userNames.length === 1, "Should have 1 user after deletion")
        assert(!userNames.includes("Updated User"), "Should not include deleted user")
      })

      test("should support reactive subscriptions", async () => {
        const updates: string[][] = []

        // Subscribe to selector updates
        const unsubscribe = db.selectors.allUserNames.subscribe((names) => {
          updates.push([...names])
        })

        // Initial subscription should trigger immediately
        await new Promise((resolve) => setTimeout(resolve, 10))
        assert(updates.length === 1, "Should receive initial update")
        assert(updates[0].length === 0, "Initial update should be empty array")

        // Create users and verify updates
        await db.collections.users.create({ name: "Sub User 1", age: 25 })
        await new Promise((resolve) => setTimeout(resolve, 10))

        assert(updates.length === 2, "Should receive update after user creation")
        assert(updates[1].length === 1, "Should have 1 user in update")
        assert(updates[1][0] === "Sub User 1", "Should have correct user name")

        // Create another user
        await db.collections.users.create({ name: "Sub User 2", age: 30 })
        await new Promise((resolve) => setTimeout(resolve, 10))

        assert(updates.length === 3, "Should receive another update")
        assert(updates[2].length === 2, "Should have 2 users in latest update")

        // Clean up subscription
        unsubscribe()

        // Create another user - should not trigger subscription
        await db.collections.users.create({ name: "Sub User 3", age: 35 })
        await new Promise((resolve) => setTimeout(resolve, 10))

        assert(updates.length === 3, "Should not receive update after unsubscribe")
      })

      test("should handle multiple subscribers", async () => {
        const updates1: string[][] = []
        const updates2: string[][] = []
        const updates3: string[][] = []

        // Subscribe multiple times
        const unsubscribe1 = db.selectors.allUserNames.subscribe((names) => {
          updates1.push([...names])
        })
        const unsubscribe2 = db.selectors.allUserNames.subscribe((names) => {
          updates2.push([...names])
        })
        const unsubscribe3 = db.selectors.allUserNames.subscribe((names) => {
          updates3.push([...names])
        })

        await new Promise((resolve) => setTimeout(resolve, 10))

        // All should receive initial update
        assert(updates1.length === 1, "First subscriber should receive initial update")
        assert(updates2.length === 1, "Second subscriber should receive initial update")
        assert(updates3.length === 1, "Third subscriber should receive initial update")

        // Create user
        await db.collections.users.create({ name: "Multi Sub User", age: 28 })
        await new Promise((resolve) => setTimeout(resolve, 10))

        // All should receive update
        assert(updates1.length === 2, "First subscriber should receive update")
        assert(updates2.length === 2, "Second subscriber should receive update")
        assert(updates3.length === 2, "Third subscriber should receive update")

        // All should have same data
        assert(updates1[1][0] === "Multi Sub User", "First subscriber should have correct data")
        assert(updates2[1][0] === "Multi Sub User", "Second subscriber should have correct data")
        assert(updates3[1][0] === "Multi Sub User", "Third subscriber should have correct data")

        // Unsubscribe one
        unsubscribe2()

        // Create another user
        await db.collections.users.create({ name: "Another User", age: 33 })
        await new Promise((resolve) => setTimeout(resolve, 10))

        // Only active subscribers should receive update
        assert(updates1.length === 3, "First subscriber should receive update")
        assert(
          updates2.length === 2,
          "Second subscriber should not receive update after unsubscribe"
        )
        assert(updates3.length === 3, "Third subscriber should receive update")

        // Clean up
        unsubscribe1()
        unsubscribe3()
      })

      test("should batch rapid changes", async () => {
        const updates: string[][] = []

        const unsubscribe = db.selectors.allUserNames.subscribe((names) => {
          updates.push([...names])
        })

        await new Promise((resolve) => setTimeout(resolve, 100))
        assert(updates.length === 1, "Should receive initial update")

        // Create multiple users rapidly
        await Promise.all([
          db.collections.users.create({ name: "Batch User 1", age: 25 }),
          db.collections.users.create({ name: "Batch User 2", age: 30 }),
          db.collections.users.create({ name: "Batch User 3", age: 35 }),
        ])

        // Wait for batched update
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Should receive batched update (changes may be batched into fewer updates)
        assert(updates.length >= 2, "Should receive at least one update after batch operations")

        const finalUpdate = updates[updates.length - 1]
        assert(finalUpdate.length === 3, "Final update should have all 3 users")
        assert(finalUpdate.includes("Batch User 1"), "Should include first user")
        assert(finalUpdate.includes("Batch User 2"), "Should include second user")
        assert(finalUpdate.includes("Batch User 3"), "Should include third user")

        unsubscribe()
      })

      test("should handle selector with complex logic", async () => {
        // Create a more complex selector for testing
        const complexSelector = db.selectors.allUserNames

        // Create users with different ages
        await db.collections.users.create({ name: "Young User", age: 20 })
        await db.collections.users.create({ name: "Middle User", age: 30 })
        await db.collections.users.create({ name: "Old User", age: 40 })

        const allNames = await complexSelector.get()
        assert(allNames.length === 3, "Should get all user names")
        assert(allNames.includes("Young User"), "Should include young user")
        assert(allNames.includes("Middle User"), "Should include middle user")
        assert(allNames.includes("Old User"), "Should include old user")
      })

      test("should work with empty collections", async () => {
        // Test selector with no data
        const userNames = await db.selectors.allUserNames.get()
        assert(Array.isArray(userNames), "Should return array even when empty")
        assert(userNames.length === 0, "Should be empty array")
      })

      test("should handle subscription cleanup properly", async () => {
        let updateCount = 0

        const unsubscribe = db.selectors.allUserNames.subscribe(() => {
          updateCount++
        })

        await new Promise((resolve) => setTimeout(resolve, 10))
        assert(updateCount === 1, "Should receive initial update")

        // Create user
        await db.collections.users.create({ name: "Cleanup User", age: 25 })
        await new Promise((resolve) => setTimeout(resolve, 10))
        assert(updateCount === 2, "Should receive update for user creation")

        // Unsubscribe
        unsubscribe()

        // Create another user
        await db.collections.users.create({ name: "Post Cleanup User", age: 30 })
        await new Promise((resolve) => setTimeout(resolve, 10))

        assert(updateCount === 2, "Should not receive updates after cleanup")
      })

      test("should handle errors in selector gracefully", async () => {
        // This test ensures the selector framework handles errors gracefully
        // The current allUserNames selector is simple and shouldn't error,
        // but this tests the error handling infrastructure

        try {
          const result = await db.selectors.allUserNames.get()
          assert(Array.isArray(result), "Should return valid result even if no users")
        } catch (error) {
          // If there's an error, it should be handled gracefully
          assert(false, `Selector should not throw errors: ${error}`)
        }
      })

      test("should support immediate subscription and data access", async () => {
        // Create user first
        await db.collections.users.create({ name: "Immediate User", age: 25 })

        let subscriptionData: string[] | null = null

        // Subscribe and get immediate data
        const unsubscribe = db.selectors.allUserNames.subscribe((names) => {
          subscriptionData = names
        })

        // Also get data via promise
        const promiseData = await db.selectors.allUserNames.get()

        await new Promise((resolve) => setTimeout(resolve, 10))

        // Both should have the same data
        assertExists(subscriptionData, "Subscription should have received data")
        assert(
          subscriptionData!.length === promiseData.length,
          "Both methods should return same length"
        )
        assert(subscriptionData![0] === promiseData[0], "Both methods should return same data")
        assert(subscriptionData![0] === "Immediate User", "Should have correct user name")

        unsubscribe()
      })

      test("should support selectors that are created on-the-fly", async () => {
        let timesSelectorCalled = 0

        const users = db.select((ctx) => {
          timesSelectorCalled++
          return ctx.users.all()
        })

        users.subscribe(() => {})

        assert(timesSelectorCalled === 0, "Selector should not be called yet")

        await db.collections.users.create({ name: "Alice", age: 25 })
        await db.collections.users.create({ name: "Bob", age: 30 })
        await db.collections.users.create({ name: "Charlie", age: 35 })

        assert(timesSelectorCalled === 3, "Selector should be called once per consecutive call")

        await Promise.all(
          ["a", "b", "c"].map((name) => db.collections.users.create({ name, age: 40 }))
        )
        assert(timesSelectorCalled === 4, "Selector should have batched multiple calls")

        users.dispose()
      })

      test("should throw an error when performing mutations within a selector", async () => {
        const users = db.select(async (ctx) => {
          // @ts-expect-error - "create" is not a valid member
          await ctx.users.create({ name: "Alice", age: 25 })
          return ctx.users.all()
        })

        await assertThrows(
          async () => {
            await users.get()
          },
          "Should throw an error when performing mutations within a selector",
          "Failed to execute 'add' on 'IDBObjectStore': The transaction is read-only."
        )
      })
    },
  })
}
