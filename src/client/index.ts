import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  FunctionReference,
} from "convex/server";
import { type InboundWebhookPayload } from "inboundemail";
import type { ComponentApi } from "../component/_generated/component.js";
import type { InboundEmail, OutboundEmail, EmailOptions, InboundOptions, Attachment, InboundAttachment, EmailEvent, DeliveryEvent } from "../component/shared.js";
import { vEmailEvent } from "../component/shared.js";

export type { InboundEmail, OutboundEmail, EmailOptions, InboundOptions, Attachment, InboundAttachment, EmailEvent, DeliveryEvent };
export { vEmailEvent };

// Extended options including onEmailEvent callback
export interface InboundClientOptions extends InboundOptions {
  onEmailEvent?: FunctionReference<"mutation", "internal", { emailId: string; event: EmailEvent }>;
}

export class Inbound {
  private onEmailEvent?: FunctionReference<"mutation", "internal", { emailId: string; event: EmailEvent }>;

  constructor(
    private component: ComponentApi,
    private config: InboundClientOptions = {}
  ) {
    this.onEmailEvent = config.onEmailEvent;
  }

  /**
   * Handles an incoming webhook from Inbound.new.
   * This should be called from an httpAction in your app.
   * 
   * Verification is done by comparing X-Webhook-Verification-Token header
   * with the INBOUND_WEBHOOK_SECRET environment variable.
   */
  async handleInboundWebhook(
    ctx: GenericMutationCtx<GenericDataModel> | GenericActionCtx<GenericDataModel>,
    request: Request
  ): Promise<Response> {
    // Optional webhook verification using custom header
    // In inbound.new dashboard, add a Custom Header: X-Webhook-Secret = your_secret
    // Then set: npx convex env set INBOUND_WEBHOOK_SECRET your_secret
    const webhookSecret = this.config.webhookSecret ?? process.env.INBOUND_WEBHOOK_SECRET;

    if (webhookSecret) {
      const headerValue = request.headers.get("X-Webhook-Secret");
      if (headerValue !== webhookSecret) {
        return new Response("Unauthorized", { status: 401 });
      }
    }
    // If no secret configured, allow the webhook (inbound.new doesn't provide built-in verification)

    const payload = (await request.json()) as InboundWebhookPayload;

    // Check if it's an email received event
    if (payload.email) {
      const { email } = payload;

      // Save to component's database
      await ctx.runMutation(this.component.lib.saveInboundEmail, {
        messageId: email.id,
        from: email.from?.text ?? "unknown",
        to: email.to?.text ?? "unknown",
        subject: email.subject ?? "(no subject)",
        text: email.parsedData.textBody ?? undefined,
        html: email.parsedData.htmlBody ?? undefined,
        cc: email.parsedData.cc?.addresses.map(a => a.address).filter((a): a is string => !!a),
        bcc: email.parsedData.bcc?.addresses.map(a => a.address).filter((a): a is string => !!a),
        receivedAt: Date.now(),
        attachments: email.parsedData.attachments.map(a => ({
          filename: a.filename,
          contentType: a.contentType,
          size: a.size,
          contentId: a.contentId,
          contentDisposition: a.contentDisposition,
          downloadUrl: a.downloadUrl,
        })),
      });
    }

    return new Response("OK", { status: 200 });
  }

  /**
   * Sends an email via Inbound.new.
   * This queues the email for durable background sending.
   * 
   * In testMode (default true), only test addresses are allowed.
   */
  async send(
    ctx: GenericMutationCtx<GenericDataModel> | GenericActionCtx<GenericDataModel>,
    options: EmailOptions
  ): Promise<string> {
    // Validate testMode for all recipients
    this.validateTestMode(options.to, options.cc, options.bcc);

    const apiKey = this.config.apiKey ?? process.env.INBOUND_API_KEY;
    const args = { ...options, apiKey };
    return (await ctx.runMutation(this.component.lib.sendEmail, args)) as string;
  }

  /**
   * Alias for send() - matches common email API patterns.
   */
  async sendEmail(
    ctx: GenericMutationCtx<GenericDataModel> | GenericActionCtx<GenericDataModel>,
    options: EmailOptions
  ): Promise<string> {
    return this.send(ctx, options);
  }

  /**
   * Sends multiple emails in a batch.
   * More efficient than calling send() multiple times.
   * 
   * Returns an array of email IDs for tracking.
   * 
   * In testMode (default true), only test addresses are allowed.
   */
  async sendBatch(
    ctx: GenericMutationCtx<GenericDataModel> | GenericActionCtx<GenericDataModel>,
    emails: EmailOptions[]
  ): Promise<string[]> {
    const emailIds: string[] = [];

    for (const options of emails) {
      // Validate testMode for each email
      this.validateTestMode(options.to);

      const apiKey = this.config.apiKey ?? process.env.INBOUND_API_KEY;
      const args = { ...options, apiKey };
      const emailId = (await ctx.runMutation(this.component.lib.sendEmail, args)) as string;
      emailIds.push(emailId);
    }

    return emailIds;
  }

  /**
   * Replies to an existing inbound email.
   */
  async reply(
    ctx: GenericMutationCtx<GenericDataModel> | GenericActionCtx<GenericDataModel>,
    args: {
      inboundEmailId: string;
      text?: string;
      html?: string;
      attachments?: Attachment[];
    }
  ): Promise<string> {
    const apiKey = this.config.apiKey ?? process.env.INBOUND_API_KEY;
    const callArgs = { ...args, apiKey };
    return (await ctx.runMutation(this.component.lib.replyEmail, callArgs)) as string;
  }

  /**
   * Lists received emails.
   */
  async listInboundEmails(
    ctx: GenericQueryCtx<GenericDataModel> | GenericActionCtx<GenericDataModel>,
    args: { limit?: number } = {}
  ): Promise<InboundEmail[]> {
    return (await ctx.runQuery(this.component.lib.listInboundEmails, args)) as InboundEmail[];
  }

  /**
   * Lists sent (outbound) emails.
   */
  async listOutboundEmails(
    ctx: GenericQueryCtx<GenericDataModel> | GenericActionCtx<GenericDataModel>,
    args: { limit?: number } = {}
  ): Promise<OutboundEmail[]> {
    return (await ctx.runQuery(this.component.lib.listOutboundEmails, args)) as OutboundEmail[];
  }

  /**
   * Gets details of an outbound email.
   */
  async getOutboundEmail(
    ctx: GenericQueryCtx<GenericDataModel> | GenericActionCtx<GenericDataModel>,
    emailId: string
  ): Promise<OutboundEmail | null> {
    return (await ctx.runQuery(this.component.lib.getEmailById as any, { emailId })) as OutboundEmail | null;
  }

  /**
   * Gets the status of an email including tracking information.
   * Returns null if the email doesn't exist.
   */
  async status(
    ctx: GenericQueryCtx<GenericDataModel> | GenericActionCtx<GenericDataModel>,
    emailId: string
  ): Promise<{
    status: "queued" | "processing" | "sent" | "failed" | "cancelled";
    failed: boolean;
    bounced: boolean;
    complained: boolean;
    opened: boolean;
    clicked: boolean;
    deliveryDelayed: boolean;
    errorMessage: string | null;
    finalizedAt?: number;
  } | null> {
    const email = await this.getOutboundEmail(ctx, emailId);
    if (!email) return null;
    return {
      status: email.status,
      failed: email.status === "failed",
      bounced: email.bounced ?? false,
      complained: email.complained ?? false,
      opened: email.opened ?? false,
      clicked: email.clicked ?? false,
      deliveryDelayed: email.deliveryDelayed ?? false,
      errorMessage: email.error ?? null,
      finalizedAt: email.finalizedAt,
    };
  }

  /**
   * Cancels a queued email.
   * Throws if the email has already been sent or failed.
   */
  async cancelEmail(
    ctx: GenericMutationCtx<GenericDataModel> | GenericActionCtx<GenericDataModel>,
    emailId: string
  ): Promise<{ success: boolean; message: string }> {
    return (await ctx.runMutation(this.component.lib.cancelEmail as any, { emailId })) as { success: boolean; message: string };
  }

  /**
   * Validates if an email address is allowed in testMode.
   * In testMode, only @inbnd.dev and @example.com addresses are allowed.
   */
  private isTestAddress(email: string | string[]): boolean {
    const addresses = Array.isArray(email) ? email : [email];
    const testDomains = ["inbnd.dev", "example.com"];
    return addresses.every((addr) => {
      const domain = addr.split("@").pop()?.toLowerCase();
      return domain && testDomains.includes(domain);
    });
  }

  /**
   * Checks if testMode is enabled and validates all recipient addresses.
   */
  private validateTestMode(
    to: string | string[],
    cc?: string[],
    bcc?: string[]
  ): void {
    // testMode defaults to true for safety
    const testMode = this.config.testMode ?? true;
    if (!testMode) return;

    const allRecipients = [
      ...(Array.isArray(to) ? to : [to]),
      ...(cc ?? []),
      ...(bcc ?? []),
    ];

    for (const addr of allRecipients) {
      if (!this.isTestAddress(addr)) {
        throw new Error(
          `testMode is enabled. Email address "${addr}" is not a valid test address. ` +
          "Only @inbnd.dev and @example.com addresses are allowed. " +
          "Set testMode: false in your Inbound options to send to real addresses."
        );
      }
    }
  }

  /**
   * Lists delivery events for an email or all emails.
   */
  async listDeliveryEvents(
    ctx: GenericQueryCtx<GenericDataModel> | GenericActionCtx<GenericDataModel>,
    args: { emailId?: string; limit?: number } = {}
  ): Promise<DeliveryEvent[]> {
    return (await ctx.runQuery(this.component.lib.listDeliveryEvents as any, args)) as DeliveryEvent[];
  }
}
