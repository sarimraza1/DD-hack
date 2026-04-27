const API_BASE = "http://localhost:3000";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem("ligma_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }

  return res.json();
}

export const api = {
  auth: {
    register: (data: { email: string; name: string; password: string }) =>
      request<{ user: any; token: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    login: (data: { email: string; password: string }) =>
      request<{ user: any; token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
  canvas: {
    create: (name: string) =>
      request<any>("/canvas", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    list: () => request<any[]>("/canvas"),
    get: (id: string) => request<any>(`/canvas/${id}`),
    events: (id: string, after?: number) =>
      request<any[]>(`/canvas/${id}/events${after ? `?after=${after}` : ""}`),
    tasks: (id: string) => request<any[]>(`/canvas/${id}/tasks`),
    setPermission: (
      canvasId: string,
      data: { nodeId: string; userId: string; role: string }
    ) =>
      request<any>(`/canvas/${canvasId}/permissions`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
};
