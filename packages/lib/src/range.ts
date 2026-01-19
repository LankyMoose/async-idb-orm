type RangeOperator = ">=" | ">" | "<=" | "<" | "="

interface RangeState {
  lower: any
  upper: any
  lowerOpen: boolean
  upperOpen: boolean
  type: "range" | "only" | "invalid"
}

// Regex to validate the static string parts.
// Matches optional whitespace, optional '&', whitespace, then the operator.
// Capture group 1 is the operator.
const OP_REGEX = /^\s*(?:&\s*)?([><]=?|=)\s*$/

/**
 * Tagged template range DSL for creating IDBKeyRange objects.
 *
 * @example
 * ```ts
 * range`>= ${20} & < ${30}`  // values >= 20 && values < 30 (equivalent to IDBKeyRange.bound(20, 30, false, true))
 * range`= ${42}`              // values === 42 (equivalent to IDBKeyRange.only(42))
 * range`< ${100}`             // values < 100 (equivalent to IDBKeyRange.upperBound(100))
 * range`> ${10} & <= ${50}`   // values > 10 && values <= 50 (equivalent to IDBKeyRange.bound(10, 50, true, false))
 * ```
 */
export const range = <const T extends IDBValidKey>(
  strings: TemplateStringsArray,
  ...values: T[]
): IDBKeyRange => {
  if (values.length === 0) {
    throw new Error("Range defined with no values.")
  }

  // Initial State
  const state: RangeState = {
    lower: undefined,
    upper: undefined,
    lowerOpen: false,
    upperOpen: false,
    type: "range", // defaults to range, switches to 'only' if '=' is used
  }

  // Iterate over values. In a tagged template `a ${v1} b ${v2}`,
  // strings[i] is the static text appearing BEFORE values[i].
  for (let i = 0; i < values.length; i++) {
    const rawString = strings[i]
    const value = values[i]

    // 1. Parse the operator from the static string
    const match = rawString.match(OP_REGEX)
    if (!match) {
      throw new Error(`Invalid syntax near "${rawString}". Expected an operator (>=, >, <=, <, =).`)
    }

    const op = match[1] as RangeOperator

    // 2. Apply logic based on operator
    switch (op) {
      case "=":
        if (state.lower !== undefined || state.upper !== undefined) {
          throw new Error("Cannot combine equality (=) with other bounds.")
        }
        state.lower = value
        state.type = "only"
        break

      case ">":
      case ">=":
        if (state.lower !== undefined) {
          throw new Error("Lower bound specified twice.")
        }
        state.lower = value
        state.lowerOpen = op === ">"
        break

      case "<":
      case "<=":
        if (state.upper !== undefined) {
          throw new Error("Upper bound specified twice.")
        }
        state.upper = value
        state.upperOpen = op === "<"
        break
    }
  }

  // 3. Validation: The tail string (after the last value) must be empty or whitespace
  if (strings[strings.length - 1].trim() !== "") {
    throw new Error("Unexpected text after the last value.")
  }

  // 4. Construct IDBKeyRange
  if (state.type === "only") {
    return IDBKeyRange.only(state.lower)
  }

  if (state.lower !== undefined && state.upper !== undefined) {
    // Sanity check: lower must be less than upper (unless it's a specific logic requirement)
    if (state.lower > state.upper) {
      throw new Error(
        `Lower bound (${state.lower}) cannot be greater than upper bound (${state.upper})`
      )
    }
    return IDBKeyRange.bound(state.lower, state.upper, state.lowerOpen, state.upperOpen)
  }

  if (state.lower !== undefined) {
    return IDBKeyRange.lowerBound(state.lower, state.lowerOpen)
  }

  if (state.upper !== undefined) {
    return IDBKeyRange.upperBound(state.upper, state.upperOpen)
  }

  throw new Error("Invalid range: No bounds specified.")
}
