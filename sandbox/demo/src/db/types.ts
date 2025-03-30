export class TimeStamp {
  date: Date
  constructor(initialValue?: string) {
    this.date = initialValue ? new Date(initialValue) : new Date()
  }

  static toJSON(ts: TimeStamp) {
    return ts.date.toISOString()
  }
}

export class SuperID {
  #id: string
  constructor(id: string) {
    this.#id = id
  }
  toJSON() {
    return this.#id
  }
  static fromJSON(json: string) {
    return new SuperID(json)
  }
}

export type User = {
  id: string
  name: string
  age: number
  createdAt: TimeStamp
  updatedAt?: TimeStamp
}
export type UserDTO = {
  name?: string
  age: number
}

export type Post = {
  id: string
  content: string
  userId: SuperID
  createdAt: number
}
export type PostDTO = {
  content: string
  userId: string
}

export type PostComment = {
  id: string
  content: string
  postId: SuperID
  userId: SuperID
  createdAt: number
}

export type PostCommentDTO = {
  content: string
  postId: string
  userId: string
}

export type Todo = {
  id: string
  content: string
  completed: boolean
  userId: SuperID
  createdAt: number
}

export type TodoDTO = {
  content: string
  userId: string
}
