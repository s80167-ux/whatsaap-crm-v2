import { Card } from "../components/Card";

export function SalesPage() {
  return (
    <section className="space-y-6">
      <Card elevated>
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Sales</p>
        <h2 className="mt-3 section-title">Pipeline workspace</h2>
        <p className="mt-2 section-copy">
          This surface is reserved for the next CRM pass: lead progression, sales orders, and owner-based revenue views on top of the SaaS schema.
        </p>
      </Card>
      <Card elevated>
        <p className="text-sm leading-6 text-text-muted">
          The underlying `leads`, `sales_orders`, and `sales_order_items` tables are already part of the migration track. What remains is role-scoped query
          endpoints and workflow UI.
        </p>
      </Card>
    </section>
  );
}
