import { assert, assertExists, assertInstanceOf } from "$/testing/assert"
import { db, Post, TimeStamp } from "$/db"
import { TestRunner } from "../framework"
import { clearAllCollections } from "../utils"

export default (testRunner: TestRunner) => {
  testRunner.suite("Integration Tests", {
    onAfterEach: async () => {
      await clearAllCollections()
    },
    tests: (test) => {
      test("should demonstrate complete blog platform workflow", async () => {
        // 1. Create users
        const author = await db.collections.users.create({ name: "Jane Author", age: 30 })
        const commenter1 = await db.collections.users.create({ name: "Bob Reader", age: 25 })
        const commenter2 = await db.collections.users.create({ name: "Alice Fan", age: 28 })

        // 2. Create blog posts
        const post1 = await db.collections.posts.create({
          content: "My First Blog Post - Introduction to IndexedDB",
          userId: author.id,
        })
        const post2 = await db.collections.posts.create({
          content: "Advanced Patterns in Web Development",
          userId: author.id,
        })

        // 3. Create comments on posts
        await db.collections.postComments.create({
          content: "Great introduction! Very helpful for beginners.",
          postId: post1.id,
          userId: commenter1.id,
        })
        await db.collections.postComments.create({
          content: "Looking forward to the next post in this series.",
          postId: post1.id,
          userId: commenter2.id,
        })
        await db.collections.postComments.create({
          content: "Advanced patterns are exactly what I needed!",
          postId: post2.id,
          userId: commenter1.id,
        })

        // 4. Create todos for author
        await db.collections.todos.create({
          content: "Write follow-up blog post",
          userId: author.id,
        })
        await db.collections.todos.create({
          content: "Respond to comments",
          userId: author.id,
        })

        // 5. Test relations - load author with all their content
        const authorWithContent = await db.collections.users.find(author.id, {
          with: {
            userPosts: {
              with: {
                postComments: {
                  with: {
                    author: true,
                  },
                },
              },
            },
            userTodos: true,
            userComments: true,
          },
        })

        assertExists(authorWithContent, "Author should be found")
        assert(authorWithContent.userPosts.length === 2, "Author should have 2 posts")
        assert(authorWithContent.userTodos.length === 2, "Author should have 2 todos")
        assert(authorWithContent.userComments.length === 0, "Author should have 0 comments")

        // 6. Test nested relations
        const postWithComments = authorWithContent.userPosts[0]
        assert(postWithComments.postComments.length > 0, "Post should have comments")

        const firstComment = postWithComments.postComments[0]
        assertExists(firstComment.author, "Comment should have author loaded")
        assert(
          firstComment.author.name.includes("Reader") || firstComment.author.name.includes("Fan"),
          "Comment author should be a reader or fan"
        )

        // 7. Test selectors
        const allUserNames = await db.selectors.allUserNames.get()
        assert(allUserNames.length === 3, "Should have 3 user names")
        assert(allUserNames.includes("Jane Author"), "Should include author")
        assert(allUserNames.includes("Bob Reader"), "Should include reader")
        assert(allUserNames.includes("Alice Fan"), "Should include fan")

        // 8. Test advanced queries
        const activeBloggers = await db.collections.users.findMany(
          (user) => user.age >= 25 && user.name.includes("Author")
        )
        assert(activeBloggers.length === 1, "Should find 1 active blogger")
        assert(activeBloggers[0].name === "Jane Author", "Should be the author")

        // 9. Test transactions - update post and add new comment atomically
        await db.transaction(async (ctx) => {
          // Update post content
          await ctx.posts.update({
            ...post1,
            content: "My First Blog Post - Introduction to IndexedDB (Updated)",
          })

          // Add new comment
          await ctx.postComments.create({
            content: "Thanks for the update!",
            postId: post1.id,
            userId: commenter2.id,
          })
        })

        // 10. Verify transaction results
        const updatedPost = await db.collections.posts.find(post1.id)
        assertExists(updatedPost, "Post should exist")
        assert(updatedPost.content.includes("(Updated)"), "Post should be updated")

        const allComments = await db.collections.postComments.findMany((c) => c.postId === post1.id)
        assert(allComments.length === 3, "Should have 3 comments on first post")

        // 11. Test foreign key cascade - delete author should cascade
        await db.collections.todos.deleteMany((todo) => todo.userId === author.id)
        await db.collections.users.delete(author.id)

        // Verify cascade worked
        const remainingPosts = await db.collections.posts.all()
        const remainingComments = await db.collections.postComments.all()
        const remainingUsers = await db.collections.users.all()

        assert(remainingPosts.length === 0, "All posts should be deleted (cascade)")
        assert(remainingComments.length === 0, "All comments should be deleted (cascade)")
        assert(remainingUsers.length === 2, "Only commenters should remain")
      })

      test("should handle complex data relationships and queries", async () => {
        // Create a more complex scenario with multiple relationships
        const users = await Promise.all([
          db.collections.users.create({ name: "Admin User", age: 35 }),
          db.collections.users.create({ name: "Power User", age: 28 }),
          db.collections.users.create({ name: "Regular User", age: 22 }),
        ])

        // Create posts by different users
        const posts: Post[] = []
        for (const user of users) {
          for (let i = 1; i <= 2; i++) {
            const post = await db.collections.posts.create({
              content: `${user.name} - Post ${i}`,
              userId: user.id,
            })
            posts.push(post)
          }
        }

        // Create cross-comments (users commenting on each other's posts)
        for (const post of posts) {
          for (const user of users) {
            if (user.id !== post.userId) {
              await db.collections.postComments.create({
                content: `Comment by ${user.name} on ${post.content}`,
                postId: post.id,
                userId: user.id,
              })
            }
          }
        }

        // Test complex queries
        const powerUserContent = await db.collections.users.find(users[1].id, {
          with: {
            userPosts: {
              where: (post) => post.content.includes("Power User"),
              with: {
                postComments: {
                  where: (comment) =>
                    comment.content.includes("Admin") || comment.content.includes("Regular"),
                  limit: 5,
                },
              },
            },
            userComments: {
              where: (comment) => comment.content.includes("Power User"),
              limit: 3,
            },
          },
        })

        assertExists(powerUserContent, "Power user should be found")
        assert(powerUserContent.userPosts.length === 2, "Power user should have 2 posts")

        // Each post should have comments from other users
        powerUserContent.userPosts.forEach((post) => {
          assert(
            post.postComments.length === 2,
            "Each post should have 2 comments from other users"
          )
        })

        // Power user should have comments on other posts
        assert(
          powerUserContent.userComments.length === 3,
          "Power user should have 3 comments limited"
        )

        // Test aggregation-like queries
        const allPosts = await db.collections.posts.all()
        const allComments = await db.collections.postComments.all()

        assert(allPosts.length === 6, "Should have 6 total posts")
        assert(allComments.length === 12, "Should have 12 total comments (2 per post)")

        // Test min/max operations
        const youngestUser = await db.collections.users.min("idx_age")
        const oldestUser = await db.collections.users.max("idx_age")

        assertExists(youngestUser, "Should find youngest user")
        assertExists(oldestUser, "Should find oldest user")
        assert(youngestUser.age === 22, "Youngest should be 22")
        assert(oldestUser.age === 35, "Oldest should be 35")
      })

      test("should demonstrate reactive selectors with real-time updates", async () => {
        const selectorUpdates: string[][] = []

        await new Promise((resolve) => setTimeout(resolve, 10))

        // Subscribe to user names selector
        const unsubscribe = db.selectors.allUserNames.subscribe((names) => {
          selectorUpdates.push([...names])
        })

        // Wait for initial update
        await new Promise((resolve) => setTimeout(resolve, 10))
        assert(selectorUpdates.length === 1, "Should receive initial update")
        assert(selectorUpdates[0].length === 0, "Initial update should be empty")

        // Create users and verify reactive updates
        await db.collections.users.create({ name: "First User", age: 25 })
        await new Promise((resolve) => setTimeout(resolve, 10))

        assert(selectorUpdates.length === 2, "Should receive update after user creation")
        assert(selectorUpdates[1].includes("First User"), "Should include new user")

        // Create more users
        await db.collections.users.create({ name: "Second User", age: 30 })
        await db.collections.users.create({ name: "Third User", age: 35 })
        await new Promise((resolve) => setTimeout(resolve, 10))

        // Should have updates for each user creation
        assert(selectorUpdates.length >= 3, "Should have multiple updates")
        const finalUpdate = selectorUpdates[selectorUpdates.length - 1]
        assert(finalUpdate.length === 3, "Final update should have 3 users")
        assert(finalUpdate.includes("First User"), "Should include first user")
        assert(finalUpdate.includes("Second User"), "Should include second user")
        assert(finalUpdate.includes("Third User"), "Should include third user")

        // Test selector with data manipulation
        const users = await db.collections.users.all()
        await db.collections.users.update({ ...users[0], name: "Updated First User" })
        await new Promise((resolve) => setTimeout(resolve, 10))

        const latestUpdate = selectorUpdates[selectorUpdates.length - 1]
        assert(latestUpdate.includes("Updated First User"), "Should reflect name update")
        assert(!latestUpdate.includes("First User"), "Should not have old name")

        unsubscribe()
      })

      test("should handle error scenarios gracefully", async () => {
        // Test foreign key violations
        let errorThrown = false
        try {
          await db.collections.posts.create({
            content: "Invalid post",
            userId: 99999, // Non-existent user
          })
        } catch (error) {
          errorThrown = true
          assertInstanceOf(error, Error, "Should throw error")
          assert(error.message.includes("Foreign key constraint"), "Should throw foreign key error")
        }
        assert(errorThrown, "Should have thrown error for foreign key violation")

        // Test update non-existent record
        errorThrown = false
        try {
          await db.collections.users.update({
            id: 99999,
            name: "Non-existent User",
            age: 25,
            createdAt: new TimeStamp(new Date().toISOString()),
          })
        } catch (error) {
          errorThrown = true
          assertInstanceOf(error, Error, "Should throw error")
          assert(error.message.includes("not found"), "Should throw not found error")
        }
        assert(errorThrown, "Should have thrown error for updating non-existent record")

        // Test that valid operations still work after errors
        const user = await db.collections.users.create({ name: "Valid User", age: 28 })
        const post = await db.collections.posts.create({ content: "Valid Post", userId: user.id })

        assert(user.name === "Valid User", "Valid operations should work after errors")
        assert(post.content === "Valid Post", "Valid operations should work after errors")
      })
    },
  })
}
