const userNames = [
  "John Doe",
  "Jane Doe",
  "Bob Smith",
  "Alice Johnson",
  "Charlie Brown",
  "Emily Davis",
  "Michael Johnson",
  "Olivia Wilson",
  "William Brown",
  "Sophia Anderson",
  "James Lee",
  "Emma Clark",
  "Daniel Foster",
  "Ava Green",
]

export function randomUserName() {
  return userNames[Math.floor(Math.random() * userNames.length)]
}
