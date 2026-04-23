import { useState } from "react";
import { motion, type PanInfo } from "framer-motion";

type FlowSection = {
  title: string;
  items: string[];
  tone: "state" | "data" | "action";
};

type FlowNode = {
  id: string;
  eyebrow: string;
  title: string;
  x: number;
  y: number;
  width?: number;
  sections: FlowSection[];
};

type FlowLink = {
  from: string;
  to: string;
  mode?: "solid" | "dashed";
};

const canvas = {
  width: 1520,
  height: 1180
};

const estimatedCardHeight = 330;

const nodes: FlowNode[] = [
  {
    id: "platform",
    eyebrow: "00.0 Screen",
    title: "Super Admin Command",
    x: 610,
    y: 48,
    width: 280,
    sections: [
      { title: "Page States", tone: "state", items: ["Default", "Cross-tenant overview", "Needs attention"] },
      { title: "Data Content", tone: "data", items: ["Organizations", "WhatsApp accounts", "Usage totals", "Revenue snapshot"] },
      { title: "Actions", tone: "action", items: ["Open platform console", "Filter tenant", "Review health alerts"] }
    ]
  },
  {
    id: "tenants",
    eyebrow: "01.0 Screen",
    title: "Organizations",
    x: 115,
    y: 390,
    sections: [
      { title: "Page States", tone: "state", items: ["All tenants", "Trial", "Suspended"] },
      { title: "Data Content", tone: "data", items: ["Tenant status", "Created date", "Users", "Accounts"] },
      { title: "Actions", tone: "action", items: ["Create tenant", "Edit tenant", "Open tenant setup"] }
    ]
  },
  {
    id: "setup",
    eyebrow: "02.0 Screen",
    title: "Setup & RBAC",
    x: 445,
    y: 405,
    sections: [
      { title: "Page States", tone: "state", items: ["Organization selected", "Global admin mode"] },
      { title: "Data Content", tone: "data", items: ["Users", "Roles", "Permissions", "WhatsApp account ownership"] },
      { title: "Actions", tone: "action", items: ["Create user", "Assign role", "Provision account", "Reset access"] }
    ]
  },
  {
    id: "connector",
    eyebrow: "03.0 Screen",
    title: "WhatsApp Runtime",
    x: 780,
    y: 405,
    sections: [
      { title: "Page States", tone: "state", items: ["Connected", "QR required", "Disconnected", "Failed"] },
      { title: "Data Content", tone: "data", items: ["Connector owner", "Heartbeat", "Health score", "Session events"] },
      { title: "Actions", tone: "action", items: ["Open QR", "Retry dispatch", "Inspect session", "Reconnect"] }
    ]
  },
  {
    id: "audit",
    eyebrow: "04.0 Screen",
    title: "Audit & Compliance",
    x: 1115,
    y: 390,
    sections: [
      { title: "Page States", tone: "state", items: ["Recent activity", "Security review"] },
      { title: "Data Content", tone: "data", items: ["Actor", "Action", "Entity", "Request metadata"] },
      { title: "Actions", tone: "action", items: ["Review activity", "Trace tenant change", "Export findings"] }
    ]
  },
  {
    id: "inbox",
    eyebrow: "05.0 Screen",
    title: "Inbox Operations",
    x: 265,
    y: 760,
    sections: [
      { title: "Page States", tone: "state", items: ["Assigned", "Unassigned", "Realtime updates"] },
      { title: "Data Content", tone: "data", items: ["Conversations", "Messages", "Contact identity", "Ownership"] },
      { title: "Actions", tone: "action", items: ["Open conversation", "Assign contact", "Send reply", "Use quick reply"] }
    ]
  },
  {
    id: "sales",
    eyebrow: "06.0 Screen",
    title: "Sales Pipeline",
    x: 610,
    y: 785,
    width: 280,
    sections: [
      { title: "Page States", tone: "state", items: ["Open", "Won", "Lost", "Timeline drill-down"] },
      { title: "Data Content", tone: "data", items: ["Orders", "Revenue", "Pipeline value", "Trend buckets"] },
      { title: "Actions", tone: "action", items: ["Create order", "Update status", "Copy timeline link", "Share source"] }
    ]
  },
  {
    id: "automation",
    eyebrow: "07.0 Screen",
    title: "Automation Readiness",
    x: 955,
    y: 760,
    sections: [
      { title: "Page States", tone: "state", items: ["Manual today", "Campaign-ready", "Template-ready"] },
      { title: "Data Content", tone: "data", items: ["Quick replies", "Outbound jobs", "Receipts", "Failed dispatches"] },
      { title: "Actions", tone: "action", items: ["Retry failed jobs", "Prepare templates", "Plan broadcasts"] }
    ]
  }
];

const links: FlowLink[] = [
  { from: "platform", to: "tenants" },
  { from: "platform", to: "setup" },
  { from: "platform", to: "connector" },
  { from: "platform", to: "audit" },
  { from: "tenants", to: "inbox" },
  { from: "setup", to: "inbox" },
  { from: "setup", to: "sales" },
  { from: "connector", to: "automation" },
  { from: "audit", to: "automation", mode: "dashed" },
  { from: "inbox", to: "sales" },
  { from: "sales", to: "automation" }
];

export function SuperAdminFlowMap() {
  const [nodePositions, setNodePositions] = useState(() =>
    Object.fromEntries(nodes.map((node) => [node.id, { x: node.x, y: node.y }]))
  );
  const positionedNodes = nodes.map((node) => ({ ...node, ...nodePositions[node.id] }));

  function handleDragEnd(node: FlowNode, info: PanInfo) {
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

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-white shadow-panel">
      <div className="flex flex-col gap-4 border-b border-border bg-background-elevated px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Super Admin Map</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-text">Platform workflow dashboard</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            A board-style operating map for the platform owner: tenants, setup, connector health, inbox, sales, audit, and automation readiness in one place.
          </p>
        </div>
        <div className="rounded-full border border-border bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">
          Drag cards or scroll to explore
        </div>
      </div>

      <div className="overflow-auto bg-[#f2f3f3]">
        <div
          className="relative"
          style={{
            width: canvas.width,
            height: canvas.height,
            backgroundImage:
              "linear-gradient(rgba(20,32,51,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(20,32,51,0.055) 1px, transparent 1px)",
            backgroundSize: "62px 62px"
          }}
        >
          <svg className="pointer-events-none absolute inset-0" width={canvas.width} height={canvas.height} viewBox={`0 0 ${canvas.width} ${canvas.height}`}>
            <defs>
              <marker id="flow-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="6" refY="3">
                <path d="M0,0 L0,6 L6,3 z" fill="#142033" />
              </marker>
            </defs>
            {links.map((link) => {
              const from = findNode(positionedNodes, link.from);
              const to = findNode(positionedNodes, link.to);
              const path = buildConnectorPath(from, to);

              return (
                <path
                  key={`${link.from}-${link.to}`}
                  d={path}
                  fill="none"
                  stroke="#142033"
                  strokeDasharray={link.mode === "dashed" ? "6 8" : undefined}
                  strokeWidth="1.4"
                  markerEnd="url(#flow-arrow)"
                />
              );
            })}
          </svg>

          {positionedNodes.map((node, index) => (
            <motion.div
              key={node.id}
              className="absolute cursor-move touch-none select-none"
              drag
              dragMomentum={false}
              onDragEnd={(_, info) => handleDragEnd(node, info)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: index * 0.035 }}
              style={{ left: node.x, top: node.y, width: node.width ?? 245 }}
            >
              <FlowCard node={node} />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FlowCard({ node }: { node: FlowNode }) {
  return (
    <article className="min-h-[230px] border border-slate-200 bg-white px-5 py-5 font-mono text-[11px] leading-relaxed text-slate-900 shadow-[0_12px_30px_rgba(20,32,51,0.08)]">
      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{node.eyebrow}</p>
      <h4 className="mt-1 text-[17px] font-semibold normal-case tracking-tight text-slate-950">{node.title}</h4>

      <div className="mt-4 space-y-3">
        {node.sections.map((section) => (
          <section key={`${node.id}-${section.title}`}>
            <div className={`mb-2 w-32 px-3 py-1 text-center text-[9px] font-bold uppercase tracking-[0.08em] ${getLabelClass(section.tone)}`}>
              {section.title}
            </div>
            <ul className="ml-3 list-disc space-y-0.5 text-slate-700">
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

function getLabelClass(tone: FlowSection["tone"]) {
  switch (tone) {
    case "state":
      return "bg-[#ffcf1a] text-slate-950";
    case "data":
      return "bg-[#222222] text-white";
    case "action":
      return "bg-[#08a889] text-white";
  }
}

function findNode(flowNodes: FlowNode[], id: string) {
  const node = flowNodes.find((item) => item.id === id);

  if (!node) {
    throw new Error(`Missing flow node: ${id}`);
  }

  return node;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getNodeCenter(node: FlowNode) {
  return {
    x: node.x + (node.width ?? 245) / 2,
    y: node.y + estimatedCardHeight / 2
  };
}

function buildConnectorPath(from: FlowNode, to: FlowNode) {
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
