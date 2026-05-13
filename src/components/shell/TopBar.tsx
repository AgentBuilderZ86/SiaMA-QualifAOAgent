import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

function buildRunStamp(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}`;
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function avatarInitials(email: string | null | undefined): string {
  if (!email) return "··";
  const local = email.split("@")[0] || "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

export function TopBar({
  product = "AO Agent",
  user,
  searchSlot,
  metaSlot,
  rightSlot
}: {
  product?: string;
  user?: string | null;
  searchSlot?: ReactNode;
  metaSlot?: ReactNode;
  rightSlot?: ReactNode;
}) {
  const now = new Date();
  const week = getWeekNumber(now);
  const dateLabel = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(now);
  const runStamp = buildRunStamp(now);

  return (
    <header className="topbar">
      <Link href="/dashboard" className="brand" aria-label="Sia · AO Agent">
        <Image src="/brand/sia-mark-white.svg" alt="Sia" width={64} height={22} priority />
        <span className="product">SiaGPT · {product}</span>
      </Link>
      {searchSlot ? (
        searchSlot
      ) : (
        <form className="search" method="get" action="/dashboard" role="search" aria-label="Recherche pipeline">
          <span aria-hidden="true">🔍</span>
          <input
            name="client"
            type="search"
            placeholder="Client ou sujet (filtre pipeline)…"
            aria-label="Filtrer le pipeline par client ou sujet"
            autoComplete="off"
          />
          <button type="submit" className="search-submit" title="Appliquer le filtre sur le pipeline">
            →
          </button>
        </form>
      )}
      {metaSlot ? (
        metaSlot
      ) : (
        <div className="meta">
          <span>Sem. {week} · {dateLabel}</span>
          <span>·</span>
          <span>Run #{runStamp}</span>
        </div>
      )}
      {rightSlot}
      <div className="avatar" title={user ?? ""} aria-label={user ?? "utilisateur"}>
        {avatarInitials(user)}
      </div>
    </header>
  );
}
