import { Link, useCallback } from "kaioken"
import { User, db } from "$/db"
import { useLiveCollection } from "$/hooks/useCollection"
import { selectedUser } from "$/state/selectedUser"

const userNames = [
  "John Doe",
  "Jane Doe",
  "Bob Smith",
  "Alice Johnson",
  "Charlie Brown",
  "Emily Davis",
  "Michael Johnson",
  "Olivia Wilson",
  "William Brown",
  "Sophia Anderson",
  "James Lee",
  "Emma Clark",
  "Daniel Foster",
  "Ava Green",
]

function randomUserName() {
  return userNames[Math.floor(Math.random() * userNames.length)]
}

export function UsersList() {
  const { data: users, loading, error } = useLiveCollection("users")

  const addRandom = useCallback(async () => {
    await db.collections.users.create({
      name: randomUserName(),
      age: Math.floor(Math.random() * 100),
    })
  }, [])

  return (
    <div>
      <div style="display:flex; align-items:center; justify-content:space-between; gap: 2rem;">
        <h3>Users</h3>
        <button onclick={addRandom}>Add random user</button>
      </div>
      {loading ? (
        <p>Loading...</p>
      ) : error ? (
        <p>{error.message}</p>
      ) : (
        <>
          {users.map((user) => (
            <UserCard key={user.id} user={user} />
          ))}
        </>
      )}
    </div>
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
        <Link to={`/${user.id}/posts`} inherit>
          View Posts
        </Link>
      </div>
    </div>
  )
}
