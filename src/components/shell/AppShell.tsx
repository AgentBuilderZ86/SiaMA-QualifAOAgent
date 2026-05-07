import type { ReactNode } from "react";
import { TopBar } from "./TopBar";
import { SideRail, type SideRailGroup } from "./SideRail";

export function AppShell({
  user,
  product,
  rail,
  railTopSlot,
  searchSlot,
  metaSlot,
  topbarRightSlot,
  fullBleed,
  children
}: {
  user?: string | null;
  product?: string;
  rail?: SideRailGroup[] | null;
  railTopSlot?: ReactNode;
  searchSlot?: ReactNode;
  metaSlot?: ReactNode;
  topbarRightSlot?: ReactNode;
  fullBleed?: boolean;
  children: ReactNode;
}) {
  const hasRail = Array.isArray(rail) && rail.length > 0;
  return (
    <div className="app-shell">
      <TopBar
        user={user ?? null}
        product={product}
        searchSlot={searchSlot}
        metaSlot={metaSlot}
        rightSlot={topbarRightSlot}
      />
      <div className={`shell-body${hasRail ? "" : " no-rail"}`}>
        {hasRail ? <SideRail groups={rail!} topSlot={railTopSlot} /> : null}
        <main className="main" style={fullBleed ? { padding: 0 } : undefined}>
          {fullBleed ? children : <div className="main-inner">{children}</div>}
        </main>
      </div>
    </div>
  );
}
