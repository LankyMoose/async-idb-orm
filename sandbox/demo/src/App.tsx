import { Link, Router, Route, navigate } from "kaioken/router"
import { selectedUser } from "./state/selectedUser"
import { UsersList } from "./components/UserList"
import { CreateUserForm } from "./components/CreateUserForm"
import { UserPosts } from "./components/UserPosts"
import { runRelationsTest } from "./tests/relations"
import { runBasicTest } from "./tests/basic"
import { db } from "./db"

window.addEventListener("error", (e) => console.error(e.error.message, e.error.stack))

function Home() {
  return navigate("/users")
}

const reset = async () => {
  db.getInstance().then((idb) => {
    idb.close()
    const req = indexedDB.deleteDatabase(idb.name)
    req.onerror = (err) => console.error(err)
    req.onsuccess = () => window.location.reload()
  })
}

export function App() {
  return (
    <main>
      <header style="display: flex; gap: 1rem; justify-content: space-between; background-color: #333; padding: 1rem; width: 980px; border-radius: 12px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); margin-bottom: 2rem;">
        <nav>
          <Link to="/users">Users</Link>
        </nav>
        <div style="display: flex; gap: 0.5rem;">
          <button onclick={reset}>Reset</button>
          <button onclick={runBasicTest}>Basic Test</button>
          <button onclick={runRelationsTest}>Relations Test</button>
        </div>
        <div style="display: flex; align-items: center; gap: 1rem;">
          Selected user:{" "}
          <code style="font-size: 1rem; background: #111; padding: 0.25rem 0.5rem;">
            {selectedUser.value ? selectedUser.value.name || "unnamed" : "none"}
          </code>
          <button onclick={() => (selectedUser.value = null)}>Deselect</button>
        </div>
      </header>
      <Router>
        <Route path="/" element={<Home />} />
        <Route path="/users" element={<UsersPage />} fallthrough />
      </Router>
    </main>
  )
}

function UsersPage() {
  return (
    <>
      <nav>
        <Link to="/" inherit>
          List users
        </Link>
        <Link to="/create" inherit>
          Create user
        </Link>
      </nav>
      <Router>
        <Route path="/" element={<UsersList />} />
        <Route path="/create" element={<CreateUserForm />} />
        <Route path="/:userId/posts" element={<UserPosts />} />
      </Router>
    </>
  )
}
