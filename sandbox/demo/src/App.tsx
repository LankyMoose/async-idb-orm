import { Link, Router, Route, navigate } from "kaioken"
import { UsersList, CreateUserForm } from "./components/users"
import { TodosList, CreateTodoForm } from "./components/todos"
import { selectedUser } from "./state/selectedUser"
import { db } from "./db"

function Home() {
  return navigate("/users")
}

async function demoTransaction() {
  console.log("demoTransaction")

  const res = await db.transaction(async (ctx, tx) => {
    const user = await ctx.users.create({ name: "John Doe", age: 30 })
    console.log("demoTransaction - created user", user)

    await ctx.todos.create({ text: "Buy groceries", userId: user.id })
    console.log("demoTransaction - created todo", user)

    if (Math.random() < 0.9) return tx.abort(), "aborted"
    return "bar"
  })
  console.log("demoTransaction - res:", res)
}

export function App() {
  return (
    <main>
      <header style="display: flex; gap: 1rem; justify-content: space-between; background-color: #333; padding: 1rem; width: 980px; border-radius: 12px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); margin-bottom: 2rem;">
        <nav>
          <Link to="/users">Users</Link>
          <Link to="/todos">Todos</Link>
        </nav>
        <button onclick={() => demoTransaction()}>Test TX</button>
        <div style="display: flex; align-items: center; gap: 1rem;">
          Selected user:{" "}
          <code style="font-size: 1rem; background: #111; padding: 0.25rem 0.5rem;">
            {selectedUser.value?.name || "none"}
          </code>
        </div>
      </header>
      <Router>
        <Route path="/" element={<Home />} />
        <Route
          path="/users"
          element={<CollectionPage name="users" list={UsersList} create={CreateUserForm} />}
          fallthrough
        />
        <Route
          path="/todos"
          element={<CollectionPage name="todos" list={TodosList} create={CreateTodoForm} />}
          fallthrough
        />
      </Router>
    </main>
  )
}

function CollectionPage({
  name,
  list: List,
  create: Create,
}: {
  name: string
  list: () => JSX.Element
  create: () => JSX.Element
}) {
  return (
    <>
      <nav>
        <Link to="/" inherit>
          List {name}
        </Link>
        <Link to="/create" inherit>
          Create {name}
        </Link>
      </nav>
      <Router>
        <Route path="/" element={<List />} />
        <Route path="/create" element={<Create />} />
      </Router>
    </>
  )
}
