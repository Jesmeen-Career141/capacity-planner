import { Link } from "react-router-dom";

function Footer() {
  return (
    <footer className="flex h-12 shrink-0 items-center justify-between px-8 text-sm text-forest-700">
      <span className="text-xs font-light tracking-wide opacity-70">
        &copy; {new Date().getFullYear()} career141 Capacity Planner
      </span>
      <div className="flex items-center gap-4 text-xs font-medium">
        <Link to="/settings" className="hover:text-forest-900 transition-colors">Settings</Link>
        <span className="text-forest-300">|</span>
        <Link to="/help" className="hover:text-forest-900 transition-colors">Help</Link>
        <span className="text-forest-300">|</span>
        <Link to="/logout" className="hover:text-forest-900 transition-colors">Logout</Link>
      </div>
    </footer>
  );
}

export default Footer;