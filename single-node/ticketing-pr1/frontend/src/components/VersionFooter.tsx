"use client";

import { useEffect, useState } from "react";

interface Version {
  version: string;
  commit: string;
}

// Baked in at build time (static export): docker build --build-arg APP_VERSION=...
const FRONTEND_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

/** Polls the backend's /version so you can watch a rolling update happen in the UI. */
export default function VersionFooter() {
  const [v, setV] = useState<Version | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data: Version = await res.json();
        if (!cancelled) {
          setV(data);
          setDown(false);
        }
      } catch {
        if (!cancelled) setDown(true);
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <footer className="footer">
      <div className="container">
        frontend v{FRONTEND_VERSION} · backend{" "}
        {v ? (
          <>
            v{v.version} <span className="tag">{v.commit}</span>
          </>
        ) : (
          "…"
        )}
        {down && <span className="footer-down"> (unreachable)</span>}
      </div>
    </footer>
  );
}
