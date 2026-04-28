import { Navigate, Outlet } from "react-router-dom";
import { Navbar } from "./Navbar";
import { useAuthStore } from "@/store/auth";

export function AppLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container py-8">
        <Outlet />
      </main>
    </div>
  );
}
