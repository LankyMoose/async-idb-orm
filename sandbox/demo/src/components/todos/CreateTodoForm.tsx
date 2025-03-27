import { useState } from "kaioken"
import { TodoDTO, db } from "$/db"
import { selectedUser } from "$/state/selectedUser"

const createTodoDto = (): TodoDTO => ({ text: "", userId: "" })

export function CreateTodoForm() {
  const [todoDto, setTodoDto] = useState(createTodoDto)

  const handleSubmit = async (evt: Event) => {
    evt.preventDefault()
    try {
      if (!selectedUser.value) {
        alert("Please select a user")
        return
      }
      await db.collections.todos.create({ ...todoDto, userId: selectedUser.value.id })
      setTodoDto(createTodoDto)
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <form style="display:flex; flex-direction:column; gap:.5rem;" onsubmit={handleSubmit}>
      <h3>Create Todo</h3>
      <div>
        <label htmlFor="text">Text</label>
        <textarea
          name="text"
          id="text"
          value={todoDto.text}
          oninput={(e) => setTodoDto((prev) => ({ ...prev, text: e.target.value }))}
        />
      </div>
      <input type="submit" />
    </form>
  )
}
