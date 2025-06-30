import type {
  CollectionEvent,
  CollectionEventCallback,
  AnyCollection,
  CollectionRecord,
} from "../types"
import { type AsyncIDB, type BroadcastChannelMessage, MSG_TYPES } from "../AsyncIDB.js"

/**
 * Manages event emission and listening for store operations
 */
export class StoreEventEmitter<T extends AnyCollection> {
  private eventListeners: Record<CollectionEvent, CollectionEventCallback<T, CollectionEvent>[]>
  private isRelaying: boolean = false

  constructor(private storeName: string, private db: AsyncIDB<any, any, any>) {
    this.eventListeners = {
      write: [],
      delete: [],
      "write|delete": [],
      clear: [],
    }
  }

  /**
   * Adds an event listener
   */
  addEventListener<Evt extends CollectionEvent>(
    event: Evt,
    listener: CollectionEventCallback<T, Evt>
  ): void {
    this.eventListeners[event].push(listener)
  }

  /**
   * Removes an event listener
   */
  removeEventListener<Evt extends CollectionEvent>(
    event: Evt,
    listener: CollectionEventCallback<T, Evt>
  ): void {
    this.eventListeners[event] = this.eventListeners[event].filter((l) => l !== listener)
  }

  /**
   * Emits an event to all listeners and optionally broadcasts it
   */
  emit<U extends CollectionEvent>(
    eventName: U,
    data: U extends "clear" ? null : CollectionRecord<T>
  ): void {
    const listeners = this.eventListeners[eventName] ?? []
    for (const listener of listeners) {
      try {
        listener(data as any)
      } catch (error) {
        console.error(`Error in ${eventName} event listener:`, error)
      }
    }

    // Broadcast to other tabs/windows if not relaying and broadcast is enabled
    if (!this.isRelaying && this.db.relayEnabled && this.db.bc) {
      this.db.bc.postMessage({
        type: MSG_TYPES.RELAY,
        name: this.storeName,
        event: eventName,
        data,
      } satisfies BroadcastChannelMessage)
    }
  }

  /**
   * Emits an event as a relay (from another tab/window)
   */
  relay<U extends CollectionEvent>(
    eventName: U,
    data: U extends "clear" ? null : CollectionRecord<T>
  ): void {
    this.isRelaying = true
    this.emit(eventName, data)
    this.isRelaying = false
  }

  /**
   * Removes all event listeners
   */
  removeAllListeners(): void {
    this.eventListeners = {
      write: [],
      delete: [],
      "write|delete": [],
      clear: [],
    }
  }

  /**
   * Gets the current event listeners for debugging
   */
  getListeners(): Record<CollectionEvent, number> {
    return Object.fromEntries(
      Object.entries(this.eventListeners).map(([event, listeners]) => [event, listeners.length])
    ) as Record<CollectionEvent, number>
  }
}
