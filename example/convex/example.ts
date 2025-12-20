import { mutation, query } from "./_generated/server.js";
import { components } from "./_generated/api.js";
import { Inbound } from "@hamzasaleemorg/convex-inbound";
import { v } from "convex/values";

// Options:
// - apiKey: Explicitly provide API key (default: process.env.INBOUND_API_KEY)
// - webhookSecret: Webhook verification token (default: process.env.INBOUND_WEBHOOK_SECRET)
// - testMode: If true (default), only allows sending to test addresses (@inbnd.dev, @example.com)
//             Set to false to send to real addresses in production
const inbound = new Inbound(components.inbound, { testMode: false });

export const sendTestEmail = mutation({
  args: {
    to: v.string(),
    subject: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    return await inbound.send(ctx, {
      from: "Convex Inbound <agent@inbnd.dev>",
      to: args.to,
      subject: args.subject,
      text: args.text,
    });
  },
});

export const replyToEmail = mutation({
  args: {
    emailId: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    return await inbound.reply(ctx, {
      inboundEmailId: args.emailId,
      text: args.text,
    });
  },
});

export const listEmails = query({
  args: {},
  handler: async (ctx) => {
    return await inbound.listInboundEmails(ctx);
  },
});

export const listSentEmails = query({
  args: {},
  handler: async (ctx) => {
    return await inbound.listOutboundEmails(ctx);
  },
});

export const getEmailStatus = query({
  args: { emailId: v.string() },
  handler: async (ctx, args) => {
    return await inbound.getOutboundEmail(ctx, args.emailId);
  },
});
