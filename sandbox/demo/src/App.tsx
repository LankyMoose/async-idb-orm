import { Link, Router, Route, navigate } from "kaioken/router"
import { selectedUser } from "./state/selectedUser"
import { UsersList } from "./components/UserList"
import { CreateUserForm } from "./components/CreateUserForm"
import { UserPosts } from "./components/UserPosts"
import { runRelationsTest } from "./tests/relations"
import { runBasicTest } from "./tests/basic"
import { db } from "./db"

// Test foreign key validation specifically
const testForeignKeyValidation = async () => {
  console.log("=== Testing Foreign Key Validation ===")

  try {
    // Clear all data first
    await db.collections.posts.clear()
    await db.collections.users.clear()

    // Create a user
    const user = await db.collections.users.create({ name: "Test User", age: 30 })
    console.log("Created user:", user)

    // Delete the user
    await db.collections.users.delete(user.id)
    console.log("Deleted user with id:", user.id)

    // Now try to create a post referencing the deleted user - this should throw
    console.log("Attempting to create post with invalid userId...")
    try {
      const post = await db.collections.posts.create({
        userId: user.id,
        content: "This should fail",
      })
      console.error("❌ ERROR: Post creation should have failed but succeeded:", post)
      alert("❌ Foreign key validation failed! Post was created with invalid userId")
    } catch (fkError) {
      const errorMsg = fkError instanceof Error ? fkError.message : String(fkError)
      console.log("✅ SUCCESS: Foreign key validation worked:", errorMsg)
      alert("✅ Foreign key validation working! Error: " + errorMsg)
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error("❌ Test setup failed:", error)
    alert("❌ Test setup failed: " + errorMsg)
  }
}

// Test foreign key validation in transaction
const testForeignKeyInTransaction = async () => {
  console.log("=== Testing Foreign Key Validation in Transaction ===")

  try {
    // Clear all data first
    await db.collections.posts.clear()
    await db.collections.users.clear()

    // Create a user
    const user = await db.collections.users.create({ name: "Test User", age: 30 })
    console.log("Created user:", user)

    // Delete the user
    await db.collections.users.delete(user.id)
    console.log("Deleted user with id:", user.id)

    // Now try to create a post in a transaction - this should throw
    console.log("Attempting to create post with invalid userId in transaction...")
    try {
      await db.transaction(async (c) => {
        const post = await c.posts.create({
          userId: user.id,
          content: "This should fail in transaction",
        })
        console.error(
          "❌ ERROR: Post creation in transaction should have failed but succeeded:",
          post
        )
      })
      alert("❌ Foreign key validation in transaction failed!")
    } catch (fkError) {
      const errorMsg = fkError instanceof Error ? fkError.message : String(fkError)
      console.log("✅ SUCCESS: Foreign key validation in transaction worked:", errorMsg)
      alert("✅ Foreign key validation in transaction working! Error: " + errorMsg)
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error("❌ Transaction test setup failed:", error)
    alert("❌ Transaction test setup failed: " + errorMsg)
  }
}
import { For, memo, useEffect, useSignal, useState } from "kaioken"

// window.addEventListener("error", (e) => console.error(e.error.message, e.error.stack))

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

function useUserNames() {
  const userNames = useSignal<string[]>([])
  // const [state, setState] = useState<string[]>([])
  useEffect(
    () =>
      db.selectors.allUserNames.subscribe((names) => {
        userNames.value = names
        console.log("names updated", names)
      }),
    []
  )

  return userNames
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
          <button onclick={testForeignKeyValidation}>FK Test</button>
          <button onclick={testForeignKeyInTransaction}>FK in Tx Test</button>
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
      <Router>
        <Route path="/" element={<Home />} />
        <Route path="/users" element={<UsersPage />} fallthrough />
      </Router>
    </main>
  )
}

const UserNameList = memo(function UserNameList() {
  const userNames = useUserNames()
  return (
    <div>
      <h1>Usernames</h1>
      <ul>
        <For each={userNames}>{(name) => <li>{name}</li>}</For>
      </ul>
    </div>
  )
})

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
