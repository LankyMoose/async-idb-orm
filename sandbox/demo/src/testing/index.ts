const tests = import.meta.glob("./tests/*.test.ts")

export async function testAll() {
  for (const moduleImporter of Object.values(tests)) {
    const module = await moduleImporter()
    const { default: testFn } = module as { default: () => Promise<void> }
    await testFn()
  }
}
