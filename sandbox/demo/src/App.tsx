import { UsersList } from "./components/UserList"
import { UserCreationForm } from "./components/CreateUserForm"
import { Link, Route, Router } from "kaioken"

export function App() {
  return (
    <main>
      <h1>Async IDB Demo</h1>
      <nav>
        <Link to="/">Users</Link>
        <Link to="/create">Create User</Link>
      </nav>
      <Router>
        <Route path="/" element={UsersList} />
        <Route path="/create" element={UserCreationForm} />
      </Router>
    </main>
  )
}
