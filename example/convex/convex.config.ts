import { defineApp } from "convex/server";
import inbound from "@hamzasaleemorg/convex-inbound/convex.config.js";

const app = defineApp();
app.use(inbound, { name: "inbound" });

export default app;
