import { withTransaction } from "../config/database.js";

type OrganizationRow = {
  id: string;
  name: string;
};

type UserRow = {
  id: string;
  organization_id: string;
  full_name: string | null;
  role: string;
  status: string;
};

type ContactRow = {
  id: string;
  organization_id: string;
  display_name: string | null;
  primary_phone_normalized: string | null;
};

async function seedSalesDemo() {
  const result = await withTransaction(async (client) => {
    const organizationResult = await client.query<OrganizationRow>(
      `
        select id, name
        from organizations
        order by created_at asc
        limit 1
      `
    );

    const organization = organizationResult.rows[0];

    if (!organization) {
      throw new Error("No organization found. Create an organization before seeding demo sales data.");
    }

    const userResult = await client.query<UserRow>(
      `
        select id, organization_id, full_name, role, status
        from organization_users
        where organization_id = $1
          and status = 'active'
        order by
          case role
            when 'org_admin' then 1
            when 'manager' then 2
            when 'agent' then 3
            else 4
          end,
          created_at asc
      `,
      [organization.id]
    );

    const contactResult = await client.query<ContactRow>(
      `
        select id, organization_id, display_name, primary_phone_normalized
        from contacts
        where organization_id = $1
        order by created_at asc
      `,
      [organization.id]
    );

    if (contactResult.rows.length === 0) {
      throw new Error("No contacts found. Create at least one contact before seeding demo sales data.");
    }

    const seedMarker = "demo-sales-seed-v1";

    const existingSeedResult = await client.query<{ count: string }>(
      `
        select count(*)::text as count
        from audit_logs
        where organization_id = $1
          and action = 'demo.sales_seeded'
          and metadata ->> 'seed_marker' = $2
      `,
      [organization.id, seedMarker]
    );

    if (Number(existingSeedResult.rows[0]?.count ?? 0) > 0) {
      return {
        organizationName: organization.name,
        insertedLeads: 0,
        insertedOrders: 0,
        insertedItems: 0,
        skipped: true
      };
    }

    const assignees = userResult.rows.length > 0 ? userResult.rows : [{ id: null, full_name: "Unassigned" } as unknown as UserRow];
    const contacts = contactResult.rows.slice(0, Math.min(3, contactResult.rows.length));
    const now = new Date();

    const leadTemplates = [
      { source: "WhatsApp campaign", status: "interested", temperature: "hot" },
      { source: "Referral", status: "processing", temperature: "warm" },
      { source: "Walk-in enquiry", status: "contacted", temperature: "cold" }
    ] as const;

    const orderTemplates = [
      {
        status: "open",
        totalAmount: 399,
        currency: "MYR",
        closedAt: null,
        createdDaysAgo: 4,
        items: [
          { productType: "Business Fibre", packageName: "Biz 300", unitPrice: 299, quantity: 1 },
          { productType: "Router", packageName: "WiFi 6 Router", unitPrice: 100, quantity: 1 }
        ]
      },
      {
        status: "closed_won",
        totalAmount: 259,
        currency: "MYR",
        closedAtDaysAgo: 1,
        createdDaysAgo: 7,
        items: [
          { productType: "Business Fibre", packageName: "Biz 100", unitPrice: 199, quantity: 1 },
          { productType: "Voice Add-on", packageName: "Business Voice", unitPrice: 60, quantity: 1 }
        ]
      },
      {
        status: "closed_lost",
        totalAmount: 149,
        currency: "MYR",
        closedAtDaysAgo: 2,
        createdDaysAgo: 6,
        items: [
          { productType: "Mobile Backup", packageName: "5G Backup SIM", unitPrice: 149, quantity: 1 }
        ]
      }
    ] as const;

    let insertedLeads = 0;
    let insertedOrders = 0;
    let insertedItems = 0;

    for (let index = 0; index < contacts.length; index += 1) {
      const contact = contacts[index];
      const assignee = assignees[index % assignees.length];
      const leadTemplate = leadTemplates[index % leadTemplates.length];
      const orderTemplate = orderTemplates[index % orderTemplates.length];

      const createdAt = new Date(now);
      createdAt.setUTCDate(createdAt.getUTCDate() - orderTemplate.createdDaysAgo);
      const closedAt =
        "closedAtDaysAgo" in orderTemplate && typeof orderTemplate.closedAtDaysAgo === "number"
          ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - orderTemplate.closedAtDaysAgo, 8, 30, 0))
          : orderTemplate.closedAt;

      const leadResult = await client.query<{ id: string }>(
        `
          insert into leads (
            organization_id,
            contact_id,
            source,
            status,
            temperature,
            assigned_user_id,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $7::timestamptz)
          returning id
        `,
        [
          organization.id,
          contact.id,
          leadTemplate.source,
          leadTemplate.status,
          leadTemplate.temperature,
          assignee.id,
          createdAt.toISOString()
        ]
      );

      insertedLeads += 1;
      const leadId = leadResult.rows[0].id;

      const orderResult = await client.query<{ id: string }>(
        `
          insert into sales_orders (
            organization_id,
            contact_id,
            lead_id,
            assigned_user_id,
            status,
            total_amount,
            currency,
            closed_at,
            created_at,
            updated_at
          )
          values (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8::timestamptz,
            $9::timestamptz,
            coalesce($8::timestamptz, $9::timestamptz)
          )
          returning id
        `,
        [
          organization.id,
          contact.id,
          leadId,
          assignee.id,
          orderTemplate.status,
          orderTemplate.totalAmount,
          orderTemplate.currency,
          closedAt ? closedAt.toISOString() : null,
          createdAt.toISOString()
        ]
      );

      insertedOrders += 1;
      const orderId = orderResult.rows[0].id;

      for (const item of orderTemplate.items) {
        await client.query(
          `
            insert into sales_order_items (
              sales_order_id,
              product_type,
              package_name,
              unit_price,
              quantity,
              total_price,
              created_at
            )
            values ($1, $2, $3, $4, $5, $6, $7::timestamptz)
          `,
          [
            orderId,
            item.productType,
            item.packageName,
            item.unitPrice,
            item.quantity,
            item.unitPrice * item.quantity,
            createdAt.toISOString()
          ]
        );

        insertedItems += 1;
      }

      await client.query(
        `
          insert into audit_logs (
            organization_id,
            actor_organization_user_id,
            actor_role,
            action,
            entity_type,
            entity_id,
            metadata,
            created_at
          )
          values ($1, $2, $3, 'sales.order_created', 'sales_order', $4, $5::jsonb, $6::timestamptz)
        `,
        [
          organization.id,
          assignee.id,
          assignee.role,
          orderId,
          JSON.stringify({
            contact_id: contact.id,
            status: orderTemplate.status,
            total_amount: orderTemplate.totalAmount,
            currency: orderTemplate.currency,
            seed_marker: seedMarker
          }),
          createdAt.toISOString()
        ]
      );

      await client.query(
        `
          insert into audit_logs (
            organization_id,
            actor_organization_user_id,
            actor_role,
            action,
            entity_type,
            entity_id,
            metadata,
            created_at
          )
          values ($1, $2, $3, 'lead.created', 'lead', $4, $5::jsonb, $6::timestamptz)
        `,
        [
          organization.id,
          assignee.id,
          assignee.role,
          leadId,
          JSON.stringify({
            source: leadTemplate.source,
            status: leadTemplate.status,
            temperature: leadTemplate.temperature,
            seed_marker: seedMarker
          }),
          createdAt.toISOString()
        ]
      );
    }

    await client.query(
      `
        insert into audit_logs (
          organization_id,
          actor_organization_user_id,
          actor_role,
          action,
          entity_type,
          entity_id,
          metadata
        )
        values ($1, $2, $3, 'demo.sales_seeded', 'system', $4, $5::jsonb)
      `,
      [
        organization.id,
        userResult.rows[0]?.id ?? null,
        userResult.rows[0]?.role ?? "system",
        organization.id,
        JSON.stringify({
          seed_marker: seedMarker,
          inserted_leads: insertedLeads,
          inserted_orders: insertedOrders,
          inserted_items: insertedItems
        })
      ]
    );

    return {
      organizationName: organization.name,
      insertedLeads,
      insertedOrders,
      insertedItems,
      skipped: false
    };
  });

  if (result.skipped) {
    console.log(`Demo sales data already exists for ${result.organizationName}.`);
    return;
  }

  console.log(
    `Seeded ${result.insertedLeads} leads, ${result.insertedOrders} sales orders, and ${result.insertedItems} order items for ${result.organizationName}.`
  );
}

seedSalesDemo().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
