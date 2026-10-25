import { NavLink, Link, Outlet } from "react-router-dom";
import { RuneField } from "../ui/Fx";
import "./app.css";

const LINKS = [
    { to: "/packs", label: "Event packs" },
    { to: "/cases/new", label: "New case" },
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
                </nav>
            </header>

            <main className="rg-main">
                <Outlet />
            </main>
        </div>
    );
}