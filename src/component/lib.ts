import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server.js";
import { Workpool } from "@convex-dev/workpool";
import { RateLimiter } from "@convex-dev/rate-limiter";
import { api, components, internal } from "./_generated/api.js";
import { vOutboundEmailOptions, vStatus, vAttachment } from "./shared.js";
import Inbound from "inboundemail";

const SEGMENT_MS = 125;
const EMAIL_POOL_SIZE = 4;
const INBOUND_ONE_CALL_EVERY_MS = 100; // Rate limit safety
const BATCH_SIZE = 50;
const BASE_BATCH_DELAY = 100; // Buffer for bursts

const emailWorkpool = new Workpool(components.emailWorkpool as any, {
  maxParallelism: EMAIL_POOL_SIZE,
});

const inboundApiRateLimiter = new RateLimiter(components.rateLimiter as any, {
  inboundApi: {
    kind: "fixed window",
    period: INBOUND_ONE_CALL_EVERY_MS,
    rate: 1,
  },
});

function getSegment(now: number) {
  return Math.floor(now / SEGMENT_MS);
}

export const getInboundEmail = query({
  args: { messageId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("inbound_emails")
      .withIndex("by_messageId", (q) => q.eq("messageId", args.messageId))
      .unique();
  },
});

export const saveInboundEmail = mutation({
  args: {
    messageId: v.string(),
    from: v.string(),
    to: v.string(),
    subject: v.string(),
    text: v.optional(v.string()),
    html: v.optional(v.string()),
    cc: v.optional(v.array(v.string())),
    bcc: v.optional(v.array(v.string())),
    receivedAt: v.number(),
    attachments: v.optional(v.array(v.any())),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("inbound_emails")
      .withIndex("by_messageId", (q) => q.eq("messageId", args.messageId))
      .unique();
    if (existing) return existing._id;

    return await ctx.db.insert("inbound_emails", {
      messageId: args.messageId,
      from: args.from,
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
      cc: args.cc,
      bcc: args.bcc,
      receivedAt: args.receivedAt,
      attachments: args.attachments,
    });
  },
});

export const sendEmail = mutation({
  args: vOutboundEmailOptions,
  handler: async (ctx, args) => {
    const { apiKey, ...emailData } = args;
    const now = Date.now();
    const emailId = await ctx.db.insert("outbound_emails", {
      ...emailData,
      status: "queued",
      segment: getSegment(now),
    });

    await scheduleBatchRun(ctx, apiKey);
    return emailId;
  },
});

export const replyEmail = mutation({
  args: v.object({
    inboundEmailId: v.id("inbound_emails"),
    text: v.optional(v.string()),
    html: v.optional(v.string()),
    attachments: v.optional(v.array(vAttachment)),
    apiKey: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const original = await ctx.db.get(args.inboundEmailId);
    if (!original) throw new Error("Original email not found");

    const now = Date.now();
    const emailId = await ctx.db.insert("outbound_emails", {
      from: original.to,
      to: original.from,
      subject: original.subject.startsWith("Re:")
        ? original.subject
        : `Re: ${original.subject}`,
      text: args.text,
      html: args.html,
      attachments: args.attachments,
      headers: {
        "In-Reply-To": original.messageId,
        "References": original.messageId,
      },
      status: "queued",
      segment: getSegment(now),
    });

    await scheduleBatchRun(ctx, args.apiKey);
    return emailId;
  },
});

/**
 * Singleton batch scheduler.
 * Ensures only one "makeBatch" is scheduled/running at a time.
 */
async function scheduleBatchRun(ctx: MutationCtx, apiKey?: string) {
  // Check if worker running
  const existing = await ctx.db.query("nextBatchRun").unique();
  if (existing) return;

  // Schedule new one
  const runId = await ctx.scheduler.runAfter(BASE_BATCH_DELAY, internal.lib.makeBatch, {
    apiKey
  });
  await ctx.db.insert("nextBatchRun", { runId });
}

/**
 * The Singleton Worker.
 * Picks up queued emails and sends them to the workpool.
 * Re-schedules itself if there is more work.
 */
export const makeBatch = internalMutation({
  args: {
    apiKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Fetch a batch of queued emails
    const emails = await ctx.db
      .query("outbound_emails")
      .withIndex("by_status_segment", (q) => q.eq("status", "queued"))
      .take(BATCH_SIZE);

    if (emails.length === 0) {
      // No work? Delete lock and exit.
      const existing = await ctx.db.query("nextBatchRun").unique();
      if (existing) await ctx.db.delete(existing._id);
      return;
    }

    // 2. Mark as processing (lock them)
    const emailIds = [];
    for (const email of emails) {
      await ctx.db.patch(email._id, { status: "processing" });
      emailIds.push(email._id);
    }

    // 3. Enqueue actions in chunks to utilize parallelism
    const CHUNK_SIZE = 10;
    for (let i = 0; i < emailIds.length; i += CHUNK_SIZE) {
      const chunk = emailIds.slice(i, i + CHUNK_SIZE);
      await emailWorkpool.enqueueAction(
        ctx,
        internal.lib.performBatchSend,
        {
          emailIds: chunk,
          apiKey: args.apiKey,
        },
        {
          retry: {
            maxAttempts: 5,
            initialBackoffMs: 1000,
            base: 2,
          },
          context: { emailIds: chunk },
          onComplete: internal.lib.onEmailComplete,
        }
      );
    }

    // 4. Re-schedule self immediately to drain queue (Recursive loop)
    const runId = await ctx.scheduler.runAfter(0, internal.lib.makeBatch, {
      apiKey: args.apiKey,
    });

    // Update lock with new runId
    const existing = await ctx.db.query("nextBatchRun").unique();
    if (existing) {
      await ctx.db.patch(existing._id, { runId });
    } else {
      await ctx.db.insert("nextBatchRun", { runId });
    }
  },
});

export const onEmailComplete = emailWorkpool.defineOnComplete({
  context: v.object({
    emailIds: v.array(v.id("outbound_emails")),
  }),
  handler: async (ctx, args) => {
    // If the action failed (exhausted retries), mark all emails in this batch as failed
    if (args.result.kind === "failed") {
      const error = args.result.error;
      for (const emailId of args.context.emailIds) {
        // Only update if still processing (don't overwrite sent ones if partial success?)
        // Actually performBatchSend updates individually. If the action threw, it means the *loop* threw.
        // Some might have been sent before the throw. We should only fail the "processing" ones.
        const email = await ctx.db.get(emailId);
        if (email && email.status === "processing") {
          await ctx.db.patch(emailId, {
            status: "failed",
            error: `Batch failed: ${error}`,
            finalizedAt: Date.now(),
          });
        }
      }
    }
    // If canceled, fail them too
    if (args.result.kind === "canceled") {
      for (const emailId of args.context.emailIds) {
        const email = await ctx.db.get(emailId);
        if (email && email.status === "processing") {
          await ctx.db.patch(emailId, {
            status: "failed",
            error: "Batch cancelled",
            finalizedAt: Date.now(),
          });
        }
      }
    }
  },
});

/**
 * Sends a batch of emails efficiently.
 * This reduces the number of action invocations by processing multiple emails at once.
 */
export const performBatchSend = internalAction({
  args: {
    emailIds: v.array(v.id("outbound_emails")),
    apiKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const apiKey = args.apiKey ?? process.env.INBOUND_API_KEY;
    if (!apiKey) {
      throw new Error(
        "INBOUND_API_KEY is not set. Please set it using: " +
        "npx convex env set INBOUND_API_KEY <your-key> --component inbound"
      );
    }

    const client = new Inbound({ apiKey });

    // Process each email in the batch
    for (const emailId of args.emailIds) {
      const email = await ctx.runQuery(api.lib.getEmailById, { emailId });
      // Only process if it's in the 'processing' state (locked by the mutation)
      if (!email || email.status !== "processing") continue;

      // Rate limit between emails
      const limit = await inboundApiRateLimiter.limit(ctx, "inboundApi", {
        reserve: true,
      });
      if (!limit.ok) {
        await new Promise((resolve) =>
          setTimeout(resolve, limit.retryAfter ?? 100)
        );
      }

      try {
        const response = await client.emails.send({
          from: email.from,
          to: email.to,
          subject: email.subject,
          text: email.text,
          html: email.html,
          cc: email.cc,
          bcc: email.bcc,
          reply_to: email.replyTo,
          attachments: email.attachments?.map(a => ({
            filename: a.filename,
            content: a.content as string,
            content_type: a.contentType,
          })),
          headers: {
            ...email.headers,
            "Idempotency-Key": emailId,
          },
        });

        await ctx.runMutation(internal.lib.updateEmailStatus, {
          emailId,
          status: "sent",
          inboundId: response.id,
        });
      } catch (e: any) {
        const msg = e.message || "";
        // Temporary errors that should trigger a retry
        if (
          msg.includes("Rate limit exceeded") ||
          msg.includes("Unauthorized") ||
          msg.includes("500") ||
          msg.includes("502") ||
          msg.includes("503") ||
          msg.includes("504")
        ) {
          console.error(`Temporary failure sending email ${emailId}: ${msg}. Retrying...`);
          throw e; // Let Convex handle the retry with backoff
        }

        await ctx.runMutation(internal.lib.updateEmailStatus, {
          emailId,
          status: "failed",
          error: e.message,
        });
      }
    }
  },
});

export const getEmailById = query({
  args: { emailId: v.id("outbound_emails") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.emailId);
  },
});

export const updateEmailStatus = internalMutation({
  args: {
    emailId: v.id("outbound_emails"),
    status: vStatus,
    inboundId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.emailId, {
      status: args.status,
      inboundId: args.inboundId,
      error: args.error,
      finalizedAt: Date.now(),
    });
  },
});

export const listInboundEmails = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("inbound_emails")
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const listOutboundEmails = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("outbound_emails")
      .order("desc")
      .take(args.limit ?? 100);
  },
});

/**
 * Cancels a queued email if it hasn't been sent yet.
 */
export const cancelEmail = mutation({
  args: { emailId: v.id("outbound_emails") },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.emailId);
    if (!email) {
      throw new Error("Email not found");
    }
    if (email.status !== "queued") {
      throw new Error(`Cannot cancel email with status: ${email.status}`);
    }
    await ctx.db.patch(args.emailId, {
      status: "cancelled",
      finalizedAt: Date.now(),
    });
    return { success: true, message: "Email cancelled" };
  },
});

/**
 * Cleans up old finalized emails (sent, failed, cancelled).
 * Default: older than 7 days.
 */
export const cleanupOldEmails = internalMutation({
  args: { olderThan: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const olderThan = args.olderThan ?? 7 * 24 * 60 * 60 * 1000; // 7 days
    const cutoff = Date.now() - olderThan;

    const oldEmails = await ctx.db
      .query("outbound_emails")
      .withIndex("by_finalizedAt", (q) => q.lt("finalizedAt", cutoff))
      .take(100);

    let deleted = 0;
    for (const email of oldEmails) {
      if (email.status !== "queued") {
        await ctx.db.delete(email._id);
        deleted++;
      }
    }
    return { deleted };
  },
});

/**
 * Cleans up abandoned emails (queued but never processed).
 * Default: older than 4 weeks.
 */
export const cleanupAbandonedEmails = internalMutation({
  args: { olderThan: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const olderThan = args.olderThan ?? 4 * 7 * 24 * 60 * 60 * 1000; // 4 weeks
    const cutoff = Date.now() - olderThan;

    const abandonedEmails = await ctx.db
      .query("outbound_emails")
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "queued"),
          q.eq(q.field("status"), "processing")
        )
      )
      .take(500);

    let deleted = 0;
    for (const email of abandonedEmails) {
      if (email._creationTime < cutoff) {
        await ctx.db.patch(email._id, {
          status: "failed",
          error: "Abandoned - never processed",
          finalizedAt: Date.now(),
        });
        deleted++;
      }
    }
    return { marked: deleted };
  },
});

/**
 * Cleans up old inbound emails.
 * Default: older than 30 days.
 */
export const cleanupOldInboundEmails = internalMutation({
  args: { olderThan: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const olderThan = args.olderThan ?? 30 * 24 * 60 * 60 * 1000; // 30 days
    const cutoff = Date.now() - olderThan;

    const oldEmails = await ctx.db
      .query("inbound_emails")
      .filter((q) => q.lt(q.field("receivedAt"), cutoff))
      .take(100);

    let deleted = 0;
    for (const email of oldEmails) {
      await ctx.db.delete(email._id);
      deleted++;
    }
    return { deleted };
  },
});

/**
 * Handles an email event from inbound.new webhook.
 * Stores the event and updates email tracking status.
 */
export const handleEmailEvent = mutation({
  args: {
    inboundId: v.string(),
    eventType: v.string(),
    message: v.optional(v.string()),
    rawEvent: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Find the email by inboundId
    const email = await ctx.db
      .query("outbound_emails")
      .withIndex("by_inboundId", (q) => q.eq("inboundId", args.inboundId))
      .unique();

    // Store the delivery event
    const eventId = await ctx.db.insert("delivery_events", {
      emailId: email?._id,
      inboundId: args.inboundId,
      eventType: args.eventType,
      createdAt: Date.now(),
      message: args.message,
      rawEvent: args.rawEvent,
    });

    // Update email tracking status if we found the email
    if (email) {
      const updates: Record<string, boolean> = {};
      switch (args.eventType) {
        case "email.delivered":
          // Email delivered successfully
          break;
        case "email.bounced":
          updates.bounced = true;
          break;
        case "email.complained":
          updates.complained = true;
          break;
        case "email.opened":
          updates.opened = true;
          break;
        case "email.clicked":
          updates.clicked = true;
          break;
        case "email.delivery_delayed":
          updates.deliveryDelayed = true;
          break;
      }
      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(email._id, updates);
      }
    }

    return { eventId, emailId: email?._id };
  },
});

/**
 * Lists delivery events for an email.
 */
export const listDeliveryEvents = query({
  args: { emailId: v.optional(v.id("outbound_emails")), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if (args.emailId) {
      return await ctx.db
        .query("delivery_events")
        .withIndex("by_emailId", (q) => q.eq("emailId", args.emailId))
        .order("desc")
        .take(args.limit ?? 50);
    }
    return await ctx.db
      .query("delivery_events")
      .order("desc")
      .take(args.limit ?? 50);
  },
});
