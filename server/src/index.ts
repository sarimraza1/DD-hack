import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { authRoutes } from "./routes/auth";
import { canvasRoutes } from "./routes/canvas";
import { setupWebSocket } from "./ws/handler";

const port = parseInt(process.env.PORT || "3000");

let app = new Elysia()
  .use(cors({ origin: true, credentials: true }))
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET || "fallback-dev-secret",
      exp: "7d",
    })
  )
  .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
  .use(authRoutes)
  .use(canvasRoutes);

app = setupWebSocket(app) as any;

app.listen(port);

console.log(`🦊 LIGMA server running at http://localhost:${port}`);
