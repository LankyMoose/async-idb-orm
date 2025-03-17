export type Pet = {
  id: string
  name: string
  age: number
  species?: string
}
export type User = {
  id: string
  name: string
  age: number
  pets: Pet[]
  alive?: boolean
  createdAt: number
}
export type UserDTO = {
  name?: string
  age: number
  pets: Pet[]
  alive?: boolean
}

export type Todo = {
  id: string
  text: string
  done: boolean
}
export type TodoDTO = {
  text: string
}
