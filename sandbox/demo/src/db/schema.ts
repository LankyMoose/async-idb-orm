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
      createdAt: Date.now(),
      alive: "alive" in dto && typeof dto.alive === "boolean" ? dto.alive : true,
    }),
    update: (data) => ({ ...data, updatedAt: Date.now() }),
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
