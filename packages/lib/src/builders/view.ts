import { AsyncIDBInstance, CollectionSchema, RelationsSchema } from "../types"

const ViewBuilderSentinel = Symbol()

export class View<T extends CollectionSchema, R extends RelationsSchema, Data = unknown> {
  selector!: (data: AsyncIDBInstance<T, R, any>) => Promise<Data>

  private constructor(key: symbol) {
    if (key !== ViewBuilderSentinel)
      throw new Error("Cannot call ViewBuilder directly - use View.create()")
  }

  static create<const T extends CollectionSchema, const R extends RelationsSchema>(): View<T, R> {
    return new View<T, R>(ViewBuilderSentinel)
  }

  as<const Selector extends (ctx: AsyncIDBInstance<T, R, any>["collections"]) => Promise<unknown>>(
    _callback: Selector
  ) {
    this.selector = _callback as any
    return this as View<T, R, Awaited<ReturnType<Selector>>>
  }
}
