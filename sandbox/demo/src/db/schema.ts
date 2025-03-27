import { Collection } from "async-idb-orm"
import { Todo, TodoDTO, User, UserDTO } from "./types.ts"

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
    //update: (data) => ({ ...data, updatedAt: Date.now() }),
  })

export const todos = Collection.create<Todo, TodoDTO>()
  .withKeyPath(["id"])
  .withIndexes([{ keyPath: ["text"], name: "idx_text" }])
  .withTransformers({
    create: (dto) => ({
      ...dto,
      id: crypto.randomUUID(),
      done: false,
    }),
    //update: (data) => ({ ...data, updatedAt: Date.now() }),
  })
