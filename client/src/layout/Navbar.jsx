import { useState, useRef, useEffect } from "react";
import { NavLink, Link } from "react-router-dom";
import {
  Settings,
  HelpCircle,
  ChevronDown
} from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/ta-activity-dashboard", label: "TA Dashboard" },
  { to: "/interview-tracker", label: "Interviews" },
  { to: "/daily-action-board", label: "Daily Action Board" },
  { to: "/submission-sets", label: "Submission Sets" },
  { to: "/ta-board", label: "TA Board" },
  { to: "/positions", label: "Positions" },
  { to: "/engaged-clients", label: "Engaged Clients" },
  { to: "/strategies", label: "Strategies" },
  { to: "/clients", label: "Clients" },
  { to: "/tas", label: "TAs" },
  { to: "/archive", label: "Archive" },
];

function Navbar() {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-4 px-5 border-b border-forest-200/50 bg-white/75 backdrop-blur-md shadow-xs">
      {/* Brand logo & name on the left */}
      <div className="flex items-center gap-3 shrink-0">
        <Link to="/" className="flex items-center gap-2.5 group">
          <img
            src="/career141Logo.png"
            alt="Career141"
            className="h-8 w-8 object-contain transition-transform group-hover:scale-105"
            style={{ mixBlendMode: "multiply" }}
          />
          <span className="font-display text-base font-bold text-forest-900 tracking-tight whitespace-nowrap">
            Career141
          </span>
        </Link>
      </div>

      {/* Main navigation links across the top */}
      <nav className="flex items-center gap-3.5 2xl:gap-5 overflow-x-auto no-scrollbar py-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              [
                "text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap py-1 px-1 relative",
                isActive
                  ? "text-forest-900 font-extrabold after:absolute after:bottom-0 after:left-1 after:right-1 after:h-0.5 after:bg-forest-900 after:rounded-full"
                  : "text-forest-700/80 hover:text-forest-900",
              ].join(" ")
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User profile & actions on the right */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-1.5 rounded-full p-1 hover:bg-forest-100/50 transition-colors cursor-pointer"
            title="Account & Settings"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-forest-800 text-xs font-bold text-white shadow-xs">
              US
            </div>
            <ChevronDown size={13} className="text-forest-700" />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-forest-200/70 bg-white/95 p-1.5 shadow-lg backdrop-blur-md z-50">
              <div className="px-3 py-2 border-b border-forest-100 text-[11px] font-bold text-forest-900 uppercase tracking-wider">
                Career141 User
              </div>
              <Link
                to="/settings"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-forest-800 hover:bg-forest-50"
              >
                <Settings size={14} /> Settings
              </Link>
              <Link
                to="/help"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-forest-800 hover:bg-forest-50"
              >
                <HelpCircle size={14} /> Help
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Navbar;