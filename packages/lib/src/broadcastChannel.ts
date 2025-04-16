import { CollectionEvent } from "types"

export const MSG_TYPES = {
  CLOSE_FOR_UPGRADE: "[async-idb-orm]:close-for-upgrade",
  REINIT: "[async-idb-orm]:reinit",
  RELAY: "[async-idb-orm]:relay",
} as const

export type BroadcastChannelMessage =
  | {
      type: typeof MSG_TYPES.CLOSE_FOR_UPGRADE
      newVersion: number
    }
  | {
      type: typeof MSG_TYPES.REINIT
    }
  | {
      type: typeof MSG_TYPES.RELAY
      event: CollectionEvent
      name: string
      data: null | Record<string, any>
    }
