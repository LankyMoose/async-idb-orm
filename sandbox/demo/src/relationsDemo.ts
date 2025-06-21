import { db, Post, PostComment, Todo } from "./db"

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

export async function setupTestData() {
  console.log("Setting up test data...")

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

  console.log("Created users:", { user1, user2 })

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

  console.log("Created posts:", posts)

  // Create test comments
  const comments: PostComment[] = []
  for (let i = 0; i < 3; i++) {
    const comment = await db.collections.postComments.create({
      content: `Comment ${i + 1} on post 1`,
      postId: posts[0].id,
      userId: user2.id, // Bob commenting on Alice's post
    })
    comments.push(comment)
  }

  console.log("Created comments:", comments)

  // Create test todos
  const todos: Todo[] = []
  for (let i = 0; i < 4; i++) {
    const todo = await db.collections.todos.create({
      content: `Todo ${i + 1} for Alice`,
      userId: user1.id,
    })
    todos.push(todo)
  }

  console.log("Created todos:", todos)
  console.log("Test data setup complete!")

  return { users: [user1, user2], posts, comments, todos }
}

export async function demonstrateBasicRelations() {
  console.log("\n=== 1. Basic Relations Demo ===")
  const alice = await db.collections.users.find((u) => u.name === "Alice Johnson")

  // Load user with all their posts
  const userWithPosts = await db.collections.users.find(alice.id, {
    with: {
      userPosts: true,
    },
  })
  console.log("User with posts:", userWithPosts)

  // Load post with its author
  const posts = await db.collections.posts.all()
  if (posts.length > 0) {
    const postWithAuthor = await db.collections.posts.find(posts[0].id, {
      with: {
        author: true,
      },
    })
    console.log("Post with author:", postWithAuthor)
  }
}

export async function demonstrateFilteredRelations() {
  console.log("\n=== 2. Filtered Relations Demo ===")
  const alice = await db.collections.users.find((u) => u.name === "Alice Johnson")

  // Load user with only "important" posts
  const userWithImportantPosts = await db.collections.users.find(alice.id, {
    with: {
      userPosts: {
        where: (post) => post.content.includes("Important"),
      },
    },
  })
  console.log("User with important posts:", userWithImportantPosts)

  // Load user with recent posts (all posts in this demo are recent)
  const userWithRecentPosts = await db.collections.users.find(alice.id, {
    with: {
      userPosts: {
        where: (post) => post.createdAt > Date.now() - 24 * 60 * 60 * 1000,
      },
    },
  })
  console.log("User with recent posts:", userWithRecentPosts)
}

export async function demonstrateLimitedRelations() {
  console.log("\n=== 3. Limited Relations Demo ===")
  const alice = await db.collections.users.find((u) => u.name === "Alice Johnson")

  // Load user with only first 2 posts
  const userWithLimitedPosts = await db.collections.users.find(alice.id, {
    with: {
      userPosts: {
        limit: 2,
      },
    },
  })
  console.log("User with limited posts (2):", userWithLimitedPosts)

  // Load user with only first 3 todos
  const userWithLimitedTodos = await db.collections.users.find(alice.id, {
    with: {
      userTodos: {
        limit: 3,
      },
    },
  })
  console.log("User with limited todos (3):", userWithLimitedTodos)
}

export async function demonstrateComplexRelations() {
  console.log("\n=== 4. Complex Relations Demo ===")

  // Combine filtering and limiting
  const alice = await db.collections.users.find((u) => u.name === "Alice Johnson")
  const userWithFilteredLimitedPosts = await db.collections.users.find(alice.id, {
    with: {
      userPosts: {
        where: (post) => post.content.includes("Post"),
        limit: 3,
      },
    },
  })
  console.log("User with filtered and limited posts:", userWithFilteredLimitedPosts)

  // Load multiple relation types
  const userWithMultipleRelations = await db.collections.users.find(alice.id, {
    with: {
      userPosts: { limit: 2 },
      userTodos: { limit: 2 },
      userComments: true,
    },
  })
  console.log("User with multiple relations:", userWithMultipleRelations)
}

export async function demonstrateReverseRelations() {
  console.log("\n=== 5. Reverse Relations Demo ===")

  // Load comment with its post and author
  const comments = await db.collections.postComments.all()
  if (comments.length > 0) {
    const commentWithRelations = await db.collections.postComments.find(comments[0].id, {
      with: {
        post: true,
        author: true,
      },
    })
    console.log("Comment with post and author:", commentWithRelations)
  }

  // Load post with its comments
  const posts = await db.collections.posts.all()
  if (posts.length > 0) {
    const postWithComments = await db.collections.posts.find(posts[0].id, {
      with: {
        postComments: true,
        author: true,
      },
    })
    console.log("Post with comments and author:", postWithComments)
  }
}

export async function runCompleteDemo() {
  console.log("🚀 Starting Complete Relations API Demo")

  try {
    await setupTestData()
    await demonstrateBasicRelations()
    await demonstrateFilteredRelations()
    await demonstrateLimitedRelations()
    await demonstrateComplexRelations()
    await demonstrateReverseRelations()

    console.log("\n✅ Relations API Demo completed successfully!")
  } catch (error) {
    console.error("❌ Demo failed:", error)
  }
}

// Export for use in main app
export { runCompleteDemo as default }
