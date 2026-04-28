import { Elysia, t } from "elysia";
import { db } from "../db/db";
import { canvases, tasks, nodePermissions } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { getEvents } from "../services/eventStore";

export const canvasRoutes = new Elysia({ prefix: "/canvas" })
  .derive(async ({ headers, set, ...rest }) => {
    const jwt = (rest as any).jwt;
    const auth = headers.authorization?.replace("Bearer ", "");
    if (!auth) {
      set.status = 401;
      throw new Error("Unauthorized");
    }
    const payload = await jwt.verify(auth);
    if (!payload) {
      set.status = 401;
      throw new Error("Invalid token");
    }
    return { userId: payload.sub as string, userName: payload.name as string };
  })
  .post(
    "/",
    async ({ body, userId }) => {
      const [canvas] = await db
        .insert(canvases)
        .values({ name: body.name, ownerId: userId })
        .returning();
      return canvas;
    },
    {
      body: t.Object({ name: t.String({ minLength: 1 }) }),
    }
  )
  .get("/", async ({ userId }) => {
    return db.select().from(canvases).where(eq(canvases.ownerId, userId));
  })
  .get("/:id", async ({ params, set }) => {
    const [canvas] = await db
      .select()
      .from(canvases)
      .where(eq(canvases.id, params.id))
      .limit(1);

    if (!canvas) {
      set.status = 404;
      return { error: "Canvas not found" };
    }

    const permissions = await db
      .select()
      .from(nodePermissions)
      .where(eq(nodePermissions.canvasId, params.id));

    return { canvas, permissions };
  })
  .get(
    "/:id/events",
    async ({ params, query }) => {
      const after = query.after ? parseInt(query.after) : undefined;
      return getEvents(params.id, after);
    },
    {
      query: t.Object({ after: t.Optional(t.String()) }),
    }
  )
  .get("/:id/tasks", async ({ params }) => {
    return db.select().from(tasks).where(eq(tasks.canvasId, params.id));
  })
  .post(
    "/:id/permissions",
    async ({ params, body, userId, set }) => {
      // Verify requester is canvas owner (lead)
      const [canvas] = await db
        .select()
        .from(canvases)
        .where(eq(canvases.id, params.id))
        .limit(1);

      if (!canvas || canvas.ownerId !== userId) {
        set.status = 403;
        return { error: "Only canvas owner can set permissions" };
      }

      const [perm] = await db
        .insert(nodePermissions)
        .values({
          canvasId: params.id,
          nodeId: body.nodeId,
          userId: body.userId,
          role: body.role,
        })
        .returning();
      return perm;
    },
    {
      body: t.Object({
        nodeId: t.String(),
        userId: t.String(),
        role: t.Union([
          t.Literal("lead"),
          t.Literal("contributor"),
          t.Literal("viewer"),
        ]),
      }),
    }
  );
