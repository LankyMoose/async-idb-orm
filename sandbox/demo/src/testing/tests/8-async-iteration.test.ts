import { assert } from "$/testing/assert"
import { db, Post, User } from "$/db"
import { TestRunner } from "../testRunner"
import { clearAllCollections } from "../utils"

export default (testRunner: TestRunner) => {
  testRunner.suite("Async Iteration", {
    onAfterEach: async () => {
      await clearAllCollections()
    },
    tests: (test) => {
      test("should iterate over collection using async iterator", async () => {
        // Create some users
        await db.collections.users.create({ name: "User 1", age: 25 })
        await db.collections.users.create({ name: "User 2", age: 30 })
        await db.collections.users.create({ name: "User 3", age: 35 })

        const iteratedUsers: any[] = []

        // Use async iteration
        for await (const user of db.collections.users) {
          iteratedUsers.push(user)
        }

        assert(iteratedUsers.length === 3, "Should iterate over all users")
        assert(iteratedUsers[0].name.startsWith("User"), "Should get actual user data")
        assert(iteratedUsers[1].name.startsWith("User"), "Should get actual user data")
        assert(iteratedUsers[2].name.startsWith("User"), "Should get actual user data")
      })

      test("should iterate over empty collection", async () => {
        const iteratedUsers: any[] = []

        // Use async iteration on empty collection
        for await (const user of db.collections.users) {
          iteratedUsers.push(user)
        }

        assert(iteratedUsers.length === 0, "Should handle empty collection gracefully")
      })

      test("should iterate over large collection efficiently", async () => {
        // Create many users
        const userCount = 100
        for (let i = 1; i <= userCount; i++) {
          await db.collections.users.create({ name: `User ${i}`, age: 20 + (i % 50) })
        }

        let iteratedCount = 0
        const iteratedUsers: any[] = []

        // Use async iteration
        for await (const user of db.collections.users) {
          iteratedCount++
          iteratedUsers.push(user)
        }

        assert(iteratedCount === userCount, `Should iterate over all ${userCount} users`)
        assert(iteratedUsers.length === userCount, `Should collect all ${userCount} users`)

        // Verify some of the data
        assert(iteratedUsers[0].name.includes("User"), "Should get actual user data")
        assert(iteratedUsers[50].name.includes("User"), "Should get actual user data")
        assert(iteratedUsers[99].name.includes("User"), "Should get actual user data")
      })

      test("should support breaking out of iteration", async () => {
        // Create users
        await db.collections.users.create({ name: "User 1", age: 25 })
        await db.collections.users.create({ name: "User 2", age: 30 })
        await db.collections.users.create({ name: "User 3", age: 35 })
        await db.collections.users.create({ name: "User 4", age: 40 })
        await db.collections.users.create({ name: "User 5", age: 45 })

        const iteratedUsers: User[] = []

        // Use async iteration with break
        for await (const user of db.collections.users) {
          iteratedUsers.push(user)
          if (iteratedUsers.length >= 3) {
            break
          }
        }

        assert(iteratedUsers.length === 3, "Should break iteration early")
        assert(iteratedUsers[0].name.startsWith("User"), "Should get actual user data")
        assert(iteratedUsers[2].name.startsWith("User"), "Should get actual user data")
      })

      test("should iterate over index with key range", async () => {
        // Create users with different ages
        await db.collections.users.create({ name: "Young User 1", age: 20 })
        await db.collections.users.create({ name: "Young User 2", age: 25 })
        await db.collections.users.create({ name: "Middle User 1", age: 35 })
        await db.collections.users.create({ name: "Middle User 2", age: 40 })
        await db.collections.users.create({ name: "Old User 1", age: 50 })
        await db.collections.users.create({ name: "Old User 2", age: 60 })

        const iteratedUsers: User[] = []

        // Iterate over users aged 30-45 using index
        const ageKeyRange = IDBKeyRange.bound(30, 45)
        for await (const user of db.collections.users.iterateIndex("idx_age", ageKeyRange)) {
          iteratedUsers.push(user)
        }

        assert(iteratedUsers.length === 2, "Should iterate over users in age range 30-45")
        assert(iteratedUsers[0].age >= 30 && iteratedUsers[0].age <= 45, "Should be in age range")
        assert(iteratedUsers[1].age >= 30 && iteratedUsers[1].age <= 45, "Should be in age range")
        assert(iteratedUsers[0].name.includes("Middle"), "Should get middle-aged users")
        assert(iteratedUsers[1].name.includes("Middle"), "Should get middle-aged users")
      })

      test("should iterate over index with specific key", async () => {
        // Create users with same age
        await db.collections.users.create({ name: "Same Age User 1", age: 30 })
        await db.collections.users.create({ name: "Same Age User 2", age: 30 })
        await db.collections.users.create({ name: "Different Age User", age: 35 })

        const iteratedUsers: User[] = []

        // Iterate over users with specific age
        const ageKeyRange = IDBKeyRange.only(30)
        for await (const user of db.collections.users.iterateIndex("idx_age", ageKeyRange)) {
          iteratedUsers.push(user)
        }

        assert(iteratedUsers.length === 2, "Should iterate over users with age 30")
        assert(iteratedUsers[0].age === 30, "Should have correct age")
        assert(iteratedUsers[1].age === 30, "Should have correct age")
        assert(iteratedUsers[0].name.includes("Same Age"), "Should get same age users")
        assert(iteratedUsers[1].name.includes("Same Age"), "Should get same age users")
      })

      test("should iterate over index with upper bound", async () => {
        // Create users with different ages
        await db.collections.users.create({ name: "Young User 1", age: 20 })
        await db.collections.users.create({ name: "Young User 2", age: 25 })
        await db.collections.users.create({ name: "Middle User", age: 35 })
        await db.collections.users.create({ name: "Old User", age: 50 })

        const iteratedUsers: User[] = []

        // Iterate over users aged 30 and below
        const ageKeyRange = IDBKeyRange.upperBound(30)
        for await (const user of db.collections.users.iterateIndex("idx_age", ageKeyRange)) {
          iteratedUsers.push(user)
        }

        assert(iteratedUsers.length === 2, "Should iterate over users aged 30 and below")
        iteratedUsers.forEach((user) => {
          assert(user.age <= 30, "Should be aged 30 or below")
          assert(user.name.includes("Young"), "Should get young users")
        })
      })

      test("should iterate over index with lower bound", async () => {
        // Create users with different ages
        await db.collections.users.create({ name: "Young User", age: 20 })
        await db.collections.users.create({ name: "Middle User", age: 35 })
        await db.collections.users.create({ name: "Old User 1", age: 50 })
        await db.collections.users.create({ name: "Old User 2", age: 60 })

        const iteratedUsers: User[] = []

        // Iterate over users aged 40 and above
        const ageKeyRange = IDBKeyRange.lowerBound(40)
        for await (const user of db.collections.users.iterateIndex("idx_age", ageKeyRange)) {
          iteratedUsers.push(user)
        }

        assert(iteratedUsers.length === 2, "Should iterate over users aged 40 and above")
        iteratedUsers.forEach((user) => {
          assert(user.age >= 40, "Should be aged 40 or above")
          assert(user.name.includes("Old"), "Should get old users")
        })
      })

      test("should handle concurrent iteration", async () => {
        // Create users
        await db.collections.users.create({ name: "User 1", age: 25 })
        await db.collections.users.create({ name: "User 2", age: 30 })
        await db.collections.users.create({ name: "User 3", age: 35 })

        const results1: User[] = []
        const results2: User[] = []

        // Run two concurrent iterations
        const iteration1 = (async () => {
          for await (const user of db.collections.users) {
            results1.push(user)
          }
        })()

        const iteration2 = (async () => {
          for await (const user of db.collections.users) {
            results2.push(user)
          }
        })()

        await Promise.all([iteration1, iteration2])

        assert(results1.length === 3, "First iteration should get all users")
        assert(results2.length === 3, "Second iteration should get all users")
        assert(results1[0].name.startsWith("User"), "First iteration should get actual data")
        assert(results2[0].name.startsWith("User"), "Second iteration should get actual data")
      })

      test("should work with different collections", async () => {
        // Create data in different collections
        const user = await db.collections.users.create({ name: "Test User", age: 30 })
        await db.collections.posts.create({ content: "Post 1", userId: user.id })
        await db.collections.posts.create({ content: "Post 2", userId: user.id })

        const iteratedUsers: User[] = []
        const iteratedPosts: Post[] = []

        // Iterate over users
        for await (const user of db.collections.users) {
          iteratedUsers.push(user)
        }

        // Iterate over posts
        for await (const post of db.collections.posts) {
          iteratedPosts.push(post)
        }

        assert(iteratedUsers.length === 1, "Should iterate over users")
        assert(iteratedPosts.length === 2, "Should iterate over posts")
        assert(iteratedUsers[0].name === "Test User", "Should get user data")
        assert(iteratedPosts[0].content.startsWith("Post"), "Should get post data")
        assert(iteratedPosts[1].content.startsWith("Post"), "Should get post data")
      })
    },
  })
}
