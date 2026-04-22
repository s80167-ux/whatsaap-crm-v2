import { Card } from "../components/Card";

export function SalesPage() {
  return (
    <section className="space-y-6">
      <Card elevated>
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Sales</p>
        <h2 className="mt-3 section-title">Pipeline workspace</h2>
        <p className="mt-2 section-copy">
          This is the legacy compatibility frontend. The live Sales dashboard now runs from the monorepo app under <code>apps/frontend</code>.
        </p>
      </Card>
      <Card elevated>
        <p className="text-sm leading-6 text-text-muted">
          If you are seeing this page in local development, you started the old app from <code>frontend/</code>. Start the current frontend from the repo root
          with <code>npm run dev:frontend</code> so Sales loads the live leads, orders, and summary data.
        </p>
      </Card>
    </section>
  );
}
