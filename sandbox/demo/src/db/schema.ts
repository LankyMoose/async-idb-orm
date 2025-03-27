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
  .withKeyPath("id")
  .withIndexes([
    { keyPath: "age", name: "idx_age" },
    { keyPath: ["name", "id"], name: "idx_name_id" },
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
  .withKeyPath("id")
  .withForeignKeys([{ field: "userId", collection: users, onDelete: "cascade" }])
  .withTransformers({
    create: (dto) => ({ ...dto, id: crypto.randomUUID(), createdAt: Date.now() }),
  })

export const postComments = Collection.create<PostComment, PostCommentDTO>()
  .withKeyPath("id")
  .withForeignKeys([
    { field: "postId", collection: posts, onDelete: "cascade" },
    { field: "userId", collection: users, onDelete: "cascade" },
  ])
  .withTransformers({
    create: (dto) => ({
      ...dto,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    }),
  })

export const todos = Collection.create<Todo, TodoDTO>()
  .withKeyPath("id")
  .withForeignKeys([{ field: "userId", collection: users, onDelete: "restrict" }])
  .withTransformers({
    create: (dto) => ({
      ...dto,
      id: crypto.randomUUID(),
      completed: false,
      createdAt: Date.now(),
    }),
  })
