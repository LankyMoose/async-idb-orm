import type { AnyCollection, CollectionRecord } from "./types"
import { keyPassThroughProxy } from "./utils.js"

const RelationsBuilderSentinel = Symbol()

type RelationType = "one-to-one" | "one-to-many"

type RelationDefinition<From extends AnyCollection, To extends AnyCollection> = {
  type: RelationType
  from: keyof CollectionRecord<From>
  to: keyof CollectionRecord<To>
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

type RelationMap<From extends AnyCollection, To extends AnyCollection> = {
  [key: string]: RelationDefinition<From, To>
}

export class Relations<
  From extends AnyCollection,
  To extends AnyCollection,
  RelationsMap extends RelationMap<From, To> = never
> {
  relationsMap!: RelationsMap
  private constructor(key: symbol, public from: From, public to: To) {
    if (key !== RelationsBuilderSentinel)
      throw new Error("Cannot call RelationsBuilder directly - use Relations.create()")
  }

  static create<A extends AnyCollection, B extends AnyCollection>(from: A, to: B) {
    return new Relations<A, B>(RelationsBuilderSentinel, from, to)
  }

  as<const Config extends RelationsConfig<From, To>>(cfg: Config) {
    this.relationsMap = Object.entries(cfg).reduce((acc, [key, value]) => ({
      ...acc,
      [key]: value(keyPassThroughProxy, keyPassThroughProxy),
    })) as any
    return this as any as Relations<
      From,
      To,
      {
        [K in keyof Config]: ReturnType<Config[K]>
      }
    >
  }
}
