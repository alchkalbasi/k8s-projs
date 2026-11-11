import { label, type Priority, type Status } from "@/lib/api";

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`badge prio-${priority.toLowerCase()}`}>{priority}</span>;
}

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge status-${status}`}>{label(status)}</span>;
}

export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="tag">{children}</span>;
}
