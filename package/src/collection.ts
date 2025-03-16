import type { Collection, CollectionConfig } from "./types"
import { $COLLECTION_INTERNAL } from "./constants.js"
export function collection<
  RecordType extends Record<string, any>,
  DTO extends Record<string, any> = any
>(config: CollectionConfig<RecordType, DTO>): Collection<RecordType, DTO> {
  return { [$COLLECTION_INTERNAL]: config }
}
