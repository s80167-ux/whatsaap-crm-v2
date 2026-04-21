import { z } from "zod";
import { pool } from "../config/database.js";
import { AuthService } from "../services/authService.js";

const argsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["super_admin", "org_admin", "manager", "agent", "user"]).default("org_admin"),
  organizationId: z.string().uuid().nullable().default(null),
  fullName: z.string().nullable().default(null)
});

function parseArgs() {
  const rawArgs = process.argv.slice(2);
  const values: Record<string, string> = {};

  for (let index = 0; index < rawArgs.length; index += 2) {
    const key = rawArgs[index]?.replace(/^--/, "");
    const value = rawArgs[index + 1];

    if (key && value) {
      values[key] = value;
    }
  }

  return argsSchema.parse({
    email: values.email,
    password: values.password,
    role: values.role,
    organizationId: values.organizationId === "null" ? null : values.organizationId ?? null,
    fullName: values.fullName ?? null
  });
}

async function main() {
  const input = parseArgs();
  const authService = new AuthService();
  const user = await authService.createUser({
    organizationId: input.organizationId,
    email: input.email,
    fullName: input.fullName,
    password: input.password,
    role: input.role
  });

  console.log(
    JSON.stringify(
      {
        id: user.id,
        authUserId: user.auth_user_id,
        email: user.email,
        role: user.role,
        organizationId: user.organization_id,
        status: user.status
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
