import { TestRunner } from "./testRunner"

const tests = import.meta.glob("./tests/*.test.ts")

let isRunning = false
export async function testAll() {
  if (isRunning) {
    throw new Error("testAll is already running")
  }
  isRunning = true
  const sortedKeys = Object.keys(tests).sort((a, b) => {
    const aNumber = parseInt(a.split("/").pop()?.split(".")[0]!)
    const bNumber = parseInt(b.split("/").pop()?.split(".")[0]!)
    return aNumber - bNumber
  })
  const testRunner = new TestRunner()
  for (const path of sortedKeys) {
    const moduleImporter = tests[path]
    const module = await moduleImporter()
    const { default: suiteBuilder } = module as { default: (runner: TestRunner) => void }
    suiteBuilder(testRunner)
  }
  try {
    await testRunner.run()
  } finally {
    isRunning = false
  }
}
