import { useAsync, useEffect } from "kaioken"
import { Pet, User, db, users } from "../db"

export function UsersList() {
  const { data, loading, error, invalidate } = useAsync(() => db.users.all(), [])
  const { data: maxAge, error: maxAgeErr } = useAsync(() => db.users.max("age"), [])
  const { data: minAge, error: minAgeErr } = useAsync(() => db.users.min("age"), [])
  console.log("maxAge", { maxAge, maxAgeErr }, "minAge", { minAge, minAgeErr })

  useEffect(() => {
    const handleUsersChange = () => invalidate()
    users.on("write|delete", handleUsersChange)
    return () => users.off("write|delete", handleUsersChange)
  }, [])

  const addRandom = async () => {
    await db.users.create({
      name: "John Doe",
      age: 30,
      alive: true,
      pets: [],
    })
  }

  if (loading) {
    return <p>Loading...</p>
  }
  if (error) {
    return <p>{error.message}</p>
  }

  return (
    <div>
      <h3>Users</h3>
      {data.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
      <button onclick={addRandom}>Add random user</button>
    </div>
  )
}

function UserCard({ user }: { user: User }) {
  return (
    <div className="card">
      <span>ID: {user.id}</span>
      <span>Name: {user.name}</span>
      <span>Age: {user.age}</span>
      <span>Alive: {user.alive ? "alive" : "dead"}</span>
      <div>
        <h4>Pets</h4>
        <ul style={{ margin: "0", padding: "0" }}>
          {user.pets.map((pet) => (
            <PetCard key={pet.id} pet={pet} />
          ))}
        </ul>
      </div>
      <div>
        <button onclick={() => db.users.delete(user.id)}>Delete</button>
      </div>
    </div>
  )
}

function PetCard({ pet }: { pet: Pet }) {
  return (
    <li className="card">
      <span>ID: {pet.id}</span>
      <span>Name: {pet.name}</span>
      <span>Age: {pet.age}</span>
      <span>Species: {pet.species}</span>
    </li>
  )
}
