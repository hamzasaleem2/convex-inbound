import { defineComponent } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import workpool from "@convex-dev/workpool/convex.config";

const component = defineComponent("inbound");

component.use(rateLimiter, { name: "rateLimiter" });
component.use(workpool, { name: "emailWorkpool" });

export default component;
