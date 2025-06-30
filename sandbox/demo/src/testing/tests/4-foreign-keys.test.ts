import { assert, assertExists, assertThrows } from "$/testing/assert"
import { db } from "$/db"
import { TestRunner } from "../testRunner"
import { clearAllCollections } from "../utils"

export default (testRunner: TestRunner) => {
  testRunner.suite("Foreign Keys", {
    onAfterEach: async () => {
      await clearAllCollections()
    },
    tests: (test) => {
      test("should validate upstream constraints on create", async () => {
        // Try to create a post with non-existent user
        await assertThrows(
          async () => {
            await db.collections.posts.create({ content: "Hello World", userId: 99999 })
          },
          "Should throw for non-existent user reference",
          "Foreign key constraint violation"
        )

        // Try to create a note with non-existent user
        await assertThrows(
          async () => {
            await db.collections.notes.create({ content: "My note", userId: 99999 })
          },
          "Should throw for non-existent user reference",
          "Foreign key constraint violation"
        )

        // Try to create a todo with non-existent user
        await assertThrows(
          async () => {
            await db.collections.todos.create({ content: "My todo", userId: 99999 })
          },
          "Should throw for non-existent user reference",
          "Foreign key constraint violation"
        )
      })

      test("should validate upstream constraints on update", async () => {
        const user = await db.collections.users.create({ name: "John Doe", age: 30 })
        const post = await db.collections.posts.create({
          content: "Hello World",
          userId: user.id,
        })

        // Try to update post with non-existent user
        await assertThrows(
          async () => {
            await db.collections.posts.update({ ...post, userId: 99999 })
          },
          "Should throw for non-existent user reference on update",
          "Foreign key constraint violation"
        )
      })

      test("should allow null values for set null constraint", async () => {
        // Notes collection has "set null" constraint, so null userId should be allowed
        const note = await db.collections.notes.create({ content: "My note", userId: null })
        assert(note.userId === null, "Should allow null userId for set null constraint")
        assert(note.content === "My note", "Should create note with correct content")
      })

      test("should handle cascade delete correctly", async () => {
        const user = await db.collections.users.create({ name: "John Doe", age: 30 })

        // Create posts that reference the user
        await db.collections.posts.create({ content: "Post 1", userId: user.id })
        await db.collections.posts.create({ content: "Post 2", userId: user.id })

        // Verify posts exist
        const postsBeforeDelete = await db.collections.posts.all()
        assert(postsBeforeDelete.length === 2, "Should have 2 posts before delete")

        // Delete the user - should cascade to posts
        await db.collections.users.delete(user.id)

        // Verify posts are deleted
        const postsAfterDelete = await db.collections.posts.all()
        assert(postsAfterDelete.length === 0, "Should have 0 posts after cascade delete")

        // Verify user is deleted
        const userAfterDelete = await db.collections.users.find(user.id)
        assert(userAfterDelete === null, "User should be deleted")
      })

      test("should handle nested cascade delete correctly", async () => {
        const user = await db.collections.users.create({ name: "John Doe", age: 30 })
        const post = await db.collections.posts.create({
          content: "Hello World",
          userId: user.id,
        })

        // Create comments that reference both user and post
        await db.collections.postComments.create({
          content: "Great post!",
          postId: post.id,
          userId: user.id,
        })
        await db.collections.postComments.create({
          content: "I agree!",
          postId: post.id,
          userId: user.id,
        })

        // Verify comments exist
        const commentsBeforeDelete = await db.collections.postComments.all()
        assert(commentsBeforeDelete.length === 2, "Should have 2 comments before delete")

        // Delete the user - should cascade to posts and then to comments
        await db.collections.users.delete(user.id)

        // Verify everything is deleted
        const commentsAfterDelete = await db.collections.postComments.all()
        const postsAfterDelete = await db.collections.posts.all()
        const usersAfterDelete = await db.collections.users.all()

        assert(commentsAfterDelete.length === 0, "Should have 0 comments after cascade delete")
        assert(postsAfterDelete.length === 0, "Should have 0 posts after cascade delete")
        assert(usersAfterDelete.length === 0, "Should have 0 users after delete")
      })

      test("should handle restrict delete correctly", async () => {
        const user = await db.collections.users.create({ name: "John Doe", age: 30 })

        // Create a todo that references the user
        const todo = await db.collections.todos.create({ content: "My todo", userId: user.id })

        // Try to delete the user - should be restricted
        await assertThrows(
          async () => {
            await db.collections.users.delete(user.id)
          },
          "Should throw when trying to delete user with referencing todos",
          "Failed to delete record because it is referenced"
        )

        // Verify user and todo still exist
        const userAfterFailedDelete = await db.collections.users.find(user.id)
        const todoAfterFailedDelete = await db.collections.todos.find(todo.id)

        assert(userAfterFailedDelete !== null, "User should still exist after restricted delete")
        assert(todoAfterFailedDelete !== null, "Todo should still exist after restricted delete")

        // Delete the todo first, then user should be deletable
        await db.collections.todos.delete(todo.id)
        await db.collections.users.delete(user.id)

        // Verify both are deleted
        const userAfterCleanDelete = await db.collections.users.find(user.id)
        const todoAfterCleanDelete = await db.collections.todos.find(todo.id)

        assert(
          userAfterCleanDelete === null,
          "User should be deleted after removing referencing record"
        )
        assert(todoAfterCleanDelete === null, "Todo should be deleted")
      })

      test("should handle set null delete correctly", async () => {
        const user = await db.collections.users.create({ name: "John Doe", age: 30 })

        // Create notes that reference the user
        const note1 = await db.collections.notes.create({ content: "Note 1", userId: user.id })
        const note2 = await db.collections.notes.create({ content: "Note 2", userId: user.id })

        // Verify notes have userId
        assert(note1.userId === user.id, "Note 1 should reference user")
        assert(note2.userId === user.id, "Note 2 should reference user")

        // Delete the user - should set userId to null in notes
        await db.collections.users.delete(user.id)

        // Verify user is deleted
        const userAfterDelete = await db.collections.users.find(user.id)
        assert(userAfterDelete === null, "User should be deleted")

        // Verify notes still exist but userId is null
        const notesAfterDelete = await db.collections.notes.all()
        assert(notesAfterDelete.length === 2, "Should still have 2 notes after set null delete")

        const updatedNote1 = await db.collections.notes.find(note1.id)
        const updatedNote2 = await db.collections.notes.find(note2.id)

        assertExists(updatedNote1, "Note 1 should still exist")
        assertExists(updatedNote2, "Note 2 should still exist")
        assert(updatedNote1.userId === null, "Note 1 userId should be set to null")
        assert(updatedNote2.userId === null, "Note 2 userId should be set to null")
        assert(updatedNote1.content === "Note 1", "Note 1 content should be preserved")
        assert(updatedNote2.content === "Note 2", "Note 2 content should be preserved")
      })

      test("should handle no action delete correctly", async () => {
        const user = await db.collections.users.create({ name: "John Doe", age: 30 })

        // Create noActionNotes that reference the user
        const note1 = await db.collections.noActionNotes.create({
          content: "Note 1",
          userId: user.id,
        })
        const note2 = await db.collections.noActionNotes.create({
          content: "Note 2",
          userId: user.id,
        })

        // Delete the user - no action should be taken on notes initially
        // This should succeed initially but fail at commit if constraints would be violated

        await assertThrows(
          async () => {
            await db.collections.users.delete(user.id)
          },
          "Should throw when no action delete would violate constraints",
          "Foreign key constraint violation"
        )

        // Verify user and notes still exist
        const userAfterFailedDelete = await db.collections.users.find(user.id)
        const notesAfterFailedDelete = await db.collections.noActionNotes.all()

        assert(
          userAfterFailedDelete !== null,
          "User should still exist after failed no action delete"
        )
        assert(
          notesAfterFailedDelete.length === 2,
          "Notes should still exist after failed no action delete"
        )

        // Delete the notes first, then user should be deletable
        await db.collections.noActionNotes.delete(note1.id)
        await db.collections.noActionNotes.delete(note2.id)
        await db.collections.users.delete(user.id)

        // Verify all are deleted
        const userAfterCleanDelete = await db.collections.users.find(user.id)
        const notesAfterCleanDelete = await db.collections.noActionNotes.all()

        assert(
          userAfterCleanDelete === null,
          "User should be deleted after removing referencing records"
        )
        assert(notesAfterCleanDelete.length === 0, "Notes should be deleted")

        // Verify that correcting 'no update' constraint prevents transaction failure
        const user2 = await db.collections.users.create({ name: "John Doe", age: 30 })
        const user3 = await db.collections.users.create({ name: "John Doe", age: 30 })
        const newNote = await db.collections.noActionNotes.create({
          content: "Note 1",
          userId: user2.id,
        })

        await db.transaction(async (ctx) => {
          await ctx.users.delete(user2.id)
          await ctx.noActionNotes.update({ ...newNote, userId: user3.id })
        })
      })

      test("should handle multiple foreign key constraints on same record", async () => {
        const user = await db.collections.users.create({ name: "John Doe", age: 30 })
        const post = await db.collections.posts.create({
          content: "Hello World",
          userId: user.id,
        })

        // Create comment with multiple foreign keys
        const comment = await db.collections.postComments.create({
          content: "Great post!",
          postId: post.id,
          userId: user.id,
        })

        // Try to create comment with invalid user
        await assertThrows(
          async () => {
            await db.collections.postComments.create({
              content: "Invalid comment",
              postId: post.id,
              userId: 99999,
            })
          },
          "Should throw for invalid userId in multiple FK scenario",
          "Foreign key constraint violation"
        )

        // Try to create comment with invalid post
        await assertThrows(
          async () => {
            await db.collections.postComments.create({
              content: "Invalid comment",
              postId: "invalid-post-id",
              userId: user.id,
            })
          },
          "Should throw for invalid postId in multiple FK scenario",
          "Foreign key constraint violation"
        )

        // Delete post should cascade to comment
        await db.collections.posts.delete(post.id)

        const commentAfterPostDelete = await db.collections.postComments.find(comment.id)
        assert(commentAfterPostDelete === null, "Comment should be deleted when post is deleted")

        // User should still exist
        const userAfterPostDelete = await db.collections.users.find(user.id)
        assert(userAfterPostDelete !== null, "User should still exist after post delete")
      })

      test("should handle foreign key constraints in transactions", async () => {
        // Test that FK constraints work properly within transactions
        let transactionError: Error | null = null
        try {
          await db.transaction(async (ctx) => {
            const user = await ctx.users.create({ name: "John Doe", age: 30 })

            // This should work within the transaction
            await ctx.posts.create({
              content: "Hello World",
              userId: user.id,
            })

            // This should fail within the transaction
            await ctx.posts.create({ content: "Invalid post", userId: 99999 })
          })
        } catch (error) {
          transactionError = error as Error
        }

        assertExists(transactionError, "Transaction should fail due to FK constraint violation")
        assert(
          transactionError.message.includes("Foreign key constraint violation"),
          "Error should mention FK violation"
        )

        // Verify no records were created due to transaction rollback
        const users = await db.collections.users.all()
        const posts = await db.collections.posts.all()

        assert(users.length === 0, "No users should exist after failed transaction")
        assert(posts.length === 0, "No posts should exist after failed transaction")
      })

      test("should handle batch operations with foreign key constraints", async () => {
        const user1 = await db.collections.users.create({ name: "User 1", age: 30 })
        const user2 = await db.collections.users.create({ name: "User 2", age: 25 })

        // Batch upsert with valid foreign keys
        const posts = await db.collections.posts.upsert(
          { id: "post-1", content: "Post 1", userId: user1.id },
          { id: "post-2", content: "Post 2", userId: user2.id },
          { id: "post-3", content: "Post 3", userId: user1.id }
        )

        assert(posts.length === 3, "Should create 3 posts with valid FKs")

        // Try batch upsert with invalid foreign key
        await assertThrows(
          async () => {
            await db.collections.posts.upsert(
              { id: "post-4", content: "Post 4", userId: user1.id },
              { id: "post-5", content: "Post 5", userId: 99999 }, // Invalid FK
              { id: "post-6", content: "Post 6", userId: user2.id }
            )
          },
          "Should throw for batch upsert with invalid FK",
          "Foreign key constraint violation"
        )

        // Verify original posts still exist (transaction should rollback)
        const allPosts = await db.collections.posts.all()
        assert(
          allPosts.length === 3,
          "Should still have original 3 posts after failed batch operation"
        )
      })

      test("should handle deleteMany with foreign key constraints", async () => {
        const user1 = await db.collections.users.create({ name: "User 1", age: 30 })
        const user2 = await db.collections.users.create({ name: "User 2", age: 25 })

        // Create posts and todos
        await db.collections.posts.create({ content: "Post 1", userId: user1.id })
        await db.collections.posts.create({ content: "Post 2", userId: user2.id })
        await db.collections.todos.create({ content: "Todo 1", userId: user1.id })
        await db.collections.todos.create({ content: "Todo 2", userId: user2.id })

        // Try to delete users with restrict constraint (should fail)
        await assertThrows(
          async () => {
            await db.collections.users.deleteMany((user) => user.age >= 25)
          },
          "Should throw when deleting users with restrict constraint",
          "Failed to delete record because it is referenced"
        )

        // Delete todos first to remove restrict constraint
        await db.collections.todos.deleteMany(() => true)

        // Now delete users should cascade to posts
        const deletedUsers = await db.collections.users.deleteMany((user) => user.age >= 25)
        assert(deletedUsers.length === 2, "Should delete 2 users")

        // Verify posts are also deleted (cascade)
        const remainingPosts = await db.collections.posts.all()
        assert(remainingPosts.length === 0, "Should have 0 posts after cascade delete")
      })

      test("should handle edge cases with null values", async () => {
        // Create notes with null userId (allowed for set null constraint)
        const note1 = await db.collections.notes.create({ content: "Note 1", userId: null })
        const note2 = await db.collections.notes.create({ content: "Note 2", userId: null })

        assert(note1.userId === null, "Note 1 should have null userId")
        assert(note2.userId === null, "Note 2 should have null userId")

        // Create user and update note to reference it
        const user = await db.collections.users.create({ name: "John Doe", age: 30 })
        const updatedNote = await db.collections.notes.update({ ...note1, userId: user.id })

        assert(updatedNote.userId === user.id, "Updated note should reference user")

        // Delete user should set userId back to null
        await db.collections.users.delete(user.id)

        const noteAfterUserDelete = await db.collections.notes.find(note1.id)
        assertExists(noteAfterUserDelete, "Note should still exist")
        assert(noteAfterUserDelete.userId === null, "Note userId should be null after user delete")
      })

      test("should validate complex foreign key scenarios", async () => {
        const user = await db.collections.users.create({ name: "John Doe", age: 30 })
        const post = await db.collections.posts.create({
          content: "Hello World",
          userId: user.id,
        })

        // Create multiple types of records referencing the user
        const note = await db.collections.notes.create({ content: "My note", userId: user.id })
        const todo = await db.collections.todos.create({ content: "My todo", userId: user.id })
        const comment = await db.collections.postComments.create({
          content: "Great post!",
          postId: post.id,
          userId: user.id,
        })

        // Try to delete user - should fail due to restrict constraint from todo
        await assertThrows(
          async () => {
            await db.collections.users.delete(user.id)
          },
          "Should fail due to restrict constraint from todo",
          "Failed to delete record because it is referenced"
        )

        // Delete todo to remove restrict constraint
        await db.collections.todos.delete(todo.id)

        // Now delete user should:
        // - Cascade delete post and comment
        // - Set note userId to null
        await db.collections.users.delete(user.id)

        // Verify results
        const userAfterDelete = await db.collections.users.find(user.id)
        const postAfterDelete = await db.collections.posts.find(post.id)
        const commentAfterDelete = await db.collections.postComments.find(comment.id)
        const noteAfterDelete = await db.collections.notes.find(note.id)
        const todoAfterDelete = await db.collections.todos.find(todo.id)

        assert(userAfterDelete === null, "User should be deleted")
        assert(postAfterDelete === null, "Post should be cascade deleted")
        assert(commentAfterDelete === null, "Comment should be cascade deleted")
        assertExists(noteAfterDelete, "Note should still exist")
        assert(noteAfterDelete.userId === null, "Note userId should be set to null")
        assert(todoAfterDelete === null, "Todo should be deleted (manually deleted earlier)")
      })
    },
  })
}
