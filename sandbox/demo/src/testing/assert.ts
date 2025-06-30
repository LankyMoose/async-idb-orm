export function assert(condition: unknown, msg: string): asserts condition is true {
  if (!condition) {
    throw new Error(msg)
  }
  console.debug("passed: ", msg)
}

export function assertInstanceOf<T>(
  value: unknown,
  constructor: new (...args: any[]) => T,
  msg: string
): asserts value is T {
  if (!(value instanceof constructor)) {
    throw new Error(msg)
  }
  console.debug("passed: ", msg)
}

export function assertExists<T>(value: T | null | undefined, msg: string): asserts value is T {
  if (value == null) {
    throw new Error(msg)
  }
  console.debug("passed: ", msg)
}

export async function assertThrows(
  cb: () => void | Promise<void>,
  msg: string,
  expectedErrorSubstring?: string
) {
  let didThrow = false

  try {
    await cb()
  } catch (error) {
    didThrow = true

    if (expectedErrorSubstring) {
      assertErrorAndMessage(error, expectedErrorSubstring)
    }
  }

  if (!didThrow) {
    throw new Error(msg + " - Expected function to throw, but it didn't")
  }

  console.debug("passed: ", msg)
}

export function assertErrorAndMessage(value: unknown, expectedErrorSubstring: string) {
  assertInstanceOf(value, Error, "Error should be an instance of Error")
  assert(value.message.includes(expectedErrorSubstring), "Error message should be the expected one")
}
