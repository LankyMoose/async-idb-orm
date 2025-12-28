import { keyPassThroughProxy } from "../utils.js"
import type { AnyCollection, RelationsConfig, RelationsDefinitionMap } from "../types"

const RelationsBuilderSentinel = Symbol()

export class Relations<
  From extends AnyCollection,
  To extends AnyCollection,
  RelationsMap extends RelationsDefinitionMap<From, To> = RelationsDefinitionMap<From, To>
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
