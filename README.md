# Convex Inbound Component

[![npm version](https://badge.fury.io/js/@hamzasaleemorg%2Fconvex-inbound.svg)](https://www.npmjs.com/package/@hamzasaleemorg/convex-inbound)
[![Convex](https://img.shields.io/badge/Convex-Component-FF953F?logo=convex&logoColor=white)](https://convex.dev/components)

A drop-in [Convex Component](https://convex.dev/components) that adds full-stack email capabilities to your Convex app, powered by [inbound.new](https://inbound.new).

**Stop building email infra from scratch.** This component gives you a production-ready email backend with one line of config.

## Why use this Component?

Instead of just calling an API, this component runs **inside** your Convex backend:

*   **⚡️ Durable Sending**: Emails are queued and sent via background workers (Workpool). If the API fails, it retries automatically.
*   **📩 Threaded Inbox**: Inbound emails are stored directly in your database table with proper threading.
*   **🛡️ Idempotency**: Built-in protection against duplicate sends, even during heavy retries.
*   **🚦 Rate Limiting**: Automatically handles API limits so you never get 429s.
*   **🔒 Type-Safe**: Full TypeScript support for all events and methods.

---

## Installation

```bash
npm install @hamzasaleemorg/convex-inbound
```

## Setup

### 1. Register Component

Add it to your `convex/convex.config.ts`:

```typescript
import { defineApp } from "convex/server";
import inbound from "@hamzasaleemorg/convex-inbound/convex.config";

const app = defineApp();
app.use(inbound); // Installs the component

export default app;
```

### 2. Configure Environment

```bash
# Get your API key from inbound.new
npx convex env set INBOUND_API_KEY sk_live_...
```

### 3. Initialize Client

Create an instance in your backend (e.g., `convex/myFunctions.ts`):

```typescript
import { components } from "./_generated/api";
import { Inbound } from "@hamzasaleemorg/convex-inbound";

// Initialize with the installed component
const inbound = new Inbound(components.inbound, { testMode: false });
```

---

## Usage

### 📤 Sending Emails (Durable)

This doesn't just call an API—it schedules a durable job. It will succeed even if your function times out or the external API blips.

```typescript
export const sendWelcome = mutation({
  handler: async (ctx) => {
    await inbound.send(ctx, {
      from: "notifications@your-app.com",
      to: "user@example.com",
      subject: "Welcome to the Platform",
      html: "<p>We are glad to have you!</p>",
    });
  },
});
```

### 📩 Receiving Emails (Webhook)

Receive emails directly into your Convex database.

1.  **Expose the Webhook**:
    ```typescript
    // convex/http.ts
    import { httpRouter } from "convex/server";
    import { httpAction } from "./_generated/server";
    import { Inbound } from "@hamzasaleemorg/convex-inbound";
    import { components } from "./_generated/api";

    const http = httpRouter();
    const inbound = new Inbound(components.inbound);

    http.route({
      path: "/inbound-webhook",
      method: "POST",
      handler: httpAction(async (ctx, request) => {
        return await inbound.handleInboundWebhook(ctx, request);
      }),
    });

    export default http;
    ```

2.  **Point inbound.new to it**:
    *   URL: `https://<your-convex-deployment>.convex.site/inbound-webhook`
    *   (Optional) Set `INBOUND_WEBHOOK_SECRET` env var and add `X-Webhook-Secret` header in dashboard for security.

### 💬 Replying (Threaded)

Reply to an inbound email while maintaining the correct conversation thread (`In-Reply-To`, `References`).

```typescript
export const replyToUser = mutation({
  args: { emailId: v.id("inbound_emails") },
  handler: async (ctx, args) => {
    await inbound.reply(ctx, {
      inboundEmailId: args.emailId,
      text: "Thanks for your report! We're looking into it.",
    });
  },
});
```

### 🔍 Status & Tracking

Check if an email was delivered, bounced, or opened.

```typescript
const status = await inbound.status(ctx, emailId);

if (status.failed) {
  console.error("Email failed:", status.errorMessage);
} else if (status.opened) {
  console.log("User read the email!");
}
```

---

## API Reference

### `Inbound` Class

```typescript
const inbound = new Inbound(component, options?);
```

**Options:**
*   `apiKey` (optional): Override `INBOUND_API_KEY`.
*   `webhookSecret` (optional): Override `INBOUND_WEBHOOK_SECRET`.
*   `testMode` (default: `true`): If true, only allows sending to `@inbnd.dev` and `@example.com`.

### Methods

| Method | Returns | Description |
| :--- | :--- | :--- |
| `send(ctx, options)` | `Promise<string>` | Queues a durable email send. Returns Email ID. |
| `sendBatch(ctx, emails[])` | `Promise<string[]>` | Queues multiple emails efficiently. |
| `reply(ctx, options)` | `Promise<string>` | Replis to an inbound email with threading. |
| `status(ctx, emailId)` | `Promise<Object>` | Gets delivery status (sent, bounced, opened, etc). |
| `cancelEmail(ctx, emailId)` | `Promise<void>` | Cancels a queued email if not yet sent. |
| `listInboundEmails(ctx)` | `Promise<Email[]>` | Returns received emails. |
| `listOutboundEmails(ctx)` | `Promise<Email[]>` | Returns sent emails. |

---

## Data Management

### Automatic Cleanup via Cron

Add this to `convex/crons.ts` to keep your tables clean:

```typescript
import { cronJobs } from "convex/server";
import { components } from "./_generated/api";

const crons = cronJobs();

// Clean up old emails every hour
crons.interval(
  "cleanup-emails",
  { hours: 1 },
  components.inbound.lib.cleanupOldEmails,
  { olderThan: 7 * 24 * 60 * 60 * 1000 } // 7 days
);

export default crons;
```

---

<p align="center">
  Built for the <a href="https://convex.dev">Convex</a> Community
</p>
