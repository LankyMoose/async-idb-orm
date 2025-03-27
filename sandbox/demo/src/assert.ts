export function assert(booleanish: unknown, msg: string): asserts booleanish is true {
  if (!booleanish) throw new Error(msg)
}
export async function assertThrows(cb: () => Promise<void>, msg: string) {
  let didThrow = false
  try {
    await cb()
  } catch (error) {
    didThrow = true
  }
  assert(didThrow, msg)
}
