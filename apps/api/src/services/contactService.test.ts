import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { ContactService } from "./contactService.js";

test("findOrCreateCanonicalContact prefers phone-matched contact over conflicting LID identity", async () => {
  const lidOnlyContact = {
    id: "contact-lid",
    organization_id: "org-1",
    display_name: "Vk1907",
    primary_phone_e164: null,
    primary_phone_normalized: null,
    email: null,
    company_name: null,
    notes: null,
    primary_avatar_url: null,
    identity_status: "needs_phone",
    owner_user_id: null,
    status: "active",
    merged_into_contact_id: null
  };

  const phoneMatchedContact = {
    ...lidOnlyContact,
    id: "contact-phone",
    display_name: "Unifi Business Pahang",
    primary_phone_e164: "+60183654814",
    primary_phone_normalized: "+60183654814",
    identity_status: "resolved"
  };

  const calls: { anchoredContactId: string | null; upsertContactId: string | null; createCalled: boolean } = {
    anchoredContactId: null,
    upsertContactId: null,
    createCalled: false
  };

  const contactRepository = {
    async findByNormalizedPhone() {
      return phoneMatchedContact;
    },
    async findById(_client: PoolClient, _organizationId: string, contactId: string) {
      if (contactId === lidOnlyContact.id) {
        return lidOnlyContact;
      }

      if (contactId === phoneMatchedContact.id) {
        return phoneMatchedContact;
      }

      return null;
    },
    async create() {
      calls.createCalled = true;
      return lidOnlyContact;
    },
    async anchor(_client: PoolClient, input: { contactId: string }) {
      calls.anchoredContactId = input.contactId;
      return input.contactId === phoneMatchedContact.id ? phoneMatchedContact : lidOnlyContact;
    }
  };

  const identityRepository = {
    async findByJid() {
      return {
        id: "identity-lid",
        contact_id: lidOnlyContact.id
      };
    },
    async findByNormalizedPhone() {
      return null;
    },
    async upsert(_client: PoolClient, input: { contactId: string }) {
      calls.upsertContactId = input.contactId;
      return {
        id: "identity-lid",
        contact_id: input.contactId
      };
    }
  };

  const client = {
    async query() {
      return {
        rows: [
          {
            label: null,
            display_name: null,
            account_phone_e164: null,
            account_phone_normalized: null
          }
        ]
      };
    }
  } as unknown as PoolClient;

  const service = new ContactService(contactRepository as never, identityRepository as never);

  const result = await service.findOrCreateCanonicalContact(client, {
    organizationId: "org-1",
    whatsappAccountId: "wa-1",
    whatsappJid: "30743526928518@lid",
    phoneRaw: "+60183654814",
    profileName: null
  });

  assert.equal(result.contact.id, phoneMatchedContact.id);
  assert.equal(calls.anchoredContactId, phoneMatchedContact.id);
  assert.equal(calls.upsertContactId, phoneMatchedContact.id);
  assert.equal(calls.createCalled, false);
});