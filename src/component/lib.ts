import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
} from "./_generated/server.js";
import { Workpool } from "@convex-dev/workpool";
import { RateLimiter } from "@convex-dev/rate-limiter";
import { api, components, internal } from "./_generated/api.js";
import { vOutboundEmailOptions, vStatus, vAttachment } from "./shared.js";
import { Inbound } from "@inboundemail/sdk";

const SEGMENT_MS = 125;
const EMAIL_POOL_SIZE = 4;
const INBOUND_ONE_CALL_EVERY_MS = 100; // Rate limit safety

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
    await ctx.scheduler.runAfter(0, internal.lib.processQueue, {
      segment: getSegment(now),
      apiKey,
    });
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

    await ctx.scheduler.runAfter(0, internal.lib.processQueue, {
      segment: getSegment(now),
      apiKey: args.apiKey,
    });
    return emailId;
  },
});

export const processQueue = internalMutation({
  args: {
    segment: v.number(),
    apiKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const emails = await ctx.db
      .query("outbound_emails")
      .withIndex("by_status_segment", (q) =>
        q.eq("status", "queued").eq("segment", args.segment)
      )
      .take(100); // Limit batch size

    if (emails.length === 0) return;

    // Batch emails into groups (max 10 per batch for efficiency)
    const BATCH_SIZE = 10;
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batchIds = emails.slice(i, i + BATCH_SIZE).map(e => e._id);
      await emailWorkpool.enqueueAction(ctx, internal.lib.performBatchSend, {
        emailIds: batchIds,
        apiKey: args.apiKey,
      });
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

    const client = new Inbound(apiKey);

    // Process each email in the batch
    for (const emailId of args.emailIds) {
      const email = await ctx.runQuery(api.lib.getEmailById, { emailId });
      if (!email || email.status !== "queued") continue;

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
          replyTo: email.replyTo,
          attachments: email.attachments?.map(a => ({
            filename: a.filename,
            content: a.content as string,
            contentType: a.contentType,
          })),
          headers: {
            ...email.headers,
            "Idempotency-Key": emailId,
          },
        });

        if (response.error) {
          throw new Error(response.error);
        }

        await ctx.runMutation(internal.lib.updateEmailStatus, {
          emailId,
          status: "sent",
          inboundId: response.data?.id,
        });
      } catch (e: any) {
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
      .filter((q) => q.eq(q.field("status"), "queued"))
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
