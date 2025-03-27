export type User = {
  id: string
  name: string
  age: number
  alive?: boolean
  createdAt: number
}
export type UserDTO = {
  name?: string
  age: number
  alive?: boolean
}

export type Todo = {
  id: string
  text: string
  done: boolean
  userId: string
}
export type TodoDTO = {
  text: string
  userId: string
}
