import { Elysia, t } from "elysia";
import { db } from "../db/db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export const authRoutes = new Elysia({ prefix: "/auth" })
  .post(
    "/register",
    async ({ body, set, ...rest }) => {
      const jwt = (rest as any).jwt;
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, body.email))
        .limit(1);

      if (existing.length > 0) {
        set.status = 409;
        return { error: "Email already registered" };
      }

      const passwordHash = await bcrypt.hash(body.password, 10);
      const [user] = await db
        .insert(users)
        .values({
          email: body.email,
          name: body.name,
          passwordHash,
        })
        .returning({ id: users.id, email: users.email, name: users.name });

      const token = await jwt.sign({
        sub: user.id,
        email: user.email,
        name: user.name,
      });

      return { user, token };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        name: t.String({ minLength: 1 }),
        password: t.String({ minLength: 6 }),
      }),
    }
  )
  .post(
    "/login",
    async ({ body, set, ...rest }) => {
      const jwt = (rest as any).jwt;
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, body.email))
        .limit(1);

      if (!user) {
        set.status = 401;
        return { error: "Invalid credentials" };
      }

      const valid = await bcrypt.compare(body.password, user.passwordHash);
      if (!valid) {
        set.status = 401;
        return { error: "Invalid credentials" };
      }

      const token = await jwt.sign({
        sub: user.id,
        email: user.email,
        name: user.name,
      });

      return {
        user: { id: user.id, email: user.email, name: user.name },
        token,
      };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 1 }),
      }),
    }
  );
