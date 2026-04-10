import { Link } from "kiru/router"

export default function UsersLayout({ children }: { children: JSX.Children }) {
  return (
    <>
      <nav>
        <Link to="/users">List users</Link>
        <Link to="/users/create">Create user</Link>
      </nav>
      {children}
    </>
  )
}
