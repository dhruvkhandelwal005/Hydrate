import { NavLink, Link, Outlet } from "react-router-dom";
import { RuneField } from "../ui/Fx";
import "./app.css";

const LINKS = [
    { to: "/cases/new", label: "New case & Packs" },
];

export default function AppShell() {
    return (
        <div className="rg">
            <div className="rg-aurora" aria-hidden="true">
                <i />
                <i />
                <i />
            </div>
            <RuneField />

            <header className="rg-nav">
                <Link to="/" className="rg-brand">
                    <svg viewBox="0 0 16 24" aria-hidden="true">
                        <polygon points="9,0 1,13 7,13 5,24 15,9 9,9 12,0" />
                    </svg>
                    Ragnarok
                </Link>
                <nav className="rg-links" aria-label="Main">
                    {LINKS.map(({ to, label }) => (
                        <NavLink
                            key={to}
                            to={to}
                            className={({ isActive }) => `rg-link${isActive ? " active" : ""}`}
                        >
                            {label}
                        </NavLink>
                    ))}
                    <button
                        type="button"
                        className="rg-link"
                        style={{
                            background: "rgba(234, 179, 8, 0.15)",
                            border: "1px solid #eab308",
                            color: "#fef08a",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            fontWeight: 600,
                            borderRadius: "6px"
                        }}
                        onClick={() => window.dispatchEvent(new CustomEvent("open-case-logs"))}
                        title="Open Case History & Audit Dossier Vault"
                    >
                        <span>📜</span> Case Audit Logs
                    </button>
                </nav>
            </header>

            <main className="rg-main">
                <Outlet />
            </main>
        </div>
    );
}