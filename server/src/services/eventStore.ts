import { db } from "../db/db";
import { events } from "../db/schema";
import { eq, gt, and, asc } from "drizzle-orm";

type EventType =
  | "YjsUpdate"
  | "NodeCreated"
  | "NodeUpdated"
  | "NodeDeleted"
  | "IntentClassified"
  | "PermissionChanged"
  | "CursorMoved"
  | "UserJoined"
  | "UserLeft";

export async function appendEvent(
  canvasId: string,
  type: EventType,
  payload: Record<string, unknown>,
  userId?: string,
  nodeId?: string,
  sessionId?: string
) {
  const [event] = await db
    .insert(events)
    .values({ canvasId, type, payload, userId, nodeId, sessionId })
    .returning();
  return event;
}

export async function getEvents(
  canvasId: string,
  afterSequence?: number,
  limit = 100
) {
  const conditions = [eq(events.canvasId, canvasId)];
  if (afterSequence) {
    conditions.push(gt(events.sequenceNumber, afterSequence));
  }

  return db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(asc(events.sequenceNumber))
    .limit(limit);
}
