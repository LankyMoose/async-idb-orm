export class TimeStamp {
  date: Date
  constructor(initialValue?: string) {
    this.date = initialValue ? new Date(initialValue) : new Date()
  }

  static toJSON(ts: TimeStamp) {
    return ts.date.toISOString()
  }
}

export type User = {
  id: number
  name: string
  age: number
  createdAt: TimeStamp
  updatedAt?: TimeStamp
}
export type UserDTO = {
  id?: number
  name?: string
  age: number
}

export type Note = {
  id: string
  content: string
  userId: number | null
}

export type NoteDTO = {
  content: string
  userId: number
}

export type Post = {
  id: string
  content: string
  userId: number
  createdAt: number
}
export type PostDTO = {
  content: string
  userId: number
}

export type PostComment = {
  id: string
  content: string
  postId: string
  userId: number
  createdAt: number
}

export type PostCommentDTO = {
  content: string
  postId: string
  userId: number
}

export type Todo = {
  id: string
  content: string
  completed: boolean
  userId: number
  createdAt: number
}

export type TodoDTO = {
  content: string
  userId: number
}
