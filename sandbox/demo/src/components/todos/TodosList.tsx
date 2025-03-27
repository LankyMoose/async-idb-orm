import { Todo, db } from "$/db"
import { useLiveCollection } from "$/hooks/useCollection"

export function TodosList() {
  const { data: todos, loading, error } = useLiveCollection("todos")

  return (
    <div>
      <h3>Todos</h3>
      {loading ? (
        <p>Loading...</p>
      ) : error ? (
        <p>{error.message}</p>
      ) : (
        <>
          {todos.map((todo) => (
            <TodoCard key={todo.id} todo={todo} />
          ))}
        </>
      )}
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
          onchange={(evt) => db.collections.todos.update({ ...todo, done: evt.target.checked })}
        />
      </div>
      <div>
        <button onclick={() => db.collections.todos.delete([todo.id])}>Delete</button>
      </div>
    </div>
  )
}
