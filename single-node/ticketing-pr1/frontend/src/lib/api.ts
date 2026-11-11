export const TICKET_TYPES = [
  "incident",
  "deployment",
  "access_request",
  "infra_change",
  "bug",
  "task",
] as const;
export const PRIORITIES = ["P1", "P2", "P3", "P4"] as const;
export const STATUSES = ["open", "in_progress", "blocked", "resolved", "closed"] as const;
export const ENVIRONMENTS = ["dev", "staging", "production"] as const;

export type TicketType = (typeof TICKET_TYPES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Status = (typeof STATUSES)[number];
export type Environment = (typeof ENVIRONMENTS)[number];

export interface Comment {
  id: number;
  ticket_id: number;
  author: string;
  body: string;
  created_at: string;
}

export interface Ticket {
  id: number;
  title: string;
  description: string;
  type: TicketType;
  priority: Priority;
  status: Status;
  environment: Environment;
  service: string;
  reporter: string;
  assignee: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface TicketDetail extends Ticket {
  comments: Comment[];
}

export interface TicketPage {
  items: Ticket[];
  total: number;
  limit: number;
  offset: number;
}

export interface Stats {
  total: number;
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  by_type: Record<string, number>;
  open_p1: number;
}

export type TicketCreate = Omit<
  Ticket,
  "id" | "status" | "created_at" | "updated_at" | "resolved_at"
>;
export type TicketUpdate = Partial<Omit<Ticket, "id" | "reporter" | "created_at" | "updated_at" | "resolved_at">>;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") msg = data.detail;
      else if (Array.isArray(data.detail))
        msg = data.detail.map((d: { loc?: string[]; msg: string }) => `${d.loc?.slice(-1)[0] ?? ""}: ${d.msg}`).join("; ");
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, msg);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  listTickets: (params: Record<string, string>) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "")).toString();
    return request<TicketPage>(`/tickets${qs ? `?${qs}` : ""}`);
  },
  stats: () => request<Stats>("/tickets/stats"),
  getTicket: (id: number | string) => request<TicketDetail>(`/tickets/${id}`),
  createTicket: (data: TicketCreate) =>
    request<Ticket>("/tickets", { method: "POST", body: JSON.stringify(data) }),
  updateTicket: (id: number, data: TicketUpdate) =>
    request<Ticket>(`/tickets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTicket: (id: number) => request<void>(`/tickets/${id}`, { method: "DELETE" }),
  addComment: (id: number, author: string, body: string) =>
    request<Comment>(`/tickets/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ author, body }),
    }),
};

export const label = (s: string) => s.replace(/_/g, " ");

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
