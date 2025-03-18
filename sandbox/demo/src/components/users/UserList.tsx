import { useCallback } from "kaioken"
import { Pet, User, db } from "$/db"
import { useLiveCollection } from "$/hooks/useCollection"

export function UsersList() {
  const { data: users, loading, error } = useLiveCollection("users")

  const addRandom = useCallback(async () => {
    await db.users.create({
      name: "John Doe",
      age: Math.floor(Math.random() * 100),
      alive: true,
      pets: [],
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
