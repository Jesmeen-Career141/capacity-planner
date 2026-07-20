import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";
import Footer from "./Footer";

function Layout() {
  return (
    <div className="flex h-screen w-full overflow-hidden font-body text-forest-900 bg-gradient-to-br from-forest-50 via-forest-200 to-forest-600">
      <Sidebar />
      <div className="flex min-h-0 flex-1 flex-col">
        <Navbar />
        <main className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  );
}

export default Layout;