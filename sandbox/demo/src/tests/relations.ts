import { assert, assertThrows } from "../assert"
import { db, Post, Todo } from "../db"

/**
 * Comprehensive Relations API Demo
 * This file demonstrates all the enhanced features of the Relations API including:
 * - Basic relation loading
 * - Relation filtering with where clauses
 * - Relation limiting
 * - Combined filtering and limiting
 * - Reverse relations
 * - Multiple relation types (one-to-one, one-to-many)
 */

async function setupTestData() {
  // Clear existing data
  await db.collections.postComments.clear()
  await db.collections.posts.clear()
  await db.collections.todos.clear()
  await db.collections.users.clear()

  // Create test users
  const user1 = await db.collections.users.create({
    name: "Alice Johnson",
    age: 28,
  })

  const user2 = await db.collections.users.create({
    name: "Bob Smith",
    age: 32,
  })

  // Create test posts
  const posts: Post[] = []
  for (let i = 0; i < 5; i++) {
    const post = await db.collections.posts.create({
      content: `${i < 2 ? "Important: " : ""}Post ${i + 1} by Alice`,
      userId: user1.id,
    })
    posts.push(post)
  }

  const bobPost = await db.collections.posts.create({
    content: "Bob's important post",
    userId: user2.id,
  })
  posts.push(bobPost)

  // Create test comments
  for (let i = 0; i < 3; i++) {
    await db.collections.postComments.create({
      content: `Comment ${i + 1} on post 1`,
      postId: posts[0].id,
      userId: user2.id, // Bob commenting on Alice's post
    })
  }
  // add a comment on Bob's important post
  await db.collections.postComments.create({
    content: "Comment on Bob's important post",
    postId: bobPost.id,
    userId: user1.id, // Alice commenting on Bob's important post
  })

  // Create test todos
  const todos: Todo[] = []
  for (let i = 0; i < 4; i++) {
    const todo = await db.collections.todos.create({
      content: `Todo ${i + 1} for Alice`,
      userId: user1.id,
    })
    todos.push(todo)
  }
}

async function demonstrateBasicRelations() {
  const userWithPosts = await db.collections.users.find(() => true, {
    with: {
      userPosts: {
        where: (post) => post.content.includes("Important"),
        limit: 1,
        with: {
          postComments: true,
        },
      },
    },
  })

  assert(userWithPosts, "should find user with posts")
  assert(userWithPosts.userPosts.length === 1, "should find 1 important post")
  assert(
    userWithPosts.userPosts[0].postComments instanceof Array,
    "should find postComments as array"
  )

  await assertThrows(() => {
    db.collections.users.wrap(userWithPosts)
  }, "should not be able to upgrade relational record -> active record")

  const postsWithAuthors = await db.collections.posts.all({
    with: {
      author: true,
    },
  })
  assert(
    postsWithAuthors.every((post) => !!post.author),
    "should find all posts with authors"
  )
}

async function demonstrateLimitedRelations() {
  const userWithLimitedPosts = await db.collections.users.find((u) => u.name === "Alice Johnson", {
    with: {
      userPosts: {
        limit: 2,
      },
    },
  })
  assert(userWithLimitedPosts?.userPosts.length === 2, "should find 2 limited posts")

  // Load user with only first 3 todos
  const userWithLimitedTodos = await db.collections.users.find((u) => u.name === "Alice Johnson", {
    with: {
      userTodos: {
        limit: 3,
      },
    },
  })
  assert(userWithLimitedTodos?.userTodos.length === 3, "should find 3 limited todos")
}

async function demonstrateComplexRelations() {
  const userWithFilteredLimitedPosts = await db.collections.users.find(
    (u) => u.name === "Alice Johnson",
    {
      with: {
        userPosts: {
          where: (post) => post.content.includes("Post"),
          limit: 3,
        },
      },
    }
  )
  assert(
    userWithFilteredLimitedPosts?.userPosts.length === 3,
    "should find 3 filtered limited posts"
  )

  // Load multiple relation types
  const userWithMultipleRelations = await db.collections.users.find(
    (u) => u.name === "Alice Johnson",
    {
      with: {
        userPosts: { limit: 2 },
        userTodos: { limit: 2 },
        userComments: true,
      },
    }
  )
  assert(
    userWithMultipleRelations?.userPosts.length === 2 &&
      userWithMultipleRelations?.userTodos.length === 2 &&
      userWithMultipleRelations?.userComments.length > 0,
    "should find 2 posts, 2 todos and at least 1 comment"
  )
}

export async function runRelationsTest() {
  console.log("🚀 Starting Complete Relations API Demo")

  try {
    await setupTestData()
    await demonstrateBasicRelations()
    await demonstrateLimitedRelations()
    await demonstrateComplexRelations()

    // cleanup - have to delete todos before users because of foreign key constraint
    await db.collections.todos.clear()
    const users = await db.collections.users.all()
    for (const user of users) {
      await db.collections.users.delete(user.id)
    }
    console.log("\n✅ Relations API Demo completed successfully!")
  } catch (error) {
    console.error("❌ Demo failed:", error)
  }
}

// Export for use in main app
export { runRelationsTest as default }
