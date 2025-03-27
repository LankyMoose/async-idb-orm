import { db, User } from "$/db"
import { signal } from "kaioken"

export const selectedUser = signal<User | null>(null)
db.collections.users.addEventListener(
  "delete",
  (user) => user.id === selectedUser.value?.id && (selectedUser.value = null)
)
