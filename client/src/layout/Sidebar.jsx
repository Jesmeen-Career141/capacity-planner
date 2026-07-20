import { useState } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  ClipboardList,
  Briefcase,
  Users,
  UserCheck,
  Archive,
  Settings,
  HelpCircle,
  LogOut,
} from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/ta-board", label: "TA Board", icon: ClipboardList },
  { to: "/positions", label: "Positions", icon: Briefcase },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/tas", label: "TAs", icon: UserCheck },
  { to: "/archive", label: "Archive", icon: Archive },
];

const bottomItems = [
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/help", label: "Help", icon: HelpCircle },
  { to: "/logout", label: "Logout", icon: LogOut },
];

function Sidebar() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <motion.aside
      animate={{ width: isExpanded ? "16rem" : "4rem" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      className="relative flex h-full flex-shrink-0 flex-col justify-between overflow-hidden px-3 py-5"
    >
      <div>
        {/* Logo */}
        <div className="relative mb-8 flex items-center justify-center">
          {/* soft glow behind the logo so its edges melt into the background */}
          <div className="pointer-events-none absolute h-14 w-14 rounded-full bg-forest-200/40 blur-xl" />

          <img
            src="/career141Logo.png"
            alt="career141 logo"
            className="relative h-14 w-14 flex-shrink-0 object-contain"
            style={{ mixBlendMode: "multiply" }}
          />

          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: isExpanded ? 1 : 0, width: isExpanded ? "auto" : 0 }}
            transition={{ delay: 0.1, duration: 0.2 }}
            className="relative ml-2 whitespace-nowrap font-display text-lg font-bold text-forest-900"
          >
            career141
          </motion.span>
        </div>

        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLinkItem key={item.to} item={item} isExpanded={isExpanded} />
          ))}
        </nav>
      </div>

      <div className="flex flex-col gap-1 border-t border-forest-900/10 pt-3">
        {bottomItems.map((item) => (
          <NavLinkItem key={item.to} item={item} isExpanded={isExpanded} />
        ))}
      </div>
    </motion.aside>
  );
}

function NavLinkItem({ item, isExpanded }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        [
          "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200",
          isActive
            ? "bg-white/40 text-forest-900"
            : "text-forest-700/80 hover:bg-white/25 hover:text-forest-900",
        ].join(" ")
      }
    >
      <Icon className="h-5 w-5 flex-shrink-0" />
      <motion.span
        initial={{ opacity: 0, width: 0 }}
        animate={{ opacity: isExpanded ? 1 : 0, width: isExpanded ? "auto" : 0 }}
        transition={{ delay: 0.1, duration: 0.2 }}
        className="whitespace-nowrap text-xs font-semibold uppercase tracking-widest"
      >
        {item.label}
      </motion.span>
    </NavLink>
  );
}

export default Sidebar;