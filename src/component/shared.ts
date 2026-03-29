import { v, type Infer } from "convex/values";

export const vStatus = v.union(
    v.literal("queued"),
    v.literal("processing"),
    v.literal("sent"),
    v.literal("failed"),
    v.literal("cancelled")
);

export type Status = Infer<typeof vStatus>;

export const vAttachment = v.object({
    filename: v.string(),
    content: v.union(v.string(), v.any()), // Base64 string or Blob-like
    contentType: v.optional(v.string()),
});

export type Attachment = Infer<typeof vAttachment>;

export const vEmailOptions = v.object({
    from: v.string(),
    to: v.union(v.string(), v.array(v.string())),
    subject: v.string(),
    text: v.optional(v.string()),
    html: v.optional(v.string()),
    cc: v.optional(v.array(v.string())),
    bcc: v.optional(v.array(v.string())),
    replyTo: v.optional(v.union(v.string(), v.array(v.string()))),
    headers: v.optional(v.record(v.string(), v.string())),
    attachments: v.optional(v.array(v.any())), // Convex attachment if possible, or use our vAttachment
});

// Since v.attachment is specific to Convex, let's use a simpler version for the SDK call
export const vOutboundEmailOptions = v.object({
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
    apiKey: v.optional(v.string()),
});

export type EmailOptions = Infer<typeof vOutboundEmailOptions>;

export const vInboundAttachment = v.object({
    filename: v.optional(v.string()),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    contentId: v.optional(v.string()),
    contentDisposition: v.optional(v.string()),
    downloadUrl: v.string(),
});

export type InboundAttachment = Infer<typeof vInboundAttachment>;

export interface InboundEmail {
    _id: string;
    _creationTime: number;
    messageId: string;
    from: string;
    to: string;
    subject: string;
    text?: string;
    html?: string;
    cc?: string[];
    bcc?: string[];
    receivedAt: number;
    attachments?: InboundAttachment[];
}

export interface OutboundEmail extends EmailOptions {
    _id: string;
    _creationTime: number;
    status: Status;
    inboundId?: string;
    error?: string;
    segment: number;
    finalizedAt?: number;
    bounced?: boolean;
    complained?: boolean;
    opened?: boolean;
    clicked?: boolean;
    deliveryDelayed?: boolean;
}

export const vInboundOptions = v.object({
    apiKey: v.optional(v.string()),
    webhookSecret: v.optional(v.string()),
    testMode: v.optional(v.boolean()),
});

export type InboundOptions = Infer<typeof vInboundOptions>;

// Email event types (from inbound.new webhooks)
export const EMAIL_EVENT_TYPES = [
    "email.sent",
    "email.delivered",
    "email.delivery_delayed",
    "email.bounced",
    "email.complained",
    "email.opened",
    "email.clicked",
] as const;

export type EmailEventType = typeof EMAIL_EVENT_TYPES[number];

export const vEmailEvent = v.object({
    type: v.string(),
    emailId: v.optional(v.string()), // Our internal email ID
    inboundId: v.string(), // Inbound.new's ID
    createdAt: v.number(),
    message: v.optional(v.string()),
});

export type EmailEvent = Infer<typeof vEmailEvent>;

// Webhook payload types (mirrored from inboundemail to avoid leaking the dependency to consumers)
export interface InboundEmailAddress {
    address: string;
    name: string | null;
}

export interface InboundAddressGroup {
    text: string;
    addresses: InboundEmailAddress[];
}

export interface InboundEmailAttachmentPayload {
    filename: string;
    contentType: string;
    size: number;
    contentId: string | null;
    contentDisposition: 'attachment' | 'inline';
    downloadUrl: string;
}

export interface InboundParsedEmailData {
    messageId: string;
    date: Date;
    subject: string;
    from: InboundAddressGroup;
    to: InboundAddressGroup;
    cc: InboundAddressGroup | null;
    bcc: InboundAddressGroup | null;
    replyTo: InboundAddressGroup | null;
    inReplyTo: string | undefined;
    references: string | string[] | undefined;
    textBody: string | null;
    htmlBody: string | null;
    raw: string;
    attachments: InboundEmailAttachmentPayload[];
    headers: Record<string, string>;
    priority: string | undefined;
}

export interface InboundCleanedContent {
    html: string | null;
    text: string | null;
    hasHtml: boolean;
    hasText: boolean;
    attachments: InboundEmailAttachmentPayload[];
    headers: Record<string, string>;
}

export interface InboundWebhookEmail {
    id: string;
    messageId: string;
    from: InboundAddressGroup;
    to: InboundAddressGroup;
    recipient: string;
    subject: string;
    receivedAt: string;
    parsedData: InboundParsedEmailData;
    cleanedContent: InboundCleanedContent;
}

export interface InboundWebhookEndpoint {
    id: string;
    name: string;
    type: 'webhook' | 'email' | 'email_group';
}

export type InboundWebhookEvent = 'email.received';

export interface InboundWebhookPayload {
    event: InboundWebhookEvent;
    timestamp: string;
    email: InboundWebhookEmail;
    endpoint: InboundWebhookEndpoint;
}

// Delivery event stored in DB
export interface DeliveryEvent {
    _id: string;
    _creationTime: number;
    emailId?: string;
    inboundId: string;
    eventType: string;
    createdAt: number;
    message?: string;
    rawEvent?: any;
}
