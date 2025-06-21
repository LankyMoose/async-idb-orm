export const keyPassThroughProxy = new Proxy({}, { get: (_: any, key: string) => key })
