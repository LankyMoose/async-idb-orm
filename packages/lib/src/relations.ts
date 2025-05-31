import type { CollectionRecord } from "./types"
import type { Collection } from "./collection"

const RelationsBuilderSentinel = Symbol()

export type RelationType = "one-to-one" | "one-to-many"

type AnyCollection = Collection<any, any, any, any, any>

type FieldSelection<T> = {
  [K in keyof T]: K
}

export type RelationsDefinition<FromCol extends AnyCollection, ToCol extends AnyCollection> = {
  from: keyof CollectionRecord<FromCol> & string
  to: keyof CollectionRecord<ToCol> & string
  type: RelationType
}

export type RelationsConfig<FromCol extends AnyCollection, ToCol extends AnyCollection> = {
  [key: string]: (
    fromFields: FieldSelection<CollectionRecord<FromCol>>,
    toFields: FieldSelection<CollectionRecord<ToCol>>
  ) => RelationsDefinition<FromCol, ToCol>
}

export class Relations<
  FromCol extends AnyCollection,
  ToCol extends AnyCollection,
  Config extends RelationsConfig<FromCol, ToCol>
> {
  fromCollection: FromCol
  toCollection: ToCol
  config: Config
  private constructor(key: symbol) {
    if (key !== RelationsBuilderSentinel)
      throw new Error("Cannot call new Relations() directly - use Relations.create()")

    this.config = {} as Config
    this.fromCollection = {} as FromCol
    this.toCollection = {} as ToCol
  }

  static create<FromCol extends AnyCollection, ToCol extends AnyCollection>(
    fromCollection: FromCol,
    toCollection: ToCol
  ) {
    const relations = new Relations<FromCol, ToCol, {}>(RelationsBuilderSentinel)
    relations.fromCollection = fromCollection
    relations.toCollection = toCollection
    return relations
  }

  as<Config extends RelationsConfig<FromCol, ToCol>>(config: Config) {
    this.config = config as any
    return this as any as Relations<FromCol, ToCol, Config>
  }
}

// type X = FieldSelection<{ a: string; b: number }>

// export const userPostRelations = Relations.create(users, posts).as({
//   userPosts: (userFields, postFields) => ({
//     type: "one-to-many",
//     from: userFields.id,
//     to: postFields.userId,
//   }),
// })
