import { db } from "$/db"
import { signal } from "kiru"

const userName = signal("")
const userAge = signal(0)

const handleSubmit = async (evt: Kiru.FormEvent) => {
  evt.preventDefault()
  try {
    await db.collections.users.create({
      name: userName.value,
      age: userAge.value,
    })

    for await (const user of db.collections.users) {
      console.log(user)
    }

    userName.value = ""
    userAge.value = 0
  } catch (error) {
    console.error(error)
  }
}
export default function CreateUserPage() {
  return (
    <form style="display:flex; flex-direction:column; gap:.5rem;" onsubmit={handleSubmit}>
      <h3>Create User</h3>
      <div>
        <label htmlFor="name">Name</label>
        <input type="text" name="name" id="name" bind:value={userName} />
      </div>
      <div>
        <label htmlFor="age">Age</label>
        <input type="number" name="age" id="age" bind:value={userAge} />
      </div>
      <input type="submit" />
    </form>
  )
}
