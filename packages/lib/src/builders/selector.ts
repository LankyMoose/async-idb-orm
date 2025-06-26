import { AsyncIDBInstance, CollectionSchema, RelationsSchema } from "../types"

const SelectorBuilderSentinel = Symbol()

export class Selector<T extends CollectionSchema, R extends RelationsSchema, Data = unknown> {
  selector!: (data: AsyncIDBInstance<T, R, any>) => Promise<Data>

  private constructor(key: symbol) {
    if (key !== SelectorBuilderSentinel)
      throw new Error("Cannot call ViewBuilder directly - use View.create()")
  }

  static create<const T extends CollectionSchema, const R extends RelationsSchema>(): Selector<
    T,
    R
  > {
    return new Selector<T, R>(SelectorBuilderSentinel)
  }

  as<const Callback extends (ctx: AsyncIDBInstance<T, R, any>["collections"]) => Promise<unknown>>(
    _callback: Callback
  ) {
    this.selector = _callback as any
    return this as Selector<T, R, Awaited<ReturnType<Callback>>>
  }
}
