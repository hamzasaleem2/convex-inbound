import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initConvexTest } from "./setup.test";
import { api } from "./_generated/api";

describe("example", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  test("sendTestEmail and listEmails", async () => {
    const t = initConvexTest();

    // Test sending an email (which queues it)
    const emailId = await t.mutation(api.example.sendTestEmail, {
      to: "test@example.com",
      subject: "Hello",
      text: "World",
    });
    expect(emailId).toBeDefined();

    // Check status
    const status = await t.query(api.example.getEmailStatus, { emailId });
    expect(status?.status).toBe("queued");

    // In a real test we might want to trigger the background worker,
    // but for now we've successfully tested the component integration.

    const emails = await t.query(api.example.listEmails, {});
    // This lists inbound emails, initially empty
    expect(emails).toHaveLength(0);
  });
});
