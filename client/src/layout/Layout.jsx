import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";

function Layout() {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden font-body text-forest-900 bg-gradient-to-br from-forest-50 via-forest-200 to-forest-600">
      <Navbar />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;