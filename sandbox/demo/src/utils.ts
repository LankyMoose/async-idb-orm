export function formatIsoDate(date: Date) {
  return date.toISOString().split("T")[0]
}
