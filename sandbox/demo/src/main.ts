import "./style.css"
import { model, Field, idb } from "async-idb-orm"

const users = model({
  id: Field.number({ primaryKey: true }),
  name: Field.string({ default: "John Doe" }),
  age: Field.number({ index: true }),
  birthday: Field.date({ default: () => new Date(), optional: true }),
  pets: Field.array(
    model({
      name: Field.string(),
      age: Field.number(),
      species: Field.string({ optional: true }),
      birthday: Field.date({ default: () => new Date() }),
    })
  ),
  alive: Field.boolean(),
})

function createUserCard(user: any) {
  const card = document.createElement("div")
  card.className = "card"
  card.innerHTML = `
    <div class="card-header">
      <h2>${user.name}</h2>
    </div>
    <div class="card-body">
      <p>Age: ${user.age}</p>
      <p>Birthday: ${user.birthday}</p>
      <p>Alive: ${user.alive}</p>
      <p>Pets: ${user.pets.length}</p>
    </div>
  `
  return card
}

const db = idb("demo", { users })

const list = document.createElement("ul")
document.body.appendChild(list)

async function main() {
  await db.users.create({
    age: 25,
    pets: [
      {
        name: "Fido",
        age: 1,
        species: "dog",
      },
    ],
    alive: true,
  })

  const users = await db.users.all()
  list.innerHTML = ""
  users.forEach((user) => {
    const li = document.createElement("li")
    li.appendChild(createUserCard(user))
    list.appendChild(li)
  })
}

const btn = document.createElement("button")
btn.textContent = "Click me"
btn.onclick = main
document.body.appendChild(btn)

const clearBtn = document.createElement("button")
clearBtn.textContent = "Clear"
clearBtn.onclick = () => {
  db.users.clear()
  list.innerHTML = ""
}
document.body.appendChild(clearBtn)
