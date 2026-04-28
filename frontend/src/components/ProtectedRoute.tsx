import { Navigate, useLocation } from "react-router-dom";

import { useAuthStore } from "@/store/auth";

import { LoadingSpinner } from "./shared/LoadingSpinner";

interface Props {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: Props) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
}
