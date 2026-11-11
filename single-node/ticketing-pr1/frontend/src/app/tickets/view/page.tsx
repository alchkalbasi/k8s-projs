"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { PriorityBadge, StatusBadge, Tag } from "@/components/Badges";
import {
  api,
  ApiError,
  fmtDate,
  label,
  PRIORITIES,
  STATUSES,
  type Priority,
  type Status,
  type TicketDetail,
} from "@/lib/api";

// Static export can't pre-render one page per ticket, so the id is a query param:
// /tickets/view?id=42. useSearchParams() needs a Suspense boundary in a static build.
export default function TicketDetailPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <TicketDetailView />
    </Suspense>
  );
}

function TicketDetailView() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [assignee, setAssignee] = useState("");
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!/^\d+$/.test(id)) {
      setNotFound(true);
      return;
    }
    try {
      const t = await api.getTicket(id);
      setTicket(t);
      setAssignee(t.assignee ?? "");
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true);
      else setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (notFound)
    return (
      <div className="card">
        Ticket #{id} not found. <Link href="/">Back to tickets</Link>
      </div>
    );
  if (!ticket) return error ? <div className="error">{error}</div> : <p className="muted">Loading…</p>;

  return (
    <>
      <p><Link href="/">← All tickets</Link></p>
      <div className="row" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>
          <span className="muted">#{ticket.id}</span> {ticket.title}
        </h1>
      </div>
      <div className="row" style={{ marginBottom: 20 }}>
        <PriorityBadge priority={ticket.priority} />
        <StatusBadge status={ticket.status} />
        <Tag>{label(ticket.type)}</Tag>
        <Tag>{ticket.environment}</Tag>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="detail">
        <div style={{ display: "grid", gap: 20 }}>
          <section className="card">
            <h2>Description</h2>
            <div className="description">
              {ticket.description || <span className="muted">No description.</span>}
            </div>
          </section>

          <section className="card">
            <h2>Activity ({ticket.comments.length})</h2>
            {ticket.comments.map((c) => (
              <div key={c.id} className="comment">
                <span className="who">{c.author}</span>{" "}
                <span className="muted">· {fmtDate(c.created_at)}</span>
                <div className="body">{c.body}</div>
              </div>
            ))}
            <form
              className="form"
              style={{ marginTop: 12 }}
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api.addComment(ticket.id, author, body);
                  setBody("");
                });
              }}
            >
              <input placeholder="Your name" required maxLength={100} value={author}
                onChange={(e) => setAuthor(e.target.value)} />
              <textarea placeholder="Add a comment, update, or post-mortem note…" required value={body}
                onChange={(e) => setBody(e.target.value)} style={{ minHeight: 80 }} />
              <div>
                <button className="btn btn-primary" disabled={busy}>Comment</button>
              </div>
            </form>
          </section>
        </div>

        <aside className="card meta">
          <h2>Details</h2>
          <dl>
            <dt>Status</dt>
            <dd>
              <select value={ticket.status} disabled={busy}
                onChange={(e) => run(() => api.updateTicket(ticket.id, { status: e.target.value as Status }))}>
                {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
              </select>
            </dd>
            <dt>Priority</dt>
            <dd>
              <select value={ticket.priority} disabled={busy}
                onChange={(e) => run(() => api.updateTicket(ticket.id, { priority: e.target.value as Priority }))}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </dd>
            <dt>Assignee</dt>
            <dd>
              <form className="row" style={{ gap: 6, flexWrap: "nowrap" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => api.updateTicket(ticket.id, { assignee: assignee.trim() || null }));
                }}>
                <input value={assignee} onChange={(e) => setAssignee(e.target.value)}
                  placeholder="unassigned" style={{ width: "100%", minWidth: 0 }} />
                <button className="btn" disabled={busy || assignee === (ticket.assignee ?? "")}>Save</button>
              </form>
            </dd>
            <dt>Service</dt>
            <dd>{ticket.service || <span className="muted">—</span>}</dd>
            <dt>Reporter</dt>
            <dd>{ticket.reporter}</dd>
            <dt>Created</dt>
            <dd>{fmtDate(ticket.created_at)}</dd>
            <dt>Updated</dt>
            <dd>{fmtDate(ticket.updated_at)}</dd>
            {ticket.resolved_at && (
              <>
                <dt>Resolved</dt>
                <dd>{fmtDate(ticket.resolved_at)}</dd>
              </>
            )}
          </dl>
          <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "16px 0" }} />
          <button className="btn btn-danger" disabled={busy}
            onClick={() => {
              if (confirm(`Delete ticket #${ticket.id}? This cannot be undone.`))
                run(async () => {
                  await api.deleteTicket(ticket.id);
                  router.push("/");
                });
            }}>
            Delete ticket
          </button>
        </aside>
      </div>
    </>
  );
}
