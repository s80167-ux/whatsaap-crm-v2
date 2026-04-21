import type { PoolClient } from "pg";
import { ContactRepository } from "../repositories/contactRepository.js";
import { OrganizationUserRepository } from "../repositories/organizationUserRepository.js";
import { ProjectionService } from "./projectionService.js";

export class ContactAssignmentService {
  constructor(
    private readonly contactRepository = new ContactRepository(),
    private readonly organizationUserRepository = new OrganizationUserRepository(),
    private readonly projectionService = new ProjectionService()
  ) {}

  async assign(
    client: PoolClient,
    input: {
      organizationId: string;
      contactId: string;
      organizationUserId: string;
    }
  ) {
    const organizationUser = await this.organizationUserRepository.findById(client, input.organizationUserId);

    if (!organizationUser || organizationUser.organization_id !== input.organizationId || organizationUser.status !== "active") {
      throw new Error("Organization user not found");
    }

    const contact = await this.contactRepository.assign(client, input);

    if (!contact) {
      throw new Error("Contact not found");
    }

    await this.projectionService.refreshContact(client, contact.id);

    return contact;
  }
}
