import { Link } from "kiru/router"
import { db } from "../db"
import { selectedUser } from "../state/selectedUser"
import { testAll } from "../testing"
import { For, onCleanup, signal } from "kiru"

export default function Layout({ children }: { children: JSX.Children }) {
  return (
    <main>
      <header style="display: flex; gap: 1rem; justify-content: space-between; background-color: #333; padding: 1rem; width: 980px; border-radius: 12px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); margin-bottom: 2rem;">
        <nav>
          <Link to="/users">Users</Link>
        </nav>
        <div style="display: flex; gap: 0.5rem;">
          <button onclick={reset}>Reset</button>
          <button onclick={testAll}>Run Tests</button>
        </div>
        <div style="display: flex; align-items: center; gap: 1rem;">
          Selected user:{" "}
          <code style="font-size: 1rem; background: #111; padding: 0.25rem 0.5rem;">
            {selectedUser.value ? selectedUser.value.name || "unnamed" : "none"}
          </code>
          <button onclick={() => (selectedUser.value = null)}>Deselect</button>
        </div>
      </header>
      <UserNameList />
      {children}
    </main>
  )
}

const reset = async () => {
  db.getInstance().then((idb) => {
    idb.close()
    const req = indexedDB.deleteDatabase(idb.name)
    req.onerror = (err) => console.error(err)
    req.onsuccess = () => window.location.reload()
  })
}

const UserNameList = () => {
  const userNames = signal<string[]>([])
  const unsub = db.selectors.allUserNames.subscribe((names) => (userNames.value = names))
  onCleanup(() => unsub())
  return (
    <div>
      <h1>Usernames</h1>
      <ul>
        <For each={userNames}>{(name) => <li>{name}</li>}</For>
      </ul>
    </div>
  )
}
