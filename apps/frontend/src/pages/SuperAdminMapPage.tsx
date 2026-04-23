import { Navigate } from "react-router-dom";
import { SuperAdminFlowMap } from "../components/SuperAdminFlowMap";
import { getStoredUser } from "../lib/auth";

export function SuperAdminMapPage() {
  const user = getStoredUser();

  if (user?.role !== "super_admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <section className="space-y-6">
      <SuperAdminFlowMap />
    </section>
  );
}
