import Link from "next/link";
import type { DashboardData } from "@/lib/aoService";
import {
  dashboardPathWithFilters,
  managersMatch,
  patchPipelineFilters,
  type DashboardPipelineFilters
} from "./dashboardFilters";
import {
  computeDashboardStatusCounts,
  DASHBOARD_STATUS_FILTER_ITEMS,
  statusCountFor,
  type DashboardActiveView
} from "./dashboardRail";

function basePathForView(active: DashboardActiveView): string {
  if (active === "calendrier") return "/dashboard/calendrier";
  if (active === "stats") return "/dashboard/stats";
  return "/dashboard";
}

/** Filtres statut / manager visibles sous 980px (rail masqué). */
export function DashboardMobileFilters({
  data,
  active,
  filters
}: {
  data: DashboardData;
  active: DashboardActiveView;
  filters: DashboardPipelineFilters;
}) {
  const path = basePathForView(active);
  const c = computeDashboardStatusCounts(data);
  const isStatutActive = (st: string) => filters.statuts.length === 1 && filters.statuts[0] === st;

  return (
    <details className="dash-mobile-filters">
      <summary className="dash-mobile-filters__summary">Filtres pipeline (statuts · managers)</summary>
      <div className="dash-mobile-filters__body">
        <p className="t-meta" style={{ marginBottom: 8 }}>
          Même navigation que le rail gauche sur grand écran.
        </p>
        <div className="dash-mobile-filters__grp">Statuts</div>
        <div className="dash-mobile-filters__links">
          {DASHBOARD_STATUS_FILTER_ITEMS.map(({ label, statut }) => {
            const merged = patchPipelineFilters(filters, { statuts: [statut], manager: null, client: null, reco: null, delaiMax: null });
            const n = statusCountFor(statut, c);
            return (
              <Link
                key={statut}
                className={`dash-mobile-filters__link${isStatutActive(statut) ? " on" : ""}`}
                href={dashboardPathWithFilters(path, merged)}
              >
                {label} <span className="count">({n})</span>
              </Link>
            );
          })}
        </div>
        <div className="dash-mobile-filters__grp">Managers</div>
        <div className="dash-mobile-filters__links">
          {data.byManager.slice(0, 8).map((m) => {
            const merged = patchPipelineFilters(filters, { manager: m.manager, reco: null, delaiMax: null });
            const on = Boolean(filters.manager && managersMatch(m.manager, filters.manager));
            return (
              <Link key={m.manager} className={`dash-mobile-filters__link${on ? " on" : ""}`} href={dashboardPathWithFilters(path, merged)}>
                {m.manager} <span className="count">({m.total})</span>
              </Link>
            );
          })}
        </div>
      </div>
    </details>
  );
}
