import { useCanvasStore } from "@/stores/canvas-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const EVENT_COLORS: Record<string, string> = {
  NodeCreated: "text-emerald-500",
  NodeUpdated: "text-blue-500",
  NodeDeleted: "text-red-400",
  IntentClassified: "text-amber-500",
  UserJoined: "text-green-400",
  UserLeft: "text-zinc-400",
  PermissionChanged: "text-purple-400",
};

export default function EventLog() {
  const events = useCanvasStore((s) => s.events);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold">Event Log</h2>
        <span className="text-xs text-muted-foreground">
          {events.length} event{events.length !== 1 ? "s" : ""}
        </span>
      </div>
      <Separator />
      <ScrollArea className="flex-1">
        {events.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            Events will appear here as you interact with the canvas.
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 p-2">
            {events.map((event: any, i: number) => (
              <div
                key={event?.id || i}
                className="rounded px-3 py-1.5 text-xs hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono font-medium ${EVENT_COLORS[event?.type] || "text-muted-foreground"}`}
                  >
                    {event?.type || "Unknown"}
                  </span>
                  <span className="text-muted-foreground">
                    #{event?.sequenceNumber}
                  </span>
                </div>
                {event?.nodeId && (
                  <span className="text-[10px] text-muted-foreground">
                    node: {event.nodeId.slice(0, 8)}…
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
