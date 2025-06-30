import type { CollectionEvent } from "./types"

export const keyPassThroughProxy = new Proxy({}, { get: (_: any, key: string) => key })

export const BROADCAST_MSG_TYPES = {
  CLOSE_FOR_UPGRADE: "[async-idb-orm]:close-for-upgrade",
  REINIT: "[async-idb-orm]:reinit",
  RELAY: "[async-idb-orm]:relay",
} as const

export type BroadcastChannelMessage =
  | {
      type: typeof BROADCAST_MSG_TYPES.CLOSE_FOR_UPGRADE
      newVersion: number
    }
  | {
      type: typeof BROADCAST_MSG_TYPES.REINIT
    }
  | {
      type: typeof BROADCAST_MSG_TYPES.RELAY
      event: CollectionEvent
      name: string
      data: null | Record<string, any>
    }
