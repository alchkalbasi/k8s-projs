"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  api,
  ENVIRONMENTS,
  label,
  PRIORITIES,
  TICKET_TYPES,
  type TicketCreate,
} from "@/lib/api";

const INITIAL: TicketCreate = {
  title: "",
  description: "",
  type: "incident",
  priority: "P3",
  environment: "production",
  service: "",
  reporter: "",
  assignee: "",
};

export default function NewTicketPage() {
  const router = useRouter();
  const [form, setForm] = useState<TicketCreate>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set =
    (k: keyof TicketCreate) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const t = await api.createTicket({ ...form, assignee: form.assignee?.trim() || null });
      router.push(`/tickets/view?id=${t.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <>
      <h1>New ticket</h1>
      {error && <div className="error">{error}</div>}
      <form className="form card" onSubmit={submit}>
        <div className="field">
          <label htmlFor="title">Title *</label>
          <input id="title" required minLength={3} maxLength={200} value={form.title} onChange={set("title")}
            placeholder="e.g. Payment API returning 503 in production" />
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="type">Type</label>
            <select id="type" value={form.type} onChange={set("type")}>
              {TICKET_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="priority">Priority</label>
            <select id="priority" value={form.priority} onChange={set("priority")}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="environment">Environment</label>
            <select id="environment" value={form.environment} onChange={set("environment")}>
              {ENVIRONMENTS.map((env) => <option key={env} value={env}>{env}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="service">Service / component</label>
            <input id="service" maxLength={100} value={form.service} onChange={set("service")} placeholder="e.g. payments-api" />
          </div>
          <div className="field">
            <label htmlFor="reporter">Reporter *</label>
            <input id="reporter" required maxLength={100} value={form.reporter} onChange={set("reporter")} />
          </div>
          <div className="field">
            <label htmlFor="assignee">Assignee</label>
            <input id="assignee" maxLength={100} value={form.assignee ?? ""} onChange={set("assignee")} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea id="description" value={form.description} onChange={set("description")}
            placeholder="What happened? Impact, steps to reproduce, links to dashboards/logs, rollback plan…" />
        </div>

        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Creating…" : "Create ticket"}
          </button>
          <button type="button" className="btn" onClick={() => router.back()}>Cancel</button>
        </div>
      </form>
    </>
  );
}
