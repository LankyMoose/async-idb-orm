import { Link, Router, Route } from "kaioken"
import { UsersList, CreateUserForm } from "./components/users"
import { TodosList, CreateTodoForm } from "./components/todos"

function Home() {
  return (
    <div>
      <h1>Async IDB Demo</h1>
    </div>
  )
}

function Nav() {
  return (
    <nav>
      <Link to="/">Home</Link>
      <Link to="/users">Users</Link>
      <Link to="/todos">Todos</Link>
    </nav>
  )
}

function UsersPage() {
  return (
    <>
      <nav>
        <Link to="/">List Users</Link>
        <Link to="/create">Create User</Link>
      </nav>
      <Router>
        <Route path="/" element={<UsersList />} />
        <Route path="/create" element={<CreateUserForm />} />
      </Router>
    </>
  )
}

function TodosPage() {
  return (
    <>
      <nav>
        <Link to="/">List Todos</Link>
        <Link to="/create">Create Todo</Link>
      </nav>
      <Router>
        <Route path="/" element={<TodosList />} />
        <Route path="/create" element={<CreateTodoForm />} />
      </Router>
    </>
  )
}

export function App() {
  return (
    <main>
      <Nav />
      <Router>
        <Route path="/" element={<Home />} />
        <Route path="/users" element={<UsersPage />} fallthrough />
        <Route path="/todos" element={<TodosPage />} fallthrough />
      </Router>
    </main>
  )
}
