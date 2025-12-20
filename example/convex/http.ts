import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { Inbound } from "@hamzasaleemorg/convex-inbound";
import { components } from "./_generated/api";

const http = httpRouter();
const inbound = new Inbound(components.inbound);

http.route({
  path: "/api/inbound/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    return await inbound.handleInboundWebhook(ctx, request);
  }),
});

export default http;
