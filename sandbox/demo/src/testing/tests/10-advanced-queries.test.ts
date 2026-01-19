import { assert, assertExists } from "$/testing/assert"
import { db } from "$/db"
import { TestRunner } from "../testRunner"
import { clearAllCollections } from "../utils"

export default (testRunner: TestRunner) => {
  testRunner.suite("Advanced Queries", {
    onAfterEach: async () => {
      await clearAllCollections()
    },
    tests: (test) => {
      test("should find records using predicate functions", async () => {
        // Create users with different ages
        await db.collections.users.create({ name: "Young User", age: 20 })
        await db.collections.users.create({ name: "Adult User", age: 30 })
        await db.collections.users.create({ name: "Senior User", age: 60 })

        // Find using predicate
        const adults = await db.collections.users.findMany(
          (user) => user.age >= 21 && user.age < 60
        )

        assert(adults.length === 1, "Should find 1 adult user")
        assert(adults[0].name === "Adult User", "Should find the correct adult user")
        assert(adults[0].age === 30, "Adult user should have correct age")
      })

      test("should handle complex predicate conditions", async () => {
        // Create users with different names and ages
        await db.collections.users.create({ name: "Alice Smith", age: 25 })
        await db.collections.users.create({ name: "Bob Johnson", age: 35 })
        await db.collections.users.create({ name: "Alice Brown", age: 45 })
        await db.collections.users.create({ name: "Charlie Smith", age: 55 })

        // Find users named Alice OR aged between 30-40
        const results = await db.collections.users.findMany(
          (user) => user.name.includes("Alice") || (user.age >= 30 && user.age <= 40)
        )

        assert(results.length === 3, "Should find 3 matching users")

        // Verify results contain the expected users
        const names = results.map((user) => user.name)
        assert(names.includes("Alice Smith"), "Should include Alice Smith")
        assert(names.includes("Bob Johnson"), "Should include Bob Johnson")
        assert(names.includes("Alice Brown"), "Should include Alice Brown")
      })

      test("should use min() to find record with minimum value", async () => {
        // Create users with different ages
        await db.collections.users.create({ name: "Middle User", age: 30 })
        await db.collections.users.create({ name: "Youngest User", age: 18 })
        await db.collections.users.create({ name: "Oldest User", age: 65 })

        // Find youngest user using age index
        const youngestUser = await db.collections.users.min("idx_age")

        assertExists(youngestUser, "Should find youngest user")
        assert(youngestUser.age === 18, "Should have minimum age")
        assert(youngestUser.name === "Youngest User", "Should be the correct user")
      })

      test("should use min() with FindOptions to load relations", async () => {
        // Create users with different ages
        const youngestUser = await db.collections.users.create({ name: "Youngest User", age: 18 })
        await db.collections.users.create({ name: "Middle User", age: 30 })
        await db.collections.users.create({ name: "Oldest User", age: 65 })

        // Create posts for the youngest user
        await db.collections.posts.create({ content: "Post 1", userId: youngestUser.id })
        await db.collections.posts.create({ content: "Post 2", userId: youngestUser.id })

        // Find youngest user with posts loaded
        const youngestWithPosts = await db.collections.users.min("idx_age", {
          with: {
            userPosts: true,
          },
        })

        assertExists(youngestWithPosts, "Should find youngest user")
        assert(youngestWithPosts.age === 18, "Should have minimum age")
        assert(Array.isArray(youngestWithPosts.userPosts), "userPosts should be an array")
        assert(youngestWithPosts.userPosts.length === 2, "Should have 2 posts loaded")
      })

      test("should use max() to find record with maximum value", async () => {
        // Create users with different ages
        await db.collections.users.create({ name: "Young User", age: 22 })
        await db.collections.users.create({ name: "Middle User", age: 40 })
        await db.collections.users.create({ name: "Oldest User", age: 70 })

        // Find oldest user using age index
        const oldestUser = await db.collections.users.max("idx_age")

        assertExists(oldestUser, "Should find oldest user")
        assert(oldestUser.age === 70, "Should have maximum age")
        assert(oldestUser.name === "Oldest User", "Should be the correct user")
      })

      test("should use max() with FindOptions to load relations", async () => {
        // Create users with different ages
        await db.collections.users.create({ name: "Young User", age: 22 })
        await db.collections.users.create({ name: "Middle User", age: 40 })
        const oldestUser = await db.collections.users.create({ name: "Oldest User", age: 70 })

        // Create posts for the oldest user
        await db.collections.posts.create({ content: "Post 1", userId: oldestUser.id })
        await db.collections.posts.create({ content: "Post 2", userId: oldestUser.id })
        await db.collections.posts.create({ content: "Post 3", userId: oldestUser.id })

        // Find oldest user with posts loaded
        const oldestWithPosts = await db.collections.users.max("idx_age", {
          with: {
            userPosts: true,
          },
        })

        assertExists(oldestWithPosts, "Should find oldest user")
        assert(oldestWithPosts.age === 70, "Should have maximum age")
        assert(Array.isArray(oldestWithPosts.userPosts), "userPosts should be an array")
        assert(oldestWithPosts.userPosts.length === 3, "Should have 3 posts loaded")
      })

      test("should return null for min/max on empty collection", async () => {
        // Test min/max on empty collection
        const minUser = await db.collections.users.min("idx_age")
        const maxUser = await db.collections.users.max("idx_age")

        assert(minUser === null, "min should return null for empty collection")
        assert(maxUser === null, "max should return null for empty collection")
      })

      test("should use getIndexRange to query specific ranges", async () => {
        // Create users with different ages
        await db.collections.users.create({ name: "Teen User", age: 16 })
        await db.collections.users.create({ name: "Young Adult 1", age: 22 })
        await db.collections.users.create({ name: "Young Adult 2", age: 28 })
        await db.collections.users.create({ name: "Middle Age User", age: 35 })
        await db.collections.users.create({ name: "Senior User", age: 65 })

        // Get users aged 20-30 (inclusive)
        const youngAdults = await db.collections.users.getIndexRange(
          "idx_age",
          IDBKeyRange.bound(20, 30)
        )

        assert(youngAdults.length === 2, "Should find 2 young adults")
        youngAdults.forEach((user) => {
          assert(user.age >= 20 && user.age <= 30, "Should be in age range 20-30")
          assert(user.name.includes("Young Adult"), "Should be young adult users")
        })
      })

      test("should use getIndexRange with exclusive bounds", async () => {
        // Create users
        await db.collections.users.create({ name: "User 20", age: 20 })
        await db.collections.users.create({ name: "User 25", age: 25 })
        await db.collections.users.create({ name: "User 30", age: 30 })

        // Get users aged >20 and <30 (exclusive)
        const results = await db.collections.users.getIndexRange(
          "idx_age",
          IDBKeyRange.bound(20, 30, true, true)
        )

        assert(results.length === 1, "Should find 1 user with exclusive bounds")
        assert(results[0].age === 25, "Should find user aged 25")
        assert(results[0].name === "User 25", "Should be the correct user")
      })

      test("should use getIndexRange with only lower bound", async () => {
        // Create users
        await db.collections.users.create({ name: "Young User", age: 25 })
        await db.collections.users.create({ name: "Middle User", age: 35 })
        await db.collections.users.create({ name: "Old User", age: 45 })

        // Get users aged 30 and above
        const results = await db.collections.users.getIndexRange(
          "idx_age",
          IDBKeyRange.lowerBound(30)
        )

        assert(results.length === 2, "Should find 2 users aged 30+")
        results.forEach((user) => {
          assert(user.age >= 30, "Should be aged 30 or above")
        })
      })

      test("should use getIndexRange with only upper bound", async () => {
        // Create users
        await db.collections.users.create({ name: "Young User", age: 25 })
        await db.collections.users.create({ name: "Middle User", age: 35 })
        await db.collections.users.create({ name: "Old User", age: 45 })

        // Get users aged 35 and below
        const results = await db.collections.users.getIndexRange(
          "idx_age",
          IDBKeyRange.upperBound(35)
        )

        assert(results.length === 2, "Should find 2 users aged 35 and below")
        results.forEach((user) => {
          assert(user.age <= 35, "Should be aged 35 or below")
        })
      })

      test("should use getIndexRange with FindOptions to load relations", async () => {
        // Create users with different ages and posts
        const user1 = await db.collections.users.create({ name: "User 1", age: 25 })
        const user2 = await db.collections.users.create({ name: "User 2", age: 30 })
        await db.collections.users.create({ name: "User 3", age: 40 })

        // Create posts for users
        await db.collections.posts.create({ content: "Post 1", userId: user1.id })
        await db.collections.posts.create({ content: "Post 2", userId: user1.id })
        await db.collections.posts.create({ content: "Post 3", userId: user2.id })

        // Get users aged 25-35 with their posts loaded
        const usersWithPosts = await db.collections.users.getIndexRange(
          "idx_age",
          IDBKeyRange.bound(25, 35),
          {
            with: {
              userPosts: true,
            },
          }
        )

        assert(usersWithPosts.length === 2, "Should find 2 users in age range")

        // Verify user1 has posts loaded
        const foundUser1 = usersWithPosts.find((u) => u.id === user1.id)
        assertExists(foundUser1, "Should find user1")
        assert(Array.isArray(foundUser1.userPosts), "userPosts should be an array")
        assert(foundUser1.userPosts.length === 2, "User1 should have 2 posts")

        // Verify user2 has posts loaded
        const foundUser2 = usersWithPosts.find((u) => u.id === user2.id)
        assertExists(foundUser2, "Should find user2")
        assert(Array.isArray(foundUser2.userPosts), "userPosts should be an array")
        assert(foundUser2.userPosts.length === 1, "User2 should have 1 post")
      })

      test("should handle batch upsert operations", async () => {
        // Create initial user
        const existingUser = await db.collections.users.create({ name: "Existing User", age: 30 })

        // Upsert multiple records (some new, some updates)
        await db.collections.users.upsert(
          {
            id: existingUser.id,
            name: "Updated User",
            age: 31,
            createdAt: existingUser.createdAt,
          },
          { name: "New User 1", age: 25 },
          { name: "New User 2", age: 35 }
        )

        // Verify results
        const allUsers = await db.collections.users.all()
        assert(allUsers.length === 3, "Should have 3 users total")

        // Find updated user
        const updatedUser = await db.collections.users.find(existingUser.id)
        assertExists(updatedUser, "Updated user should exist")
        assert(updatedUser.name === "Updated User", "User should be updated")
        assert(updatedUser.age === 31, "User age should be updated")

        // Verify new users were created
        const newUsers = allUsers.filter((user) => user.id !== existingUser.id)
        assert(newUsers.length === 2, "Should have 2 new users")
        assert(
          newUsers.some((user) => user.name === "New User 1"),
          "Should have New User 1"
        )
        assert(
          newUsers.some((user) => user.name === "New User 2"),
          "Should have New User 2"
        )
      })

      test("should handle deleteMany with predicate", async () => {
        // Create multiple users
        await db.collections.users.create({ name: "Young User 1", age: 20 })
        await db.collections.users.create({ name: "Young User 2", age: 25 })
        await db.collections.users.create({ name: "Old User 1", age: 60 })
        await db.collections.users.create({ name: "Old User 2", age: 65 })

        // Delete users under 30
        await db.collections.users.deleteMany((user) => user.age < 30)

        // Verify deletions
        const remainingUsers = await db.collections.users.all()
        assert(remainingUsers.length === 2, "Should have 2 remaining users")
        remainingUsers.forEach((user) => {
          assert(user.age >= 60, "Remaining users should be 60 or older")
          assert(user.name.includes("Old User"), "Should be old users")
        })
      })

      test("should handle clear operation", async () => {
        // Create multiple users
        await db.collections.users.create({ name: "User 1", age: 25 })
        await db.collections.users.create({ name: "User 2", age: 30 })
        await db.collections.users.create({ name: "User 3", age: 35 })

        // Verify users exist
        let allUsers = await db.collections.users.all()
        assert(allUsers.length === 3, "Should have 3 users before clear")

        // Clear collection
        await db.collections.users.clear()

        // Verify collection is empty
        allUsers = await db.collections.users.all()
        assert(allUsers.length === 0, "Should have 0 users after clear")
      })

      test("should work with compound indexes", async () => {
        // Create users with same name but different ages
        await db.collections.users.create({ name: "John Doe", age: 25 })
        await db.collections.users.create({ name: "John Doe", age: 35 })
        await db.collections.users.create({ name: "Jane Smith", age: 25 })

        // Query using compound index (name + id)
        const results = await db.collections.users.getIndexRange(
          "idx_name_id",
          IDBKeyRange.bound(["John Doe", 0], ["John Doe", Number.MAX_SAFE_INTEGER])
        )

        assert(results.length === 2, "Should find 2 John Doe users")
        results.forEach((user) => {
          assert(user.name === "John Doe", "Should be John Doe users")
        })
      })

      test("should handle concurrent queries", async () => {
        // Create test data with varied ages (some young, some old)
        for (let i = 1; i <= 20; i++) {
          const age = i <= 10 ? 20 + i : 50 + i // First 10 users: ages 21-30, next 10: ages 61-70
          await db.collections.users.create({ name: `User ${i}`, age })
        }

        // Run multiple concurrent queries
        const [allUsers, youngUsers, oldUsers, minUser, maxUser] = await Promise.all([
          db.collections.users.all(),
          db.collections.users.findMany((user) => user.age < 30),
          db.collections.users.findMany((user) => user.age >= 50),
          db.collections.users.min("idx_age"),
          db.collections.users.max("idx_age"),
        ])

        // Verify all queries returned valid results
        assert(allUsers.length === 20, "Should have 20 total users")
        assert(youngUsers.length > 0, "Should have some young users")
        assert(oldUsers.length > 0, "Should have some old users")
        assertExists(minUser, "Should find minimum user")
        assertExists(maxUser, "Should find maximum user")
        assert(minUser.age <= maxUser.age, "Min age should be <= max age")
      })
    },
  })
}
