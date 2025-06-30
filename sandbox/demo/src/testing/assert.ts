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
  let actualError: unknown = null

  try {
    await cb()
  } catch (error) {
    didThrow = true
    actualError = error

    if (expectedErrorSubstring && error instanceof Error) {
      if (!error.message.includes(expectedErrorSubstring)) {
        throw new Error(
          `${msg} - Expected error message to contain "${expectedErrorSubstring}", but got: "${error.message}"`
        )
      }
    }
  }

  if (!didThrow) {
    throw new Error(msg + " - Expected function to throw, but it didn't")
  }

  console.debug("passed: ", msg)
}
