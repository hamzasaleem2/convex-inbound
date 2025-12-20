/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    lib: {
      cancelEmail: FunctionReference<
        "mutation",
        "internal",
        { emailId: string },
        any,
        Name
      >;
      getEmailById: FunctionReference<
        "query",
        "internal",
        { emailId: string },
        any,
        Name
      >;
      getInboundEmail: FunctionReference<
        "query",
        "internal",
        { messageId: string },
        any,
        Name
      >;
      handleEmailEvent: FunctionReference<
        "mutation",
        "internal",
        {
          eventType: string;
          inboundId: string;
          message?: string;
          rawEvent?: any;
        },
        any,
        Name
      >;
      listDeliveryEvents: FunctionReference<
        "query",
        "internal",
        { emailId?: string; limit?: number },
        any,
        Name
      >;
      listInboundEmails: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        any,
        Name
      >;
      listOutboundEmails: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        any,
        Name
      >;
      replyEmail: FunctionReference<
        "mutation",
        "internal",
        {
          apiKey?: string;
          attachments?: Array<{
            content: string | any;
            contentType?: string;
            filename: string;
          }>;
          html?: string;
          inboundEmailId: string;
          text?: string;
        },
        any,
        Name
      >;
      saveInboundEmail: FunctionReference<
        "mutation",
        "internal",
        {
          attachments?: Array<any>;
          bcc?: Array<string>;
          cc?: Array<string>;
          from: string;
          html?: string;
          messageId: string;
          receivedAt: number;
          subject: string;
          text?: string;
          to: string;
        },
        any,
        Name
      >;
      sendEmail: FunctionReference<
        "mutation",
        "internal",
        {
          apiKey?: string;
          attachments?: Array<{
            content: string | any;
            contentType?: string;
            filename: string;
          }>;
          bcc?: Array<string>;
          cc?: Array<string>;
          from: string;
          headers?: Record<string, string>;
          html?: string;
          replyTo?: string | Array<string>;
          subject: string;
          text?: string;
          to: string | Array<string>;
        },
        any,
        Name
      >;
    };
  };
