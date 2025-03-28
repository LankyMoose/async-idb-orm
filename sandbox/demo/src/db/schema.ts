import { Collection } from "async-idb-orm"
import {
  Post,
  PostComment,
  PostCommentDTO,
  PostDTO,
  User,
  UserDTO,
  Todo,
  TodoDTO,
  TimeStamp,
} from "./types.ts"

export const users = Collection.create<User, UserDTO>()
  .withIndexes([
    { key: "age", name: "idx_age" },
    { key: ["name", "id"], name: "idx_name_id" },
  ])
  .withTransformers({
    create: (dto) => ({
      ...dto,
      id: crypto.randomUUID(),
      name: dto.name ?? "John Doe",
      createdAt: new TimeStamp(),
      alive: "alive" in dto && typeof dto.alive === "boolean" ? dto.alive : true,
    }),
    update: (data) => ({ ...data, updatedAt: new TimeStamp() }),
  })
  .withSerialization({
    write: (user) => ({
      ...user,
      createdAt: TimeStamp.toJSON(user.createdAt),
      updatedAt: user.updatedAt ? TimeStamp.toJSON(user.updatedAt) : undefined,
    }),
    read: (user) => ({
      ...user,
      createdAt: new TimeStamp(user.createdAt),
      updatedAt: user.updatedAt ? new TimeStamp(user.updatedAt) : undefined,
    }),
  })

export const posts = Collection.create<Post, PostDTO>()
  .withForeignKeys((posts) => [{ ref: posts.userId, collection: users, onDelete: "cascade" }])
  .withTransformers({
    create: (dto) => ({ ...dto, id: crypto.randomUUID(), createdAt: Date.now() }),
  })

export const postComments = Collection.create<PostComment, PostCommentDTO>()
  .withForeignKeys((comments) => [
    { ref: comments.userId, collection: users, onDelete: "cascade" },
    { ref: comments.postId, collection: posts, onDelete: "cascade" },
  ])
  .withTransformers({
    create: (dto) => ({
      ...dto,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    }),
  })

export const todos = Collection.create<Todo, TodoDTO>()
  .withForeignKeys((todos) => [{ ref: todos.userId, collection: users, onDelete: "restrict" }])
  .withTransformers({
    create: (dto) => ({
      ...dto,
      id: crypto.randomUUID(),
      completed: false,
      createdAt: Date.now(),
    }),
  })
