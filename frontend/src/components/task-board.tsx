import { useCanvasStore, type Task } from "@/stores/canvas-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  done: "Done",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  open: "default",
  in_progress: "secondary",
  done: "outline",
};

const NEXT_STATUS: Record<string, string> = {
  open: "in_progress",
  in_progress: "done",
  done: "open",
};

export default function TaskBoard() {
  const { tasks, updateTaskStatus } = useCanvasStore();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold">Tasks</h2>
        <span className="text-xs text-muted-foreground">
          {tasks.length} item{tasks.length !== 1 ? "s" : ""}
        </span>
      </div>
      <Separator />
      <ScrollArea className="flex-1">
        {tasks.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            <p>No tasks yet.</p>
            <p className="mt-1 opacity-60">
              Type action items on sticky notes — they'll appear here
              automatically.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1 p-2">
            {tasks.map((task: Task) => (
              <div
                key={task.id}
                className="group rounded-md border border-border/50 bg-card p-3 transition-colors hover:bg-accent/30"
              >
                <p className="text-sm leading-snug">{task.text}</p>
                <div className="mt-2 flex items-center justify-between">
                  <Badge variant={STATUS_VARIANTS[task.status] || "default"}>
                    {STATUS_LABELS[task.status] || task.status}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() =>
                      updateTaskStatus(
                        task.id,
                        NEXT_STATUS[task.status] || "open"
                      )
                    }
                  >
                    → {STATUS_LABELS[NEXT_STATUS[task.status]] || "Open"}
                  </Button>
                </div>
                {task.confidence && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    AI confidence: {Math.round(task.confidence * 100)}%
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
