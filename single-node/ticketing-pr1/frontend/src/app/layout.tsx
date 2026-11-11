import type { Metadata } from "next";
import Link from "next/link";
import VersionFooter from "@/components/VersionFooter";
import "./globals.css";

export const metadata: Metadata = {
  title: "DevOps Tickets",
  description: "Ticketing system for DevOps incidents, deployments and infra changes",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="container topbar-inner">
            <Link href="/" className="brand">
              ⚙ DevOps Tickets
            </Link>
            <nav>
              <Link href="/">Tickets</Link>
              <Link href="/tickets/new" className="btn btn-primary">
                + New ticket
              </Link>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
        <VersionFooter />
      </body>
    </html>
  );
}
