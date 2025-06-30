import { assert, assertExists } from "$/testing/assert"
import { TestRunner } from "../testRunner"
import { idb, Collection } from "async-idb-orm"

// Define types for different schema versions
type UserV1 = {
  id: number
  name: string
  email: string
}

type PostV1 = {
  id: string
  title: string
  content: string
  userId: number
}

type UserV2 = {
  id: number
  name: string
  email: string
  createdAt: number // New field in V2
}

type PostV2 = {
  id: string
  title: string
  content: string
  userId: number
  status: "draft" | "published" // New field in V2
  tags: string[] // New field in V2
}

// Helper function to create V1 schema
function createV1Schema() {
  const users = Collection.create<UserV1>().withKeyPath("id", { autoIncrement: true })

  const posts = Collection.create<PostV1>()

  return { users, posts }
}

// Helper function to create V2 schema
function createV2Schema() {
  const users = Collection.create<UserV2>()
    .withKeyPath("id", { autoIncrement: true })
    .withIndexes([{ key: "createdAt", name: "idx_created_at" }])

  const posts = Collection.create<PostV2>().withIndexes([
    { key: "status", name: "idx_status" },
    { key: "tags", name: "idx_tags", multiEntry: true },
  ])

  return { users, posts }
}

const wipeTestDatabases = async () => {
  // Clean up any test databases
  try {
    const dbs = ["migration-test-v1", "migration-test-v2", "migration-test-complex"]
    const existing = (await indexedDB.databases())
      .filter((db) => dbs.includes(db.name!))
      .map((db) => db.name!)

    for (const dbName of existing) {
      // Close any open connections and delete databases
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(dbName)
        request.onsuccess = () => {
          console.log(`Deleted database ${dbName}`)
          resolve(true)
        }
        request.onerror = () => {
          reject(new Error(`Failed to delete database ${dbName}`))
        }
      })
    }
  } catch (error) {
    console.error(error)
    debugger
  }
}

export default (testRunner: TestRunner) => {
  testRunner.suite("Migrations", {
    onBeforeEach: wipeTestDatabases,
    onAfter: wipeTestDatabases,
    tests: (test) => {
      test("should handle basic migration from v1 to v2", async () => {
        // Step 1: Create V1 database with initial data
        const schemaV1 = createV1Schema()
        const dbV1 = idb("migration-test-v1", {
          schema: schemaV1,
          version: 1,
        })

        // Add some initial data to V1
        const user1 = await dbV1.collections.users.create({
          name: "John Doe",
          email: "john@example.com",
        })
        const user2 = await dbV1.collections.users.create({
          name: "Jane Smith",
          email: "jane@example.com",
        })

        await dbV1.collections.posts.create({
          id: "post-1",
          title: "First Post",
          content: "This is the first post",
          userId: user1.id,
        })
        await dbV1.collections.posts.create({
          id: "post-2",
          title: "Second Post",
          content: "This is the second post",
          userId: user2.id,
        })

        // Verify V1 data
        const v1Users = await dbV1.collections.users.all()
        const v1Posts = await dbV1.collections.posts.all()

        assert(v1Users.length === 2, "Should have 2 users in V1")
        assert(v1Posts.length === 2, "Should have 2 posts in V1")

        // Step 2: Create V2 database with migration
        const schemaV2 = createV2Schema()
        let migrationRan = false

        let migrationCompletedResolver: (value: void) => void
        const migrationCompletedPromise = new Promise((resolve) => {
          migrationCompletedResolver = resolve
        })

        dbV1.dispose()
        await new Promise((resolve) => setTimeout(resolve, 100))

        const dbV2 = idb("migration-test-v1", {
          // Same DB name to trigger migration
          schema: schemaV2,
          version: 2,
          onUpgrade: async (ctx, event) => {
            if (event.oldVersion === 0) return // Skip initial setup

            if (event.oldVersion === 1) {
              migrationRan = true
              console.log("Running migration from v1 to v2...")

              // Migrate users: add createdAt field
              const oldUsers = (await ctx.collections.users.all()) as UserV1[]
              await ctx.collections.users.clear()

              const migratedUsers = oldUsers.map((user) => ({
                ...user,
                createdAt: Date.now(), // Add new field
              }))
              await ctx.collections.users.upsert(...migratedUsers)

              // Migrate posts: add status and tags fields
              const oldPosts = (await ctx.collections.posts.all()) as PostV1[]
              await ctx.collections.posts.clear()

              const migratedPosts = oldPosts.map((post) => ({
                ...post,
                status: "published" as const, // Default status
                tags: [], // Default empty tags
              }))
              await ctx.collections.posts.upsert(...migratedPosts)

              console.log("Migration from v1 to v2 completed")
              migrationCompletedResolver()
            }
          },
        })

        await migrationCompletedPromise

        // Step 3: Verify migration results
        assert(migrationRan, "Migration should have run")

        const v2Users = await dbV2.collections.users.all()
        const v2Posts = await dbV2.collections.posts.all()

        assert(v2Users.length === 2, "Should have 2 users after migration")
        assert(v2Posts.length === 2, "Should have 2 posts after migration")

        // Verify new fields were added
        v2Users.forEach((user) => {
          assert(typeof user.createdAt === "number", "User should have createdAt field")
          assert(user.createdAt > 0, "createdAt should be a valid timestamp")
        })

        v2Posts.forEach((post) => {
          assert(post.status === "published", "Post should have default status")
          assert(Array.isArray(post.tags), "Post should have tags array")
          assert(post.tags.length === 0, "Post should have empty tags by default")
        })

        // Verify original data was preserved
        const johnUser = v2Users.find((u) => u.name === "John Doe")
        const janeUser = v2Users.find((u) => u.name === "Jane Smith")

        assertExists(johnUser, "John user should exist after migration")
        assertExists(janeUser, "Jane user should exist after migration")
        assert(johnUser.email === "john@example.com", "John's email should be preserved")
        assert(janeUser.email === "jane@example.com", "Jane's email should be preserved")

        const firstPost = v2Posts.find((p) => p.title === "First Post")
        const secondPost = v2Posts.find((p) => p.title === "Second Post")

        assertExists(firstPost, "First post should exist after migration")
        assertExists(secondPost, "Second post should exist after migration")
        assert(
          firstPost.content === "This is the first post",
          "First post content should be preserved"
        )
        assert(
          secondPost.content === "This is the second post",
          "Second post content should be preserved"
        )

        dbV2.dispose()
        await new Promise((resolve) => setTimeout(resolve, 100))
      })

      test("should handle migration with data transformation", async () => {
        // Step 1: Create V1 database with data that needs transformation
        const schemaV1 = createV1Schema()
        const dbV1 = idb("migration-test-complex", {
          schema: schemaV1,
          version: 1,
        })

        // Create posts with different title patterns
        await dbV1.collections.users.create({
          name: "Author",
          email: "author@example.com",
        })

        await Promise.all([
          dbV1.collections.posts.create({
            id: "draft-post",
            title: "[DRAFT] Upcoming Feature",
            content: "This is a draft post about new #features and #improvements",
            userId: 1,
          }),
          dbV1.collections.posts.create({
            id: "published-post",
            title: "Released Update",
            content: "We've released a new update with #performance gains",
            userId: 1,
          }),
        ])

        // Step 2: Create V2 with intelligent migration
        const schemaV2 = createV2Schema()
        let migrationCompleted = false

        let migrationCompletedResolver: (value: void) => void
        const migrationCompletedPromise = new Promise((resolve) => {
          migrationCompletedResolver = resolve
        })

        dbV1.dispose()
        await new Promise((resolve) => setTimeout(resolve, 100))

        const dbV2 = idb("migration-test-complex", {
          schema: schemaV2,
          version: 2,
          onUpgrade: async (ctx, event) => {
            if (event.oldVersion === 0) return

            if (event.oldVersion === 1) {
              // Migrate users
              const oldUsers = (await ctx.collections.users.all()) as UserV1[]
              await ctx.collections.users.clear()

              const migratedUsers = oldUsers.map((user) => ({
                ...user,
                createdAt: Date.now(),
              }))
              await ctx.collections.users.upsert(...migratedUsers)

              // Migrate posts with intelligent transformation
              const oldPosts = (await ctx.collections.posts.all()) as PostV1[]
              await ctx.collections.posts.clear()

              const migratedPosts = oldPosts.map((post) => {
                // Detect status from title
                const isDraft = post.title.toLowerCase().includes("[draft]")

                // Extract hashtags from content
                const hashtagRegex = /#(\w+)/g
                const tags: string[] = []
                let match
                while ((match = hashtagRegex.exec(post.content)) !== null) {
                  tags.push(match[1])
                }

                return {
                  ...post,
                  title: post.title.replace(/^\[DRAFT\]\s*/i, ""), // Clean title
                  status: isDraft ? ("draft" as const) : ("published" as const),
                  tags,
                }
              })

              await ctx.collections.posts.upsert(...migratedPosts)
              migrationCompletedResolver()
              migrationCompleted = true
            }
          },
        })

        await migrationCompletedPromise

        // Step 3: Verify transformation results
        assert(migrationCompleted, "Migration should have completed")

        const v2Posts = await dbV2.collections.posts.all()
        assert(v2Posts.length === 2, "Should have 2 posts after migration")

        const draftPost = v2Posts.find((p) => p.id === "draft-post")
        const publishedPost = v2Posts.find((p) => p.id === "published-post")

        assertExists(draftPost, "Draft post should exist")
        assertExists(publishedPost, "Published post should exist")

        assert(draftPost.status === "draft", "Draft post should have draft status")
        assert(draftPost.title === "Upcoming Feature", "Draft post title should be cleaned")
        assert(draftPost.tags.includes("features"), "Draft post should have 'features' tag")
        assert(draftPost.tags.includes("improvements"), "Draft post should have 'improvements' tag")

        assert(publishedPost.status === "published", "Published post should have published status")
        assert(
          publishedPost.tags.includes("performance"),
          "Published post should have 'performance' tag"
        )

        dbV2.dispose()
        await new Promise((resolve) => setTimeout(resolve, 100))
      })
    },
  })
}
