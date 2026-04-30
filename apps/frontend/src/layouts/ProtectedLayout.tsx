import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useMe } from "../hooks/useMe";

export function ProtectedLayout() {
  const location = useLocation();
  const { isLoading, isError } = useMe();

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-text-muted">Checking session...</div>;
  }

  if (isError) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
