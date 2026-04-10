import { Derive, ErrorBoundary } from "kiru"
import { Link } from "kiru/router"
import { useLiveCollection } from "$/hooks/useCollection"
import { selectedUser } from "$/state/selectedUser"
import { db, User } from "$/db"
import { randomUserName } from "$/random"

export default function UsersPage() {
  const users = useLiveCollection("users")

  const addRandom = async () => {
    await db.collections.users.create({
      name: randomUserName(),
      age: Math.floor(Math.random() * 100),
    })
  }

  return () => (
    <>
      <div>
        <div style="display:flex; align-items:center; justify-content:space-between; gap: 2rem;">
          <h3>Users</h3>
          <button onclick={addRandom}>Add random user</button>
        </div>
        <ErrorBoundary fallback={(err) => <p>{err.message}</p>}>
          <Derive from={users} fallback={<p>Loading...</p>}>
            {(users) => {
              return users?.map((user) => <UserCard key={user.id} user={user} />)
            }}
          </Derive>
        </ErrorBoundary>
      </div>
      {/* {window.parent === window ? (
        <iframe src="./users" width="100%" height="500px" style="border: none;" />
      ) : null} */}
    </>
  )
}

function UserCard({ user }: { user: User }) {
  return (
    <div className="card">
      <span>ID: {user.id}</span>
      <span>Name: {user.name}</span>
      <span>Age: {user.age}</span>
      <div>
        <button onclick={() => db.collections.users.delete((u) => u.id === user.id)}>Delete</button>
        <button onclick={() => (selectedUser.value = user)}>Select</button>
        <Link to={`/users/${user.id}/posts`}>View Posts</Link>
      </div>
    </div>
  )
}
