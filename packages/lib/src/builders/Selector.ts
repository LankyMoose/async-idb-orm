import type {
  AsyncIDBInstance,
  CollectionSchema,
  ReadOnlyTransactionContext,
  RelationsSchema,
} from "../types"

const SelectorBuilderSentinel = Symbol()

export class Selector<T extends CollectionSchema, R extends RelationsSchema, Data = unknown> {
  selector!: (data: AsyncIDBInstance<T, R, any>) => Promise<Data>

  private constructor(key: symbol) {
    if (key !== SelectorBuilderSentinel)
      throw new Error("Cannot call SelectorBuilder directly - use Selector.create()")
  }

  /**
   * Creates a new Selector definition
   * @example
   * ```ts
   * import { Selector } from "async-idb-orm"
   * import * as schema from "./schema"
   * import * as relations from "./relations"
   *
   * const recentPostsWithAuthors = Selector.create<typeof schema, typeof relations>()
   *   .as((ctx) => {
   *     return ctx.posts.findMany((post) => isCreatedRecently(post), {
   *       with: { author: true },
   *     })
   *   })
   *
   * ```
   */
  static create<T extends CollectionSchema, R extends RelationsSchema = {}>(): Selector<T, R> {
    return new Selector<T, R>(SelectorBuilderSentinel)
  }

  /**
   * Sets the selector callback
   */
  as<Callback extends (ctx: ReadOnlyTransactionContext<T, R>) => Promise<unknown>>(
    callback: Callback
  ) {
    this.selector = callback as any
    return this as Selector<T, R, Awaited<ReturnType<Callback>>>
  }
}
