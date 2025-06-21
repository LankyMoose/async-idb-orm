import { Relations } from "async-idb-orm"
import { users, posts } from "./schema"

export const userPostRelations = Relations.create(users, posts).as({
  userPosts: (userFields, postFields) => ({
    type: "one-to-many",
    from: userFields.id,
    to: postFields.userId,
  }),
})

export const postAuthorRelation = Relations.create(posts, users).as({
  author: (postFields, userFields) => ({
    type: "one-to-one",
    from: postFields.userId,
    to: userFields.id,
  }),
})
