import { useAsync, useEffect } from "kaioken"
import { Todo, db } from "$/db"

export function TodosList() {
  const { data, loading, error, invalidate } = useAsync(() => db.todos.all(), [])

  useEffect(() => {
    db.todos.addEventListener("write|delete", invalidate)
    return () => db.todos.removeEventListener("write|delete", invalidate)
  }, [invalidate])

  if (loading) {
    return <p>Loading...</p>
  }
  if (error) {
    return <p>{error.message}</p>
  }

  return (
    <div>
      <h3>Todos</h3>
      {data.map((todo) => (
        <TodoCard key={todo.id} todo={todo} />
      ))}
    </div>
  )
}

function TodoCard({ todo }: { todo: Todo }) {
  return (
    <div className="card">
      <span>ID: {todo.id}</span>
      <span>Text: {todo.text}</span>
      <div>
        <label>Done</label>
        <input
          type="checkbox"
          id={`done_${todo.id}`}
          checked={todo.done}
          onchange={(evt) => db.todos.update({ ...todo, done: evt.target.checked })}
        />
      </div>
      <div>
        <button onclick={() => db.todos.delete([todo.id])}>Delete</button>
      </div>
    </div>
  )
}
