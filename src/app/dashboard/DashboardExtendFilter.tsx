import type { DashboardPipelineFilters } from "./dashboardFilters";

function HiddenFields({ filters }: { filters: DashboardPipelineFilters }) {
  return (
    <>
      {filters.statuts.length ? <input type="hidden" name="statuts" value={filters.statuts.join(",")} /> : null}
      {filters.source ? <input type="hidden" name="source" value={filters.source} /> : null}
      {filters.manager ? <input type="hidden" name="manager" value={filters.manager} /> : null}
      {filters.client ? <input type="hidden" name="client" value={filters.client} /> : null}
      {filters.reco ? <input type="hidden" name="reco" value={filters.reco} /> : null}
      {filters.delaiMax !== undefined ? <input type="hidden" name="delai" value={String(filters.delaiMax)} /> : null}
    </>
  );
}

/** Champ texte GET pour compléter le filtre sans perdre les paramètres actuels. */
export function DashboardClientSearchForm({
  filters,
  defaultClient,
  embedded
}: {
  filters: DashboardPipelineFilters;
  defaultClient?: string;
  embedded?: boolean;
}) {
  return (
    <form method="get" action="/dashboard" className={embedded ? "filter-mini-form embedded" : "filter-mini-form"}>
      <HiddenFields filters={filters} />
      <input
        type="search"
        name="client"
        defaultValue={defaultClient || ""}
        placeholder="Client ou sujet…"
        aria-label="Filtrer par client ou sujet"
        className="filter-mini-input"
        autoComplete="off"
      />
      <button type="submit" className="btn btn--ghost btn--xs">
        Appliquer
      </button>
    </form>
  );
}
