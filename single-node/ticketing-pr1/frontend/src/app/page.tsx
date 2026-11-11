"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PriorityBadge, StatusBadge, Tag } from "@/components/Badges";
import {
  api,
  ENVIRONMENTS,
  fmtDate,
  label,
  PRIORITIES,
  STATUSES,
  TICKET_TYPES,
  type Stats,
  type TicketPage,
} from "@/lib/api";

const EMPTY_FILTERS = { q: "", status: "", priority: "", type: "", environment: "" };

export default function TicketsPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState<TicketPage | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (f: typeof EMPTY_FILTERS) => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([api.listTickets(f), api.stats()]);
      setPage(p);
      setStats(s);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => load(filters), 250);
    return () => clearTimeout(t);
  }, [filters, load]);

  const set = (k: keyof typeof EMPTY_FILTERS) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <h1>Tickets</h1>

      {error && <div className="error">Failed to load tickets: {error}</div>}

      {stats && (
        <section className="stats">
          <div className="card stat">
            <div className="value">{stats.total}</div>
            <div className="name">Total</div>
          </div>
          <div className={`card stat ${stats.open_p1 > 0 ? "alert" : ""}`}>
            <div className="value">{stats.open_p1}</div>
            <div className="name">Open P1</div>
          </div>
          {STATUSES.map((s) => (
            <div key={s} className="card stat">
              <div className="value">{stats.by_status[s] ?? 0}</div>
              <div className="name">{label(s)}</div>
            </div>
          ))}
        </section>
      )}

      <section className="row filters">
        <input
          type="search"
          placeholder="Search title, description, service…"
          value={filters.q}
          onChange={set("q")}
        />
        <select value={filters.status} onChange={set("status")} aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{label(s)}</option>
          ))}
        </select>
        <select value={filters.priority} onChange={set("priority")} aria-label="Priority">
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select value={filters.type} onChange={set("type")} aria-label="Type">
          <option value="">All types</option>
          {TICKET_TYPES.map((t) => (
            <option key={t} value={t}>{label(t)}</option>
          ))}
        </select>
        <select value={filters.environment} onChange={set("environment")} aria-label="Environment">
          <option value="">All environments</option>
          {ENVIRONMENTS.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <button className="btn" onClick={() => setFilters(EMPTY_FILTERS)}>Reset</button>
      </section>

      <div className="card table-wrap" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Title</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Type</th>
              <th>Env</th>
              <th>Service</th>
              <th>Assignee</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {page?.items.map((t) => (
              <tr key={t.id}>
                <td className="muted">{t.id}</td>
                <td className="title">
                  <Link href={`/tickets/view?id=${t.id}`}>{t.title}</Link>
                </td>
                <td><PriorityBadge priority={t.priority} /></td>
                <td><StatusBadge status={t.status} /></td>
                <td><Tag>{label(t.type)}</Tag></td>
                <td>{t.environment}</td>
                <td>{t.service || <span className="muted">—</span>}</td>
                <td>{t.assignee || <span className="muted">unassigned</span>}</td>
                <td className="muted">{fmtDate(t.updated_at)}</td>
              </tr>
            ))}
            {!loading && page?.items.length === 0 && (
              <tr>
                <td colSpan={9} className="muted" style={{ textAlign: "center", padding: 32 }}>
                  No tickets found. <Link href="/tickets/new">Create one</Link>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {page && page.total > page.items.length && (
        <p className="muted">Showing {page.items.length} of {page.total} tickets.</p>
      )}
    </>
  );
}
