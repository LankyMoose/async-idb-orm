import { useState } from "kaioken"
import { UserDTO, db } from "$/db"

const createUserDto = (): UserDTO => ({
  name: "",
  age: 0,
})

export function CreateUserForm() {
  const [userDto, setUserDto] = useState(createUserDto)
  const handleChange = (evt: Event & { target: HTMLInputElement }) => {
    const { name, value } = evt.target
    setUserDto({
      ...userDto,
      [name]: name === "birthday" ? new Date(value) : name === "age" ? Number(value) : value,
    })
  }

  const handleSubmit = async (evt: Event) => {
    evt.preventDefault()
    try {
      await db.collections.users.create(userDto)

      for await (const user of db.collections.users) {
        console.log(user)
      }

      setUserDto(createUserDto)
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <form style="display:flex; flex-direction:column; gap:.5rem;" onsubmit={handleSubmit}>
      <h3>Create User</h3>
      <div>
        <label htmlFor="name">Name</label>
        <input type="text" name="name" id="name" value={userDto.name} oninput={handleChange} />
      </div>
      <div>
        <label htmlFor="age">Age</label>
        <input type="number" name="age" id="age" value={userDto.age} oninput={handleChange} />
      </div>
      <input type="submit" />
    </form>
  )
}
