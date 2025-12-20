import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { vStatus, vAttachment, vInboundAttachment } from "./shared.js";

export default defineSchema({
  inbound_emails: defineTable({
    messageId: v.string(), // Inbound.new message ID
    from: v.string(),
    to: v.string(),
    subject: v.string(),
    text: v.optional(v.string()),
    html: v.optional(v.string()),
    cc: v.optional(v.array(v.string())),
    bcc: v.optional(v.array(v.string())),
    receivedAt: v.number(),
    attachments: v.optional(v.array(vInboundAttachment)),
  }).index("by_messageId", ["messageId"]),

  outbound_emails: defineTable({
    from: v.string(),
    to: v.union(v.string(), v.array(v.string())),
    subject: v.string(),
    text: v.optional(v.string()),
    html: v.optional(v.string()),
    cc: v.optional(v.array(v.string())),
    bcc: v.optional(v.array(v.string())),
    replyTo: v.optional(v.union(v.string(), v.array(v.string()))),
    headers: v.optional(v.record(v.string(), v.string())),
    attachments: v.optional(v.array(vAttachment)),
    status: vStatus,
    inboundId: v.optional(v.string()), // ID from inbound.new after sending
    error: v.optional(v.string()),
    segment: v.number(),
    finalizedAt: v.optional(v.number()),
    // Tracking fields (updated via webhooks)
    bounced: v.optional(v.boolean()),
    complained: v.optional(v.boolean()),
    opened: v.optional(v.boolean()),
    clicked: v.optional(v.boolean()),
    deliveryDelayed: v.optional(v.boolean()),
  })
    .index("by_status_segment", ["status", "segment"])
    .index("by_finalizedAt", ["finalizedAt"])
    .index("by_inboundId", ["inboundId"]),

  // Delivery events from inbound.new webhooks
  delivery_events: defineTable({
    emailId: v.optional(v.id("outbound_emails")), // Link to our email
    inboundId: v.string(), // Inbound.new's email ID
    eventType: v.string(), // e.g., "email.delivered", "email.bounced", "email.opened"
    createdAt: v.number(),
    message: v.optional(v.string()), // Additional details (e.g., bounce reason)
    rawEvent: v.optional(v.any()), // Full event payload for debugging
  })
    .index("by_emailId", ["emailId"])
    .index("by_inboundId", ["inboundId"]),
});
