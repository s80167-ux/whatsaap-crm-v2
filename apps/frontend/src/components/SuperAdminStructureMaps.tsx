import { useState } from "react";
import { motion, type PanInfo } from "framer-motion";
import { RotateCcw } from "lucide-react";

type MapSectionTone = "state" | "data" | "action";

type MapSection = {
  title: string;
  tone: MapSectionTone;
  items: string[];
};

type MapNode = {
  id: string;
  eyebrow: string;
  title: string;
  x: number;
  y: number;
  width?: number;
  sections: MapSection[];
};

type MapLink = {
  from: string;
  to: string;
  mode?: "solid" | "dashed";
};

type MapBoardProps = {
  label: string;
  title: string;
  description: string;
  canvasClassName: string;
  nodes: MapNode[];
  links: MapLink[];
  canvas: {
    width: number;
    height: number;
  };
};

const estimatedCardHeight = 330;

const dataStructureNodes: MapNode[] = [
  {
    id: "organizations",
    eyebrow: "01.0 Core",
    title: "organizations",
    x: 610,
    y: 48,
    width: 280,
    sections: [
      { title: "Role", tone: "state", items: ["Tenant root", "Platform-scoped record"] },
      { title: "Columns", tone: "data", items: ["id", "name", "slug", "status"] },
      { title: "Feeds", tone: "action", items: ["organization_users", "whatsapp_accounts", "contacts", "usage_daily_metrics"] }
    ]
  },
  {
    id: "organization_users",
    eyebrow: "02.0 Access",
    title: "organization_users",
    x: 180,
    y: 360,
    sections: [
      { title: "Role", tone: "state", items: ["RBAC user", "Auth-linked member"] },
      { title: "Columns", tone: "data", items: ["organization_id", "auth_user_id", "role", "status"] },
      { title: "Feeds", tone: "action", items: ["whatsapp_accounts.created_by", "contacts.owner_user_id", "conversation assignments"] }
    ]
  },
  {
    id: "whatsapp_accounts",
    eyebrow: "03.0 Channel",
    title: "whatsapp_accounts",
    x: 505,
    y: 360,
    sections: [
      { title: "Role", tone: "state", items: ["Connected number", "Runtime bridge"] },
      { title: "Columns", tone: "data", items: ["organization_id", "connection_status", "phone_number", "created_by"] },
      { title: "Feeds", tone: "action", items: ["conversations", "messages", "raw channel events"] }
    ]
  },
  {
    id: "contacts",
    eyebrow: "04.0 CRM",
    title: "contacts",
    x: 830,
    y: 360,
    sections: [
      { title: "Role", tone: "state", items: ["Canonical customer record", "Identity anchor"] },
      { title: "Columns", tone: "data", items: ["organization_id", "owner_user_id", "primary_phone_e164", "lifecycle_status"] },
      { title: "Feeds", tone: "action", items: ["conversations", "leads", "sales_orders"] }
    ]
  },
  {
    id: "conversations",
    eyebrow: "05.0 Inbox",
    title: "conversations",
    x: 300,
    y: 760,
    sections: [
      { title: "Role", tone: "state", items: ["Thread container", "Assignment surface"] },
      { title: "Columns", tone: "data", items: ["organization_id", "whatsapp_account_id", "contact_id", "assigned_user_id"] },
      { title: "Feeds", tone: "action", items: ["messages", "conversation assignments", "inbox projections"] }
    ]
  },
  {
    id: "messages",
    eyebrow: "06.0 Messaging",
    title: "messages",
    x: 620,
    y: 770,
    width: 270,
    sections: [
      { title: "Role", tone: "state", items: ["Inbound and outbound log", "Delivery lifecycle"] },
      { title: "Columns", tone: "data", items: ["conversation_id", "whatsapp_account_id", "contact_id", "ack_status"] },
      { title: "Feeds", tone: "action", items: ["outbound queue", "status sync", "reporting metrics"] }
    ]
  },
  {
    id: "leads",
    eyebrow: "07.0 Pipeline",
    title: "leads",
    x: 955,
    y: 760,
    sections: [
      { title: "Role", tone: "state", items: ["Qualification funnel", "Pre-order stage"] },
      { title: "Columns", tone: "data", items: ["organization_id", "contact_id", "assigned_user_id", "status"] },
      { title: "Feeds", tone: "action", items: ["sales_orders", "reports", "dashboard funnel"] }
    ]
  },
  {
    id: "sales_orders",
    eyebrow: "08.0 Revenue",
    title: "sales_orders",
    x: 1135,
    y: 360,
    sections: [
      { title: "Role", tone: "state", items: ["Revenue outcome", "Won or lost record"] },
      { title: "Columns", tone: "data", items: ["organization_id", "contact_id", "status", "amount"] },
      { title: "Feeds", tone: "action", items: ["sales dashboard", "reports", "revenue timeline"] }
    ]
  },
  {
    id: "supporting",
    eyebrow: "09.0 Support",
    title: "quick_replies + audit + usage",
    x: 1130,
    y: 760,
    width: 285,
    sections: [
      { title: "Role", tone: "state", items: ["Reusable content", "System trace", "Daily aggregation"] },
      { title: "Columns", tone: "data", items: ["quick_replies", "audit_logs", "usage_daily_metrics"] },
      { title: "Feeds", tone: "action", items: ["automation", "platform overview", "compliance review"] }
    ]
  }
];

const dataStructureLinks: MapLink[] = [
  { from: "organizations", to: "organization_users" },
  { from: "organizations", to: "whatsapp_accounts" },
  { from: "organizations", to: "contacts" },
  { from: "organizations", to: "sales_orders", mode: "dashed" },
  { from: "organization_users", to: "whatsapp_accounts" },
  { from: "organization_users", to: "contacts" },
  { from: "organization_users", to: "conversations" },
  { from: "whatsapp_accounts", to: "conversations" },
  { from: "whatsapp_accounts", to: "messages" },
  { from: "contacts", to: "conversations" },
  { from: "contacts", to: "messages", mode: "dashed" },
  { from: "contacts", to: "leads" },
  { from: "contacts", to: "sales_orders" },
  { from: "conversations", to: "messages" },
  { from: "leads", to: "sales_orders" },
  { from: "messages", to: "supporting" },
  { from: "sales_orders", to: "supporting", mode: "dashed" }
];

const organizationStructureNodes: MapNode[] = [
  {
    id: "platform_owner",
    eyebrow: "01.0 Platform",
    title: "Super Admin",
    x: 630,
    y: 48,
    width: 270,
    sections: [
      { title: "Scope", tone: "state", items: ["Cross-tenant visibility", "Platform governance"] },
      { title: "Owns", tone: "data", items: ["Organizations", "Global setup", "Platform map"] },
      { title: "Actions", tone: "action", items: ["Create tenant", "Review health", "Trace audit activity"] }
    ]
  },
  {
    id: "organization",
    eyebrow: "02.0 Tenant",
    title: "Organization",
    x: 635,
    y: 340,
    width: 260,
    sections: [
      { title: "Scope", tone: "state", items: ["Single tenant workspace", "Scoped data boundary"] },
      { title: "Contains", tone: "data", items: ["Users", "Accounts", "Contacts", "Sales data"] },
      { title: "Actions", tone: "action", items: ["Select org", "Open setup", "Inspect usage"] }
    ]
  },
  {
    id: "org_admin",
    eyebrow: "03.0 Role",
    title: "Org Admin",
    x: 165,
    y: 665,
    sections: [
      { title: "Scope", tone: "state", items: ["Tenant-wide authority", "Setup owner"] },
      { title: "Controls", tone: "data", items: ["Users", "Roles", "WhatsApp accounts"] },
      { title: "Actions", tone: "action", items: ["Provision access", "Reset users", "Assign account ownership"] }
    ]
  },
  {
    id: "manager",
    eyebrow: "04.0 Role",
    title: "Manager",
    x: 495,
    y: 665,
    sections: [
      { title: "Scope", tone: "state", items: ["Team supervision", "Operational oversight"] },
      { title: "Controls", tone: "data", items: ["Assigned conversations", "Lead progress", "Reports"] },
      { title: "Actions", tone: "action", items: ["Monitor pipeline", "Reassign work", "Coach agents"] }
    ]
  },
  {
    id: "agent",
    eyebrow: "05.0 Role",
    title: "Agent / User",
    x: 825,
    y: 665,
    width: 270,
    sections: [
      { title: "Scope", tone: "state", items: ["Frontline execution", "Daily inbox work"] },
      { title: "Controls", tone: "data", items: ["Assigned contacts", "Assigned threads", "Replies sent"] },
      { title: "Actions", tone: "action", items: ["Reply", "Update contact", "Advance lead"] }
    ]
  },
  {
    id: "accounts",
    eyebrow: "06.0 Asset",
    title: "WhatsApp Accounts",
    x: 1140,
    y: 665,
    sections: [
      { title: "Scope", tone: "state", items: ["Runtime asset", "Channel endpoint"] },
      { title: "Supports", tone: "data", items: ["Conversation entry", "Message dispatch", "Connector heartbeat"] },
      { title: "Actions", tone: "action", items: ["Connect", "Reconnect", "Review status"] }
    ]
  },
  {
    id: "operations",
    eyebrow: "07.0 Work",
    title: "Contacts, Conversations, Leads, Orders",
    x: 470,
    y: 980,
    width: 370,
    sections: [
      { title: "Scope", tone: "state", items: ["Shared operating workload", "Tenant business record"] },
      { title: "Owned By", tone: "data", items: ["Org admin policy", "Manager oversight", "Agent execution"] },
      { title: "Actions", tone: "action", items: ["Serve customers", "Track pipeline", "Close revenue"] }
    ]
  }
];

const organizationStructureLinks: MapLink[] = [
  { from: "platform_owner", to: "organization" },
  { from: "organization", to: "org_admin" },
  { from: "organization", to: "manager" },
  { from: "organization", to: "agent" },
  { from: "organization", to: "accounts" },
  { from: "org_admin", to: "manager" },
  { from: "manager", to: "agent" },
  { from: "org_admin", to: "accounts" },
  { from: "org_admin", to: "operations" },
  { from: "manager", to: "operations" },
  { from: "agent", to: "operations" },
  { from: "accounts", to: "operations", mode: "dashed" }
];

export function SuperAdminDataStructureMap() {
  return (
    <MapBoard
      label="Data Structure Map"
      title="Data structure (from database)"
      description="A schema-led board of the core entities behind organization access, inbox operations, CRM records, and revenue tracking."
      canvasClassName="super-admin-structure-canvas super-admin-structure-canvas--data"
      nodes={dataStructureNodes}
      links={dataStructureLinks}
      canvas={{ width: 1540, height: 1180 }}
    />
  );
}

export function SuperAdminOrganizationStructureMap() {
  return (
    <MapBoard
      label="Organization User Structure Map"
      title="Organization user structure map"
      description="A responsibility map showing how super admin, tenant roles, channel assets, and operational records connect."
      canvasClassName="super-admin-structure-canvas super-admin-structure-canvas--organization"
      nodes={organizationStructureNodes}
      links={organizationStructureLinks}
      canvas={{ width: 1520, height: 1360 }}
    />
  );
}

function MapBoard({ label, title, description, canvasClassName, nodes, links, canvas }: MapBoardProps) {
  const [nodePositions, setNodePositions] = useState(() => getDefaultNodePositions(nodes));
  const positionedNodes = nodes.map((node) => ({ ...node, ...nodePositions[node.id] }));

  function handleDragEnd(node: MapNode, info: PanInfo) {
    setNodePositions((current) => {
      const position = current[node.id] ?? { x: node.x, y: node.y };
      const width = node.width ?? 245;

      return {
        ...current,
        [node.id]: {
          x: clamp(Math.round(position.x + info.offset.x), 0, canvas.width - width),
          y: clamp(Math.round(position.y + info.offset.y), 0, canvas.height - estimatedCardHeight)
        }
      };
    });
  }

  function handleResetPositions() {
    setNodePositions(getDefaultNodePositions(nodes));
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-panel">
      <div className="flex flex-col gap-4 border-b border-border bg-background-elevated px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">{label}</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-text">{title}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleResetPositions}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-text-soft transition duration-200 hover:border-primary/20 hover:text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
            aria-label="Reset map position"
            title="Reset map position"
          >
            <RotateCcw size={16} />
          </button>
          <div className="rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">
            Drag cards or scroll to explore
          </div>
        </div>
      </div>

      <div className="overflow-auto bg-background-tint/80">
        <div className={`${canvasClassName} relative`}>
          <svg className="pointer-events-none absolute inset-0" width={canvas.width} height={canvas.height} viewBox={`0 0 ${canvas.width} ${canvas.height}`}>
            <defs>
              <marker id={`${label}-arrow`} markerHeight="8" markerWidth="8" orient="auto" refX="6" refY="3">
                <path d="M0,0 L0,6 L6,3 z" fill="rgb(var(--foreground) / 0.88)" />
              </marker>
            </defs>
            {links.map((link) => {
              const from = findNode(positionedNodes, link.from);
              const to = findNode(positionedNodes, link.to);
              const path = buildConnectorPath(from, to);

              return (
                <path
                  key={`${label}-${link.from}-${link.to}`}
                  d={path}
                  fill="none"
                  stroke="rgb(var(--foreground) / 0.88)"
                  strokeDasharray={link.mode === "dashed" ? "6 8" : undefined}
                  strokeWidth="1.4"
                  markerEnd={`url(#${label}-arrow)`}
                />
              );
            })}
          </svg>

          {positionedNodes.map((node, index) => (
            <motion.div
              key={`${label}-${node.id}`}
              className="absolute cursor-move touch-none select-none"
              drag
              dragMomentum={false}
              onDragEnd={(_, info) => handleDragEnd(node, info)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: index * 0.035 }}
              style={{ left: node.x, top: node.y, width: node.width ?? 245 }}
            >
              <MapCard node={node} />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MapCard({ node }: { node: MapNode }) {
  return (
    <article className="min-h-[230px] border border-border bg-card px-5 py-5 font-mono text-[11px] leading-relaxed text-card-foreground shadow-panel">
      <p className="text-[10px] uppercase tracking-[0.16em] text-text-soft">{node.eyebrow}</p>
      <h4 className="mt-1 text-[17px] font-semibold normal-case tracking-tight text-text">{node.title}</h4>

      <div className="mt-4 space-y-3">
        {node.sections.map((section) => (
          <section key={`${node.id}-${section.title}`}>
            <div className={`mb-2 w-32 px-3 py-1 text-center text-[9px] font-bold uppercase tracking-[0.08em] ${getLabelClass(section.tone)}`}>
              {section.title}
            </div>
            <ul className="ml-3 list-disc space-y-0.5 text-text-muted">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </article>
  );
}

function getLabelClass(tone: MapSectionTone) {
  switch (tone) {
    case "state":
      return "bg-warning/20 text-warning";
    case "data":
      return "bg-topbar text-topbar-foreground";
    case "action":
      return "bg-success/20 text-success";
  }
}

function findNode(flowNodes: MapNode[], id: string) {
  const node = flowNodes.find((item) => item.id === id);

  if (!node) {
    throw new Error(`Missing flow node: ${id}`);
  }

  return node;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getDefaultNodePositions(nodes: MapNode[]) {
  return Object.fromEntries(nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
}

function getNodeCenter(node: MapNode) {
  return {
    x: node.x + (node.width ?? 245) / 2,
    y: node.y + estimatedCardHeight / 2
  };
}

function buildConnectorPath(from: MapNode, to: MapNode) {
  const start = getNodeCenter(from);
  const end = getNodeCenter(to);
  const fromBottom = from.y + estimatedCardHeight + 10;
  const toTop = to.y - 10;
  const midY = Math.round((fromBottom + toTop) / 2);

  if (Math.abs(start.x - end.x) < 40) {
    return `M ${start.x} ${fromBottom} L ${end.x} ${toTop}`;
  }

  return `M ${start.x} ${fromBottom} L ${start.x} ${midY} L ${end.x} ${midY} L ${end.x} ${toTop}`;
}
