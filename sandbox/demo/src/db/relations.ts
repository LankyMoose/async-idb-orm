import { Relations } from "async-idb-orm"
import { users, posts, postComments, todos } from "./schema"

// User-Post relations
export const userPostRelations = Relations.create(users, posts).as({
  userPosts: (userFields, postFields) => ({
    type: "one-to-many",
    from: userFields.id,
    to: postFields.userId,
  }),
})

// Post-User relations (reverse)
export const postAuthorRelation = Relations.create(posts, users).as({
  author: (postFields, userFields) => ({
    type: "one-to-one",
    from: postFields.userId,
    to: userFields.id,
  }),
})

// Post-Comment relations
export const postCommentRelations = Relations.create(posts, postComments).as({
  postComments: (postFields, commentFields) => ({
    type: "one-to-many",
    from: postFields.id,
    to: commentFields.postId,
  }),
})

// Comment-Post relations (reverse)
export const commentPostRelation = Relations.create(postComments, posts).as({
  post: (commentFields, postFields) => ({
    type: "one-to-one",
    from: commentFields.postId,
    to: postFields.id,
  }),
})

// User-Comment relations
export const userCommentRelations = Relations.create(users, postComments).as({
  userComments: (userFields, commentFields) => ({
    type: "one-to-many",
    from: userFields.id,
    to: commentFields.userId,
  }),
})

// Comment-User relations (reverse)
export const commentAuthorRelation = Relations.create(postComments, users).as({
  author: (commentFields, userFields) => ({
    type: "one-to-one",
    from: commentFields.userId,
    to: userFields.id,
  }),
})

// User-Todo relations
export const userTodoRelations = Relations.create(users, todos).as({
  userTodos: (userFields, todoFields) => ({
    type: "one-to-many",
    from: userFields.id,
    to: todoFields.userId,
  }),
})

// Todo-User relations (reverse)
export const todoAuthorRelation = Relations.create(todos, users).as({
  author: (todoFields, userFields) => ({
    type: "one-to-one",
    from: todoFields.userId,
    to: userFields.id,
  }),
})
