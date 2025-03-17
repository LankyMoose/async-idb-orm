import { useState } from "kaioken"
import { TodoDTO, db } from "$/db"

const createTodoDto = (): TodoDTO => ({ text: "" })

export function CreateTodoForm() {
  const [todoDto, setTodoDto] = useState(createTodoDto)

  const handleSubmit = async (evt: Event) => {
    evt.preventDefault()
    try {
      await db.todos.create(todoDto)
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
          oninput={(e) => setTodoDto({ text: e.target.value })}
        />
      </div>
      <input type="submit" />
    </form>
  )
}
