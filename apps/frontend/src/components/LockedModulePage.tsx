import { LockKeyhole } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "./Button";
import { Card } from "./Card";
import { getStoredUser } from "../lib/auth";

type LockedModulePageProps = {
  moduleName: string;
};

export function LockedModulePage({ moduleName }: LockedModulePageProps) {
  const navigate = useNavigate();
  const user = getStoredUser();
  const contactText = user?.role === "org_admin"
    ? "Please contact the platform admin to enable this module."
    : "Please contact your organization admin.";

  return (
    <section className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-2xl items-center justify-center px-4 py-8">
      <Card elevated className="w-full !p-6 text-center sm:!p-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-background-tint text-primary">
          <LockKeyhole size={22} />
        </span>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Module locked</p>
        <h1 className="mt-2 text-2xl font-semibold text-text">{moduleName}</h1>
        <p className="mt-3 text-sm leading-6 text-text-muted">
          This module is not enabled for your organization.
        </p>
        <p className="mt-1 text-sm leading-6 text-text-muted">{contactText}</p>
        <Button className="mt-6" onClick={() => navigate("/dashboard")}>
          Back to Dashboard
        </Button>
      </Card>
    </section>
  );
}
