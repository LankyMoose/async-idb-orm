import { useState } from "kaioken"
import { UserDto, db } from "../db"

const createUserDto = (): UserDto => ({
  name: "",
  age: 0,
  alive: true,
  pets: [],
})

export function UserCreationForm() {
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
      await db.users.create(userDto)
      setUserDto(createUserDto)
    } catch (error) {
      console.error(error)
    }
  }

  const handlePetNameChange = (evt: Event & { target: HTMLInputElement }, petId: string) => {
    const { value } = evt.target
    setUserDto({
      ...userDto,
      pets: userDto.pets.map((pet) => (pet.id === petId ? { ...pet, name: value } : pet)),
    })
  }
  const addPet = () => {
    setUserDto({
      ...userDto,
      pets: [
        ...userDto.pets,
        {
          id: crypto.randomUUID(),
          name: "",
          age: 0,
          species: "dawg",
        },
      ],
    })
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
      <div>
        <ul>
          {userDto.pets.map((pet) => (
            <li key={pet.id}>
              <input
                type="text"
                name="name"
                value={pet.name}
                oninput={(e) => handlePetNameChange(e, pet.id)}
              />
            </li>
          ))}
        </ul>
        <button type="button" onclick={addPet}>
          Add Pet
        </button>
      </div>
      <input type="submit" />
    </form>
  )
}
