import { Link, Router, Route, navigate } from "kaioken"
import { UsersList, CreateUserForm } from "./components/users"
import { TodosList, CreateTodoForm } from "./components/todos"

function Home() {
  return navigate("/users")
}

export function App() {
  return (
    <main>
      <nav>
        <Link to="/users">Users</Link>
        <Link to="/todos">Todos</Link>
      </nav>
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
