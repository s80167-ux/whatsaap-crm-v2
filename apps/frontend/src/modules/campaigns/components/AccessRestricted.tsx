import { useNavigate } from "react-router-dom";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";

export function AccessRestricted() {
  const navigate = useNavigate();

  return (
    <Card elevated className="mx-auto max-w-2xl p-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-coral">Access Restricted</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-text">Access Restricted</h2>
      <p className="mt-3 text-sm leading-6 text-text-muted">
        This module is not enabled for your organization or your role does not have access.
      </p>
      <Button className="mt-5" onClick={() => navigate("/dashboard", { replace: true })}>
        Back to Dashboard
      </Button>
    </Card>
  );
}
