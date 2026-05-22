import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMe } from "../hooks/useMe";

export function ProtectedLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const { isLoading, isError } = useMe();

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-text-muted">{t("auth.checkingSession")}</div>;
  }

  if (isError) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
