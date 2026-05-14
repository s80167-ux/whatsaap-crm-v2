import { spawn } from "node:child_process";

const serviceName = process.env.RAILWAY_SERVICE_NAME ?? "";

const serviceCommands = new Map([
  ["campaign-dispatch-worker", ["run", "worker:campaign-dispatch"]],
  ["message-outbox-worker", ["run", "worker:message-outbox"]],
  ["whatsapp-connector", ["--workspace", "apps/whatsapp-connector", "start"]],
  ["whatsaap-crm-v2", ["--workspace", "apps/api", "start"]]
]);

const args = serviceCommands.get(serviceName) ?? ["--workspace", "apps/api", "start"];
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

console.log(`Starting Railway service "${serviceName || "default"}" with: npm ${args.join(" ")}`);

if (process.env.START_RAILWAY_SERVICE_DRY_RUN === "true") {
  process.exit(0);
}

const child = spawn(npmCommand, args, {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
