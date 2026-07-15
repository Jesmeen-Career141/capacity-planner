import { NavLink } from "react-router-dom";
import "./Sidebar.css";

const navItems = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/ta-board", label: "TA Board" },
  { to: "/positions", label: "Positions" },
  { to: "/clients", label: "Clients" },
  { to: "/tas", label: "TAs" },
  { to: "/archive", label: "Archive" }
];

function Sidebar() {
  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              isActive ? "sidebar-link active" : "sidebar-link"
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;
