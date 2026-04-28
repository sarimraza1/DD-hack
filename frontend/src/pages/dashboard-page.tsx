import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Canvas {
  id: string;
  name: string;
  createdAt: string;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.canvas.list().then(setCanvases).catch(console.error);
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const canvas = await api.canvas.create(newName.trim());
      setCanvases((prev) => [canvas, ...prev]);
      setNewName("");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-svh bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <h1 className="font-heading text-xl font-bold tracking-tight">
            LIGMA
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{user?.name}</span>
            <Button variant="outline" size="sm" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-6 py-8">
        {/* Create Canvas */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>New workspace</CardTitle>
            <CardDescription>
              Create a collaborative canvas for your team
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="flex gap-3">
              <Input
                placeholder="Workspace name..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={loading || !newName.trim()}>
                {loading ? "Creating..." : "Create"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Canvas List */}
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Your workspaces
          </h2>
          {canvases.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No workspaces yet. Create one above.
            </p>
          ) : (
            canvases.map((canvas) => (
              <Card
                key={canvas.id}
                className="cursor-pointer transition-colors hover:bg-accent/50"
                onClick={() => navigate(`/canvas/${canvas.id}`)}
              >
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium">{canvas.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(canvas.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    Open
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
