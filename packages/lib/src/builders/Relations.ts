import { keyPassThroughProxy } from "../utils.js"
import type { AnyCollection, CollectionRecord } from "../types"

const RelationsBuilderSentinel = Symbol()

export type RelationType = "one-to-one" | "one-to-many"

export type RelationDefinition<From extends AnyCollection, To extends AnyCollection> = {
  type: RelationType
  from: keyof CollectionRecord<From> & string
  to: keyof CollectionRecord<To> & string
}

type RelationsConfig<From extends AnyCollection, To extends AnyCollection> = {
  [key: string]: (
    fromFields: {
      [key in keyof CollectionRecord<From> & string]: key
    },
    toFields: {
      [key in keyof CollectionRecord<To> & string]: key
    }
  ) => RelationDefinition<From, To>
}

export type RelationsDefinitionMap<From extends AnyCollection, To extends AnyCollection> = {
  [key: string]: RelationDefinition<From, To>
}

export class Relations<
  From extends AnyCollection,
  To extends AnyCollection,
  RelationsMap extends RelationsDefinitionMap<From, To> = never
> {
  relationsMap!: RelationsMap
  private constructor(key: symbol, public from: From, public to: To) {
    if (key !== RelationsBuilderSentinel)
      throw new Error("Cannot call RelationsBuilder directly - use Relations.create()")
  }

  /**
   * Creates a new Relations definition
   * @example
   * ```ts
   * import { Relations } from "async-idb-orm"
   * import { users, posts } from "./schema"
   *
   * export const userPostRelations = Relations.create(users, posts).as({
   *   userPosts: (userFields, postFields) => ({
   *     type: "one-to-many",
   *     from: userFields.id,
   *     to: postFields.userId,
   *   }),
   * })
   *
   * ```
   */
  static create<A extends AnyCollection, B extends AnyCollection>(from: A, to: B) {
    return new Relations<A, B>(RelationsBuilderSentinel, from, to)
  }

  /**
   * Creates a map of relations from one collection to another
   */
  as<const Config extends RelationsConfig<From, To>>(cfg: Config) {
    this.relationsMap = Object.entries(cfg).reduce((acc, [key, value]) => {
      acc[key] = value(keyPassThroughProxy, keyPassThroughProxy)
      return acc
    }, {} as any)
    return this as any as Relations<
      From,
      To,
      {
        [K in keyof Config]: ReturnType<Config[K]>
      }
    >
  }
}
