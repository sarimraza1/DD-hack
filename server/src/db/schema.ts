import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  real,
  serial,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const canvases = pgTable("canvases", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: uuid("owner_id")
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  canvasId: uuid("canvas_id")
    .references(() => canvases.id)
    .notNull(),
  sequenceNumber: serial("sequence_number").notNull(),
  type: text("type", {
    enum: [
      "YjsUpdate",
      "NodeCreated",
      "NodeUpdated",
      "NodeDeleted",
      "IntentClassified",
      "PermissionChanged",
      "CursorMoved",
      "UserJoined",
      "UserLeft",
    ],
  }).notNull(),
  payload: jsonb("payload").notNull(),
  userId: uuid("user_id").references(() => users.id),
  nodeId: text("node_id"),
  sessionId: text("session_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const nodePermissions = pgTable("node_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  nodeId: text("node_id").notNull(),
  canvasId: uuid("canvas_id")
    .references(() => canvases.id)
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  role: text("role", { enum: ["lead", "contributor", "viewer"] }).notNull(),
  grantedAt: timestamp("granted_at").defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  canvasId: uuid("canvas_id")
    .references(() => canvases.id)
    .notNull(),
  nodeId: text("node_id").notNull(),
  authorId: uuid("author_id")
    .references(() => users.id)
    .notNull(),
  text: text("text").notNull(),
  status: text("status", { enum: ["open", "in_progress", "done"] }).default(
    "open"
  ),
  confidence: real("confidence"),
  createdAt: timestamp("created_at").defaultNow(),
});
