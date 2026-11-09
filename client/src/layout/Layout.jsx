import { Component } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./Navbar";

class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.locationKey !== this.props.locationKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-page-container flex flex-col items-center justify-center py-16">
          <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white/95 p-6 shadow-md text-center">
            <h2 className="font-display text-lg font-bold text-red-800 mb-2">
              Unable to display this page
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              {this.state.error?.message || "An unexpected rendering error occurred."}
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Layout() {
  const location = useLocation();
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden font-body text-forest-900 bg-gradient-to-br from-forest-50 via-forest-200 to-forest-600">
      <Navbar />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto flex flex-col">
        <RouteErrorBoundary locationKey={location.pathname}>
          <Outlet />
        </RouteErrorBoundary>
      </main>
    </div>
  );
}

export default Layout;