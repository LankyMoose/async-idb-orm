/**
 * Simple Test Framework with Lifecycle Hooks
 */

type TestFn = () => Promise<void> | void
type HookFn = () => Promise<void> | void

interface TestCase {
  name: string
  fn: TestFn
}

interface TestSuite {
  name: string
  tests: TestCase[]
  onBefore?: HookFn
  onBeforeEach?: HookFn
  onAfterEach?: HookFn
  onAfter?: HookFn
}

interface SuiteConfig {
  onBefore?: HookFn
  onBeforeEach?: HookFn
  onAfterEach?: HookFn
  onAfter?: HookFn
  tests: (test: (name: string, fn: TestFn) => void) => void
}

export class TestRunner {
  private suites: TestSuite[] = []
  private stats = {
    total: 0,
    passed: 0,
    failed: 0,
    errors: [] as { suite: string; test: string; error: unknown }[],
  }

  suite(name: string, config: SuiteConfig) {
    const suite: TestSuite = {
      name,
      tests: [],
      onBefore: config.onBefore,
      onBeforeEach: config.onBeforeEach,
      onAfterEach: config.onAfterEach,
      onAfter: config.onAfter,
    }
    // Collect tests
    config.tests((name, fn) => {
      suite.tests.push({ name, fn })
    })

    this.suites.push(suite)
    return this
  }

  async run() {
    console.log(`🧪 Running ${this.suites.length} test suite(s)...\n`)

    for (const suite of this.suites) {
      console.log(`📋 ${suite.name}`)
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Run onBefore hook
      if (suite.onBefore) {
        try {
          await suite.onBefore()
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error(`❌ Suite setup failed: ${message}`)
          continue
        }
      }

      // Run each test
      for (const test of suite.tests) {
        this.stats.total++

        try {
          if (suite.onBeforeEach) {
            await suite.onBeforeEach()
          }
        } catch (error) {
          console.error(`❌ Suite beforeEach failed: ${error}`)
        }

        try {
          await test.fn()

          console.log(`  ✅ ${test.name}`)
          this.stats.passed++
        } catch (error) {
          debugger
          const message = error instanceof Error ? error.message : String(error)
          console.log(`  ❌ ${test.name}`)
          console.log(`     ${message}`)
          this.stats.failed++
          this.stats.errors.push({
            suite: suite.name,
            test: test.name,
            error,
          })
        }

        try {
          if (suite.onAfterEach) {
            await suite.onAfterEach()
          }
        } catch (error) {
          console.error(`❌ Suite afterEach failed: ${error}`)
        }
      }

      // Run onAfter hook
      if (suite.onAfter) {
        try {
          await suite.onAfter()
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error(`❌ Suite teardown failed: ${message}`)
        }
      }

      console.log() // Empty line between suites
    }

    this.printSummary()
    return this.stats
  }

  private printSummary() {
    console.log("📊 Test Summary:")
    console.log(`   Total: ${this.stats.total}`)
    console.log(`   Passed: ${this.stats.passed}`)
    console.log(`   Failed: ${this.stats.failed}`)

    if (this.stats.failed > 0) {
      console.error("\n❌ Failed Tests:")
      this.stats.errors.forEach(({ suite, test }) => {
        console.error(`   • ${suite} > ${test}`)
      })
    }

    console.log(this.stats.failed === 0 ? "\n🎉 All tests passed!" : "\n💥 Some tests failed")
  }
}
