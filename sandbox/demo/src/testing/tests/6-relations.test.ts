import { assert, assertExists } from "$/testing/assert"
import { db } from "$/db"
import { TestRunner } from "../testRunner"
import { clearAllCollections } from "../utils"

export default (testRunner: TestRunner) => {
  testRunner.suite("Relations", {
    onAfterEach: async () => {
      await clearAllCollections()
    },
    tests: (test) => {
      test("should load one-to-many relations", async () => {
        // Create user and posts
        const user = await db.collections.users.create({ name: "John Doe", age: 30 })
        await db.collections.posts.create({ content: "Post 1", userId: user.id })
        await db.collections.posts.create({ content: "Post 2", userId: user.id })
        await db.collections.posts.create({ content: "Post 3", userId: user.id })

        // Load user with posts
        const userWithPosts = await db.collections.users.find(user.id, {
          with: { userPosts: true },
        })

        assertExists(userWithPosts, "User should be found")
        assert(Array.isArray(userWithPosts.userPosts), "userPosts should be an array")
        assert(userWithPosts.userPosts.length === 3, "Should load all 3 posts")
        assert(
          userWithPosts.userPosts[0].content.startsWith("Post"),
          "Posts should have correct content"
        )
      })

      test("should load one-to-one relations", async () => {
        // Create user and post
        const user = await db.collections.users.create({ name: "Jane Doe", age: 25 })
        const post = await db.collections.posts.create({ content: "My Post", userId: user.id })

        // Load post with author
        const postWithAuthor = await db.collections.posts.find(post.id, {
          with: { author: true },
        })

        assertExists(postWithAuthor, "Post should be found")
        assertExists(postWithAuthor.author, "Author should be loaded")
        assert(postWithAuthor.author.name === "Jane Doe", "Author should have correct name")
        assert(postWithAuthor.author.age === 25, "Author should have correct age")
      })

      test("should load multiple relations simultaneously", async () => {
        // Create user, posts, and comments
        const user = await db.collections.users.create({ name: "Multi User", age: 35 })
        const post = await db.collections.posts.create({ content: "Multi Post", userId: user.id })

        await db.collections.postComments.create({
          content: "Comment 1",
          postId: post.id,
          userId: user.id,
        })
        await db.collections.postComments.create({
          content: "Comment 2",
          postId: post.id,
          userId: user.id,
        })

        // Load user with both posts and comments
        const userWithRelations = await db.collections.users.find(user.id, {
          with: {
            userPosts: true,
            userComments: true,
          },
        })

        assertExists(userWithRelations, "User should be found")
        assert(userWithRelations.userPosts.length === 1, "Should load user's posts")
        assert(userWithRelations.userComments.length === 2, "Should load user's comments")
      })

      test("should filter relations using where clause", async () => {
        // Create user and posts with different content
        const user = await db.collections.users.create({ name: "Filter User", age: 28 })
        await db.collections.posts.create({
          content: "Important: Meeting today",
          userId: user.id,
        })
        await db.collections.posts.create({ content: "Regular post", userId: user.id })
        await db.collections.posts.create({
          content: "Important: Deadline tomorrow",
          userId: user.id,
        })

        // Load user with only important posts
        const userWithImportantPosts = await db.collections.users.find(user.id, {
          with: {
            userPosts: {
              where: (post) => post.content.includes("Important"),
            },
          },
        })

        assertExists(userWithImportantPosts, "User should be found")
        assert(userWithImportantPosts.userPosts.length === 2, "Should load only important posts")
        userWithImportantPosts.userPosts.forEach((post) => {
          assert(post.content.includes("Important"), "All loaded posts should be important")
        })
      })

      test("should limit relations using limit option (single user)", async () => {
        // Create user and many posts
        const user = await db.collections.users.create({ name: "Limit User", age: 32 })
        for (let i = 1; i <= 10; i++) {
          await db.collections.posts.create({ content: `Post ${i}`, userId: user.id })
        }

        // Load user with limited posts
        const userWithLimitedPosts = await db.collections.users.find(user.id, {
          with: {
            userPosts: {
              limit: 5,
            },
          },
        })

        assertExists(userWithLimitedPosts, "User should be found")
        assert(userWithLimitedPosts.userPosts.length === 5, "Should limit to 5 posts")
      })

      test("should limit relations using limit option (multiple users)", async () => {
        // Create user and many posts
        for (let i = 0; i < 10; i++) {
          await db.collections.users.create({ name: `Limit User ${i}`, age: 32 })
        }
        for await (const user of db.collections.users) {
          for (let i = 0; i < 10; i++) {
            await db.collections.posts.create({ content: `Post ${i}`, userId: user.id })
          }
        }

        // Load users with limited posts
        const usersWithLimitedPosts = await db.collections.users.findMany(() => true, {
          limit: 5,
          with: {
            userPosts: {
              limit: 5,
            },
          },
        })

        assertExists(usersWithLimitedPosts.length === 5, "Should have loaded 5 users")
        assert(
          usersWithLimitedPosts.every((user) => user.userPosts.length === 5),
          "Should have loaded 5 posts per user"
        )
      })

      test("should combine filtering and limiting", async () => {
        // Create user and posts
        const user = await db.collections.users.create({ name: "Filter Limit User", age: 27 })

        // Create multiple posts, some matching filter
        await db.collections.posts.create({
          content: "Tutorial: Getting started",
          userId: user.id,
        })
        await db.collections.posts.create({ content: "Regular post 1", userId: user.id })
        await db.collections.posts.create({
          content: "Tutorial: Advanced topics",
          userId: user.id,
        })
        await db.collections.posts.create({
          content: "Tutorial: Best practices",
          userId: user.id,
        })
        await db.collections.posts.create({ content: "Regular post 2", userId: user.id })

        // Load user with filtered and limited posts
        const userWithFilteredLimitedPosts = await db.collections.users.find(user.id, {
          with: {
            userPosts: {
              where: (post) => post.content.includes("Tutorial"),
              limit: 2,
            },
          },
        })

        assertExists(userWithFilteredLimitedPosts, "User should be found")
        assert(
          userWithFilteredLimitedPosts.userPosts.length === 2,
          "Should limit to 2 posts after filtering"
        )
        userWithFilteredLimitedPosts.userPosts.forEach((post) => {
          assert(post.content.includes("Tutorial"), "All loaded posts should match filter")
        })
      })

      test("should load nested relations", async () => {
        // Create user, post, and comments
        const user = await db.collections.users.create({ name: "Nested User", age: 29 })
        const post = await db.collections.posts.create({
          content: "Post with comments",
          userId: user.id,
        })

        await db.collections.postComments.create({
          content: "First comment",
          postId: post.id,
          userId: user.id,
        })
        await db.collections.postComments.create({
          content: "Second comment",
          postId: post.id,
          userId: user.id,
        })

        // Load user with posts and their comments
        const userWithNestedRelations = await db.collections.users.find(user.id, {
          with: {
            userPosts: {
              with: {
                postComments: true,
              },
            },
          },
        })

        assertExists(userWithNestedRelations, "User should be found")
        assert(userWithNestedRelations.userPosts.length === 1, "Should load user's posts")

        const postWithComments = userWithNestedRelations.userPosts[0]
        assert(Array.isArray(postWithComments.postComments), "Post should have comments array")
        assert(postWithComments.postComments.length === 2, "Post should have 2 comments")
      })

      test("should work with findMany and relations", async () => {
        // Create multiple users with posts
        const user1 = await db.collections.users.create({ name: "Active User 1", age: 25 })
        const user2 = await db.collections.users.create({ name: "Active User 2", age: 30 })
        await db.collections.users.create({ name: "Young User", age: 15 })

        await db.collections.posts.create({ content: "Post by user 1", userId: user1.id })
        await db.collections.posts.create({ content: "Post by user 2", userId: user2.id })

        // Find adult users with their posts
        const adultUsersWithPosts = await db.collections.users.findMany((user) => user.age >= 18, {
          with: { userPosts: true },
        })

        assert(adultUsersWithPosts.length === 2, "Should find 2 adult users")
        adultUsersWithPosts.forEach((user) => {
          assert(user.age >= 18, "All users should be adults")
          assert(Array.isArray(user.userPosts), "Each user should have posts array")
        })
      })

      test("should work with all() and relations", async () => {
        // Create users and posts
        const user1 = await db.collections.users.create({ name: "All User 1", age: 20 })
        const user2 = await db.collections.users.create({ name: "All User 2", age: 25 })

        await db.collections.posts.create({ content: "Post 1", userId: user1.id })
        await db.collections.posts.create({ content: "Post 2", userId: user2.id })

        // Get all users with their posts
        const allUsersWithPosts = await db.collections.users.all({
          with: { userPosts: true },
        })

        assert(allUsersWithPosts.length === 2, "Should get all users")
        allUsersWithPosts.forEach((user) => {
          assert(Array.isArray(user.userPosts), "Each user should have posts array")
          assert(user.userPosts.length === 1, "Each user should have 1 post")
        })
      })

      test("should handle empty relations gracefully", async () => {
        // Create user without posts
        const user = await db.collections.users.create({ name: "No Posts User", age: 22 })

        // Load user with posts relation
        const userWithPosts = await db.collections.users.find(user.id, {
          with: { userPosts: true },
        })

        assertExists(userWithPosts, "User should be found")
        assert(Array.isArray(userWithPosts.userPosts), "userPosts should be an array")
        assert(userWithPosts.userPosts.length === 0, "userPosts should be empty")
      })

      test("should handle complex nested filtering", async () => {
        // Create user, posts, and comments
        const user = await db.collections.users.create({ name: "Complex User", age: 33 })
        const post1 = await db.collections.posts.create({
          content: "Tutorial post",
          userId: user.id,
        })
        const post2 = await db.collections.posts.create({
          content: "Regular post",
          userId: user.id,
        })

        // Add comments to both posts
        await db.collections.postComments.create({
          content: "Long comment with lots of details",
          postId: post1.id,
          userId: user.id,
        })
        await db.collections.postComments.create({
          content: "Short",
          postId: post1.id,
          userId: user.id,
        })
        await db.collections.postComments.create({
          content: "Another detailed comment with many words",
          postId: post2.id,
          userId: user.id,
        })

        // Load user with filtered nested relations
        const userWithFilteredNested = await db.collections.users.find(user.id, {
          with: {
            userPosts: {
              where: (post) => post.content.includes("Tutorial"),
              with: {
                postComments: {
                  where: (comment) => comment.content.length > 10,
                  limit: 1,
                },
              },
            },
          },
        })

        assertExists(userWithFilteredNested, "User should be found")
        assert(userWithFilteredNested.userPosts.length === 1, "Should load only tutorial posts")

        const tutorialPost = userWithFilteredNested.userPosts[0]
        assert(tutorialPost.content.includes("Tutorial"), "Post should be tutorial")
        assert(tutorialPost.postComments.length === 1, "Should load only 1 long comment")
        assert(tutorialPost.postComments[0].content.length > 10, "Comment should be long")
      })
    },
  })
}
