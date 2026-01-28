import { useSignal } from "kiru"
import { Link, useFileRouter } from "kiru/router"

const nav = [
  { href: "/", label: "Introduction" },
  { href: "/getting-started", label: "Getting Started" },
  { href: "/key-ranges", label: "Key Ranges" },
  { href: "/events", label: "Events" },
  { href: "/active-records", label: "Active Records" },
  { href: "/transactions", label: "Transactions" },
  { href: "/relations", label: "Relations" },
  { href: "/selectors", label: "Selectors" },
  { href: "/foreign-keys", label: "Foreign Keys" },
  { href: "/async-iteration", label: "Async Iteration" },
  { href: "/serialization", label: "Serialization" },
  { href: "/migrations", label: "Migrations" },
  { href: "/block-resolution", label: "Block Resolution" },
]

export default function RootLayout({ children }: { children: JSX.Children }) {
  const { state } = useFileRouter()
  const menuOpen = useSignal(false)

  const closeMenu = () => {
    menuOpen.value = false
  }

  return (
    <div className="docs-layout">
      <header className="mobile-header">
        <button
          type="button"
          className="mobile-menu-btn"
          aria-label={menuOpen.value ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen.value}
          onclick={() => (menuOpen.value = !menuOpen.value)}
        >
          <span className="mobile-menu-btn-icon" aria-hidden />
        </button>
        <Link to="/" className="mobile-header-logo" onclick={closeMenu}>
          async-idb-orm
        </Link>
      </header>

      <div
        className={`sidebar-backdrop ${menuOpen.value ? "sidebar-backdrop--open" : ""}`}
        aria-hidden
        onclick={closeMenu}
      />

      <aside className={`sidebar ${menuOpen.value ? "sidebar--open" : ""}`}>
        <div className="sidebar-header">
          <Link to="/" className="logo" onclick={closeMenu}>
            async-idb-orm
          </Link>
        </div>
        <nav className="sidebar-nav">
          {nav.map((item) => (
            <Link
              to={item.href}
              className={`nav-link ${state.pathname === item.href ? "nav-link--active" : ""}`}
              onclick={closeMenu}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="content">{children}</main>
    </div>
  )
}
