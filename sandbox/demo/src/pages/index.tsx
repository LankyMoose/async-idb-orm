import { onMount } from "kiru"
import { useFileRouter } from "kiru/router"

export default function HomePage() {
  const router = useFileRouter()
  onMount(() => void router.navigate("/users"))

  return () => null
}
