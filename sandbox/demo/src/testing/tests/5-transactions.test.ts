import { assert, assertThrows } from "$/testing/assert"
import { db } from "$/db"
import { TestRunner } from "../testRunner"
import { clearAllCollections } from "../utils"

export default (testRunner: TestRunner) => {
  testRunner.suite("Transactions", {
    onAfterEach: async () => {
      await clearAllCollections()
    },
    tests: (test) => {
      test("should execute operations within a transaction context", async () => {
        const result = await db.transaction(async (ctx) => {
          const user1 = await ctx.users.create({ name: "Alice", age: 25 })
          const user2 = await ctx.users.create({ name: "Bob", age: 30 })
          const post = await ctx.posts.create({
            content: "Hello from transaction",
            userId: user1.id,
          })

          return { user1, user2, post }
        })

        // Verify all records were created
        const users = await db.collections.users.all()
        const posts = await db.collections.posts.all()

        assert(users.length === 2, "Should have created 2 users in transaction")
        assert(posts.length === 1, "Should have created 1 post in transaction")
        assert(result.user1.name === "Alice", "Should return created user data")
        assert(result.post.content === "Hello from transaction", "Should return created post data")
      })

      test("should rollback transaction on thrown error", async () => {
        // Create initial user outside transaction
        await db.collections.users.create({ name: "Initial User", age: 20 })

        await assertThrows(
          async () => {
            await db.transaction(async (ctx) => {
              await ctx.users.create({ name: "User 1", age: 25 })
              await ctx.users.create({ name: "User 2", age: 30 })

              // This should cause the transaction to fail and rollback
              throw new Error("Transaction failed")
            })
          },
          "Transaction should throw error",
          "Transaction failed"
        )

        // Verify no new users were created (transaction rolled back)
        const users = await db.collections.users.all()
        assert(users.length === 1, "Should only have initial user (transaction rolled back)")
        assert(users[0].name === "Initial User", "Should preserve user created outside transaction")
      })

      test("should support active records within transactions", async () => {
        const result = await db.transaction(async (ctx) => {
          const activeUser = await ctx.users.createActive({ name: "Active User", age: 35 })

          // Modify and save within transaction
          activeUser.name = "Modified Active User"
          activeUser.age = 40
          await activeUser.save()

          return activeUser
        })

        // Verify changes were committed
        const savedUser = await db.collections.users.find(result.id)
        assert(savedUser !== null, "User should exist after transaction")
        assert(savedUser!.name === "Modified Active User", "User name should be updated")
        assert(savedUser!.age === 40, "User age should be updated")
      })

      test("should handle foreign key constraints within transactions", async () => {
        await db.transaction(async (ctx) => {
          const user = await ctx.users.create({ name: "Transaction User", age: 28 })
          const post = await ctx.posts.create({ content: "Transaction Post", userId: user.id })
          const comment = await ctx.postComments.create({
            content: "Transaction Comment",
            postId: post.id,
            userId: user.id,
          })

          // All should be created successfully within transaction
          assert(user.name === "Transaction User", "User should be created")
          assert(post.content === "Transaction Post", "Post should be created")
          assert(comment.content === "Transaction Comment", "Comment should be created")
        })
      })

      test("should rollback on foreign key violation", async () => {
        await assertThrows(
          async () => {
            await db.transaction(async (ctx) => {
              await ctx.users.create({ name: "Valid User", age: 25 })

              // This should fail due to non-existent user reference
              await ctx.posts.create({ content: "Invalid Post", userId: 99999 })
            })
          },
          "Should throw foreign key constraint error",
          "Foreign key constraint violation"
        )

        // Verify no users were created (transaction rolled back)
        const users = await db.collections.users.all()
        assert(users.length === 0, "No users should exist after failed transaction")
      })

      test("should support manual transaction abort", async () => {
        try {
          await db.transaction(async (ctx, tx) => {
            await ctx.users.create({ name: "User Before Abort", age: 25 })
            await ctx.users.create({ name: "User Before Abort 2", age: 30 })

            // Manually abort the transaction
            tx.abort()

            // Return something to complete the transaction function
            return
          })
        } catch (error) {
          // Manual abort might cause the transaction to throw, which is expected
        }

        // Verify no users were created (transaction aborted)
        const users = await db.collections.users.all()
        assert(users.length === 0, "No users should exist after aborted transaction")
      })

      test("should support manual transaction commit", async () => {
        await db.transaction(async (ctx, tx) => {
          const user = await ctx.users.create({ name: "User Before Commit", age: 25 })
          await ctx.posts.create({ content: "Post Before Commit", userId: user.id })

          // Manually commit the transaction
          tx.commit()
        })

        // Verify records were created
        const users = await db.collections.users.all()
        const posts = await db.collections.posts.all()

        assert(users.length === 1, "Should have 1 user after committed transaction")
        assert(posts.length === 1, "Should have 1 post after committed transaction")
      })

      test("should handle nested operations correctly", async () => {
        const result = await db.transaction(async (ctx) => {
          // Create user and post
          const user = await ctx.users.create({ name: "Nested User", age: 35 })
          const post = await ctx.posts.create({ content: "Parent Post", userId: user.id })

          // Create multiple comments in a loop
          const comments: any[] = []
          for (let i = 1; i <= 3; i++) {
            const comment = await ctx.postComments.create({
              content: `Comment ${i}`,
              postId: post.id,
              userId: user.id,
            })
            comments.push(comment)
          }

          return { user, post, comments }
        })

        // Verify all nested operations completed
        const users = await db.collections.users.all()
        const posts = await db.collections.posts.all()
        const comments = await db.collections.postComments.all()

        assert(users.length === 1, "Should create 1 user")
        assert(posts.length === 1, "Should create 1 post")
        assert(comments.length === 3, "Should create 3 comments")
        assert(result.comments.length === 3, "Should return all created comments")
      })

      test("should handle concurrent transactions", async () => {
        // Start a transaction but don't await it immediately
        const transactionPromise = db.transaction(async (ctx) => {
          const user = await ctx.users.create({ name: "Transaction User", age: 30 })

          await ctx.users.create({ name: "Transaction User 2", age: 30 })

          return user
        })

        // While transaction is running, try to read from outside
        await db.collections.users.all()

        // Wait for transaction to complete
        const transactionResult = await transactionPromise

        assert(
          transactionResult.name === "Transaction User",
          "Transaction should return created data"
        )
      })
    },
  })
}
