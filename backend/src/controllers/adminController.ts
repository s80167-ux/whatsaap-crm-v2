import type { Request, Response } from "express";
import { z } from "zod";
import { AdminService } from "../services/adminService.js";

const adminService = new AdminService();

const createOrganizationSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).optional().nullable()
});

const createUserSchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  email: z.string().email(),
  fullName: z.string().min(1).optional().nullable(),
  password: z.string().min(8),
  role: z.enum(["super_admin", "org_admin", "manager", "agent", "user"])
});

const createWhatsAppAccountSchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  name: z.string().min(2),
  phoneNumber: z.string().min(6).optional().nullable()
});

export async function listOrganizations(_req: Request, res: Response) {
  const organizations = await adminService.listOrganizations();
  return res.json({ data: organizations });
}

export async function createOrganization(req: Request, res: Response) {
  const input = createOrganizationSchema.parse(req.body);
  const organization = await adminService.createOrganization(input);
  return res.status(201).json({ data: organization });
}

export async function listOrganizationUsers(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const organizationId = typeof req.query.organization_id === "string" ? req.query.organization_id : undefined;
  const users = await adminService.listUsers(req.auth, organizationId);
  return res.json({ data: users });
}

export async function createOrganizationUser(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const input = createUserSchema.parse(req.body);
  const user = await adminService.createUser(req.auth, {
    ...input,
    fullName: input.fullName ?? null
  });
  return res.status(201).json({
    data: {
      id: user.id,
      organizationId: user.organization_id,
      authUserId: user.auth_user_id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      status: user.status
    }
  });
}

export async function listWhatsAppAccounts(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const organizationId = typeof req.query.organization_id === "string" ? req.query.organization_id : undefined;
  const accounts = await adminService.listWhatsAppAccounts(req.auth, organizationId);
  return res.json({ data: accounts });
}

export async function createWhatsAppAccount(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const input = createWhatsAppAccountSchema.parse(req.body);
  const account = await adminService.createWhatsAppAccount(req.auth, {
    ...input,
    phoneNumber: input.phoneNumber ?? null
  });
  return res.status(201).json({ data: account });
}
