import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ClipboardList,
  Briefcase,
  Users,
  UserCheck,
  Archive,
} from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/ta-board", label: "TA Board", icon: ClipboardList },
  { to: "/positions", label: "Positions", icon: Briefcase },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/tas", label: "TAs", icon: UserCheck },
  { to: "/archive", label: "Archive", icon: Archive },
];

function Navbar() {
  return (
    <header className="relative z-20 flex h-20 shrink-0 items-center justify-end gap-8 px-8">
      {/* Navigation links – all on the right side */}
      <nav className="flex items-center gap-8">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              [
                "text-sm font-semibold uppercase tracking-widest transition-colors",
                isActive
                  ? "text-forest-900"
                  : "text-forest-700/80 hover:text-forest-900",
              ].join(" ")
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User avatar – stays rightmost */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-forest-700 text-xs font-semibold text-white">
          US
        </div>
      </div>
    </header>
  );
}

export default Navbar;