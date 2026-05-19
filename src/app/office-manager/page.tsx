import Link from "next/link";
import { getDashboardData } from "@/lib/ao";
import { readSheet } from "@/lib/google";
import { delayLabel, numericDelaiJours, urgentByDeadline } from "@/lib/aoDeadline";
import { isPendingReassignment } from "@/lib/managerGovernance";
import { requireUser } from "@/lib/auth";
import {
  DEFAULT_ADMIN_DOCUMENTS,
  detectedLoadedFiles,
  extractAdminRequirements,
  isQualificationDocumentLoaded
} from "@/lib/adminDossier";
import { AppShell, PageHeader, Pill, type SideRailGroup } from "@/components/shell";
import type { AoRecord, QualificationFiche } from "@/lib/aoTypes";

export const dynamic = "force-dynamic";

type OfficeTodo = {
  id: string;
  category: "Réaffectation" | "Affectation" | "Qualification" | "Dossier admin" | "Échéance" | "Finance" | "Clôture";
  label: string;
  helper: string;
  href: string;
  priority: number;
};

type DuplicateGroup = {
  key: string;
  label: string;
  records: AoRecord[];
};

function managerLabel(value: string) {
  return value && value !== "Non assigné" ? value : "Non assigné";
}

function priorityLabel(ao: AoRecord) {
  if (isPendingReassignment(ao)) return "Réaffectation";
  if (!ao.manager || ao.manager === "Non assigné") return "Sans manager";
  if (urgentByDeadline(ao)) return "Urgent";
  if (ao.statut === "A QUALIFIER") return "À qualifier";
  return "Suivi";
}

function priorityClass(ao: AoRecord) {
  if (isPendingReassignment(ao)) return "office-priority--reassign";
  if (!ao.manager || ao.manager === "Non assigné") return "office-priority--unassigned";
  if (urgentByDeadline(ao)) return "office-priority--urgent";
  if (ao.statut === "A QUALIFIER") return "office-priority--qualify";
  return "office-priority--follow";
}

function sortAdminQueue(a: AoRecord, b: AoRecord) {
  const rank = (ao: AoRecord) => {
    if (isPendingReassignment(ao)) return 0;
    if (!ao.manager || ao.manager === "Non assigné") return 1;
    if (urgentByDeadline(ao)) return 2;
    if (ao.statut === "A QUALIFIER") return 3;
    return 4;
  };
  return rank(a) - rank(b) || (numericDelaiJours(a.delaiJours) ?? 999) - (numericDelaiJours(b.delaiJours) ?? 999);
}

function normalizeDataKey(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function duplicateKeyFor(ao: AoRecord) {
  const buyer = normalizeDataKey(ao.buyer || ao.client);
  const title = normalizeDataKey(ao.sujet);
  const deadline = normalizeDataKey(ao.dateLimite);
  if (!buyer || !title) return "";
  return `${buyer}|${title}|${deadline}`;
}

function findProbableDuplicates(records: AoRecord[]): DuplicateGroup[] {
  const groups = new Map<string, AoRecord[]>();
  records.forEach((ao) => {
    const key = duplicateKeyFor(ao);
    if (!key) return;
    groups.set(key, [...(groups.get(key) ?? []), ao]);
  });
  return [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({
      key,
      label: `${rows[0].client} · ${rows[0].sujet}`,
      records: rows
    }))
    .slice(0, 10);
}

function averageQuality(records: AoRecord[]) {
  const scored = records.flatMap((ao) => (ao.dataQuality ? [ao.dataQuality.completenessScore] : []));
  if (!scored.length) return null;
  return Math.round(scored.reduce((sum, score) => sum + score, 0) / scored.length);
}

function formatRunDate(value: string) {
  if (!value) return "Jamais";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(parsed));
}

function qualityTone(score: number | null) {
  if (score === null) return "is-unassigned";
  if (score >= 80) return "is-todo";
  if (score >= 50) return "is-reassign";
  return "is-urgent";
}

function hasRawValue(ao: AoRecord, field: string) {
  return Boolean(String(ao.raw?.[field] || "").trim());
}

function aoHref(ao: AoRecord, suffix = "") {
  return `/ao/${encodeURIComponent(ao.aoNum)}${suffix}`;
}

function parseQualification(ao: AoRecord): QualificationFiche | null {
  const raw = ao.raw?.["Fiche qualification"];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as QualificationFiche;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function buildAdminDocumentTodos(ao: AoRecord, startPriority: number): OfficeTodo[] {
  const fiche = parseQualification(ao);
  const loaded = isQualificationDocumentLoaded(fiche);
  const files = detectedLoadedFiles(fiche);
  const detected = extractAdminRequirements(fiche);
  const source = files.length ? `Source détectée : ${files.join(", ")}` : "Source : dossier chargé";

  if (loaded && detected.length) {
    return detected.map((piece, index) => ({
      id: `admin-detected-${index}`,
      category: "Dossier admin",
      label: `Vérifier : ${piece}`,
      helper: source,
      href: aoHref(ao, "/qualification"),
      priority: startPriority + index / 100
    }));
  }

  const helper = loaded
    ? "Document chargé, mais pièces admin non isolées automatiquement : confirmer dans le RC/CPS."
    : "Aucun CPS/RC/Avis chargé : checklist standard à confirmer selon le dossier.";

  return DEFAULT_ADMIN_DOCUMENTS.map((piece, index) => ({
    id: `admin-default-${index}`,
    category: "Dossier admin",
    label: `Contrôler : ${piece}`,
    helper,
    href: loaded ? aoHref(ao, "/qualification") : aoHref(ao, "/qualification"),
    priority: startPriority + index / 100
  }));
}

function buildOfficeTodos(ao: AoRecord): OfficeTodo[] {
  const todos: OfficeTodo[] = [];
  if (isPendingReassignment(ao)) {
    todos.push({
      id: "reassignment",
      category: "Réaffectation",
      label: `Statuer sur ${ao.recommendedManager || "le manager recommandé"}`,
      helper: ao.reassignmentJustification || "Valider ou refuser la proposition de réaffectation.",
      href: aoHref(ao, "#pilotage-manager"),
      priority: 0
    });
  }
  if (!ao.manager || ao.manager === "Non assigné") {
    todos.push({
      id: "manager",
      category: "Affectation",
      label: "Affecter un manager responsable",
      helper: "Aucun owner n'est visible sur cet AO.",
      href: aoHref(ao, "#pilotage-manager"),
      priority: 1
    });
  }
  if (ao.statut === "A QUALIFIER" || !hasRawValue(ao, "Fiche qualification")) {
    todos.push({
      id: "qualification",
      category: "Qualification",
      label: "Lancer ou compléter la qualification",
      helper: "La fiche qualification n'est pas encore consolidée.",
      href: aoHref(ao, "/qualification"),
      priority: 2
    });
  }
  todos.push(...buildAdminDocumentTodos(ao, 2.5));
  if (urgentByDeadline(ao)) {
    todos.push({
      id: "deadline",
      category: "Échéance",
      label: "Sécuriser l'échéance de réponse",
      helper: `Délai actuel : ${delayLabel(ao.delaiJours)}.`,
      href: aoHref(ao, "#pilotage-manager"),
      priority: 3
    });
  }
  if (["BO", "P2P"].includes(ao.statut) && !hasRawValue(ao, "Simulation financière")) {
    todos.push({
      id: "simulation",
      category: "Finance",
      label: "Compléter la simulation financière",
      helper: "La simulation ou la propale doit être préparée.",
      href: aoHref(ao, "/proposal"),
      priority: 4
    });
  }
  if (["PW", "PL"].includes(ao.statut) && !hasRawValue(ao, "Motif clôture")) {
    todos.push({
      id: "closure",
      category: "Clôture",
      label: "Documenter le motif de clôture",
      helper: "Capitaliser la décision pour les prochaines règles.",
      href: aoHref(ao, "/closure"),
      priority: 5
    });
  }
  return todos.sort((a, b) => a.priority - b.priority);
}

function consolidateTodos(rows: Array<{ ao: AoRecord; todos: OfficeTodo[] }>) {
  const byCategory = new Map<OfficeTodo["category"], { category: OfficeTodo["category"]; count: number; firstHref: string }>();
  rows.forEach(({ todos }) => {
    todos.forEach((todo) => {
      const current = byCategory.get(todo.category);
      byCategory.set(todo.category, {
        category: todo.category,
        count: (current?.count ?? 0) + 1,
        firstHref: current?.firstHref ?? todo.href
      });
    });
  });
  return [...byCategory.values()].sort((a, b) => b.count - a.count);
}

function kpi(label: string, value: number, helper: string) {
  return (
    <div className="kpi">
      <div className="lbl">{label}</div>
      <div className="num">{value}</div>
      <div className="delta">{helper}</div>
    </div>
  );
}

function actionCard(title: string, count: number, helper: string, href: string, tone: string) {
  return (
    <Link className={`office-action-card ${tone}`} href={href}>
      <span>{title}</span>
      <strong>{count}</strong>
      <em>{helper}</em>
    </Link>
  );
}

export default async function OfficeManagerPage() {
  const user = await requireUser();
  const data = await getDashboardData();
  const feedback = await readSheet(process.env.SHEET_FEEDBACK || "Feedback_Règles").catch(() => []);

  const pendingReassignments = data.records.filter(isPendingReassignment);
  const unassigned = data.records.filter((ao) => !ao.manager || ao.manager === "Non assigné");
  const urgent = data.records.filter(urgentByDeadline);
  const scrapedQualityScore = averageQuality(data.scrapedRecords);
  const incompleteScraped = data.scrapedRecords.filter((ao) => (ao.dataQuality?.completenessScore ?? 0) < 80);
  const missingSourceProof = data.records.filter((ao) => ao.sourceKind !== "google-sheet" && !ao.sourceUrl);
  const duplicateGroups = findProbableDuplicates(data.records);
  const adminQueue = data.records
    .filter((ao) => isPendingReassignment(ao) || ao.statut === "A QUALIFIER" || urgentByDeadline(ao) || !ao.manager || ao.manager === "Non assigné")
    .sort(sortAdminQueue)
    .slice(0, 30);
  const todoRows = data.records
    .map((ao) => ({ ao, todos: buildOfficeTodos(ao) }))
    .filter((row) => row.todos.length > 0)
    .sort((a, b) => a.todos[0].priority - b.todos[0].priority || sortAdminQueue(a.ao, b.ao));
  const todoConsolidated = consolidateTodos(todoRows);
  const openTodoCount = todoRows.reduce((sum, row) => sum + row.todos.length, 0);

  const rail: SideRailGroup[] = [
    {
      title: "Pilotage",
      items: [
        { label: "🧑‍💼 Office Manager", href: "/office-manager", active: true, count: adminQueue.length },
        { label: "📊 Pipeline", href: "/dashboard" },
        { label: "💬 SiaGPT", href: "/chat" }
      ]
    },
    {
      title: "Files admin",
      items: [
        { label: "✅ Todo consolidée", count: openTodoCount },
        { label: "🔁 Réaffectations", count: pendingReassignments.length },
        { label: "👤 Sans manager", count: unassigned.length },
        { label: "⏳ À qualifier", count: data.totals.aQualifier },
        { label: "🚨 Urgents", count: urgent.length }
      ]
    },
    {
      title: "Gouvernance",
      items: [
        { label: "📋 Audit", href: "/audit" },
        { label: "🛡 Règles", href: "/rules" },
        { label: "⚙ Référentiels", href: "/settings" }
      ]
    }
  ];

  return (
    <AppShell user={user} product="Office Manager" rail={rail}>
      <PageHeader
        eyebrow="Administration AO"
        title="Vue Office Manager"
        sub="File de traitement administrative : affectations, urgences, réaffectations et feedback manager."
        actions={
          <>
            <Link className="btn btn--ghost" href="/dashboard">
              Pipeline
            </Link>
            <Link className="btn btn--accent" href="/rules">
              Feedback règles
            </Link>
          </>
        }
      />

      <section className="office-hero">
        <div>
          <p className="eyebrow inverse">Console admin</p>
          <h2>Prioriser, affecter, débloquer</h2>
          <p>
            Commencez par les réaffectations, puis les AO sans manager et les échéances urgentes. Chaque action renvoie vers la fiche AO.
          </p>
        </div>
        <div className="office-hero__actions">
          <Link className="btn btn--accent" href="#file-admin">
            Voir la file admin
          </Link>
          <Link className="btn btn--ghost" href="/audit">
            Historique
          </Link>
        </div>
      </section>

      <div className="kpi-strip">
        {kpi("Réaffectations", pendingReassignments.length, "Propositions à statuer")}
        {kpi("Sans manager", unassigned.length, "AO à affecter")}
        {kpi("À qualifier", data.totals.aQualifier, "Dossiers administratifs ouverts")}
        {kpi("Urgents", urgent.length, "Échéances critiques")}
      </div>

      <div className="office-action-grid">
        {actionCard(
          "Réaffectations à statuer",
          pendingReassignments.length,
          "Validation du manager recommandé",
          pendingReassignments[0] ? `/ao/${encodeURIComponent(pendingReassignments[0].aoNum)}#pilotage-manager` : "#file-admin",
          "is-reassign"
        )}
        {actionCard(
          "AO sans manager",
          unassigned.length,
          "Affectation administrative",
          unassigned[0] ? `/ao/${encodeURIComponent(unassigned[0].aoNum)}#pilotage-manager` : "#file-admin",
          "is-unassigned"
        )}
        {actionCard(
          "Urgences délai",
          urgent.length,
          "Échéances à sécuriser",
          urgent[0] ? `/ao/${encodeURIComponent(urgent[0].aoNum)}#pilotage-manager` : "#file-admin",
          "is-urgent"
        )}
        {actionCard(
          "Todo ouvertes",
          openTodoCount,
          "Toutes actions à ne pas oublier",
          "#todo-office",
          "is-todo"
        )}
      </div>

      <section className="grid two-col" style={{ marginTop: 16 }}>
        <div className="card section">
          <div className="section-header">
            <div>
              <p className="eyebrow">Data quality</p>
              <h2>Qualité acquisition</h2>
            </div>
            <Link className="btn btn--ghost btn--sm" href="#scraping-runs">
              Logs sources
            </Link>
          </div>
          <div className="office-action-grid office-action-grid--compact">
            {actionCard(
              "Score sources",
              scrapedQualityScore ?? 0,
              scrapedQualityScore === null ? "Aucun AO scrappé scoré" : "Complétude moyenne",
              "#scraping-runs",
              qualityTone(scrapedQualityScore)
            )}
            {actionCard("AO incomplets", incompleteScraped.length, "Champs source à enrichir", "#data-quality-details", "is-reassign")}
            {actionCard("Preuves source", missingSourceProof.length, "URLs sources manquantes", "#data-quality-details", "is-urgent")}
            {actionCard("Doublons", duplicateGroups.length, "Groupes probables", "#duplicates", "is-unassigned")}
          </div>
          <div className="pipe-wrap" id="data-quality-details" style={{ marginTop: 12 }}>
            <table className="pipe">
              <thead>
                <tr>
                  <th>AO</th>
                  <th>Source</th>
                  <th className="r">Qualité</th>
                  <th>Alertes</th>
                </tr>
              </thead>
              <tbody>
                {incompleteScraped.slice(0, 8).map((ao) => (
                  <tr key={`${ao.sourceTab}-${ao.aoNum}-quality`}>
                    <td>
                      <Link href={aoHref(ao)}>
                        <span className="ao-num">{ao.displayAoNum}</span>
                      </Link>
                    </td>
                    <td>{ao.sourceName || ao.sourceTab}</td>
                    <td className="num">{ao.dataQuality?.completenessScore ?? 0}%</td>
                    <td>{ao.dataQuality?.warnings.join(" · ") || ao.dataQuality?.missingFields.join(", ") || "À vérifier"}</td>
                  </tr>
                ))}
                {incompleteScraped.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      Aucun AO scrappé incomplet dans le cache courant.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card section" id="scraping-runs">
          <div className="section-header">
            <div>
              <p className="eyebrow">Scraping run log</p>
              <h2>Sources acquisition</h2>
            </div>
            <span className="muted">Mode : {data.sourceMode}</span>
          </div>
          <div className="pipe-wrap">
            <table className="pipe">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Dernier run</th>
                  <th className="r">AO</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {data.sourceReport.map((source) => (
                  <tr key={source.sourceName}>
                    <td>{source.sourceName}</td>
                    <td>{formatRunDate(source.collectedAt)}</td>
                    <td className="num">{source.count}</td>
                    <td>
                      <span className={`office-priority ${source.errors.length ? "office-priority--urgent" : "office-priority--follow"}`}>
                        {source.errors.length ? `${source.errors.length} erreur(s)` : "OK"}
                      </span>
                      {source.errors.length ? <div className="muted">{source.errors.slice(0, 2).join(" · ")}</div> : null}
                    </td>
                  </tr>
                ))}
                {data.sourceReport.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      Aucun run source disponible. Déclencher un rafraîchissement depuis le dashboard.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card section" id="duplicates" style={{ marginTop: 16 }}>
        <div className="section-header">
          <div>
            <p className="eyebrow">Dédoublonnage avancé</p>
            <h2>Doublons probables à arbitrer</h2>
          </div>
          <span className="muted">{duplicateGroups.length} groupe(s)</span>
        </div>
        <div className="pipe-wrap">
          <table className="pipe">
            <thead>
              <tr>
                <th>Groupe</th>
                <th>Occurrences</th>
                <th>Sources</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {duplicateGroups.map((group) => (
                <tr key={group.key}>
                  <td>{group.label}</td>
                  <td>{group.records.length}</td>
                  <td>{[...new Set(group.records.map((ao) => ao.sourceName || ao.sourceTab))].join(" · ")}</td>
                  <td>
                    <Link className="btn btn--ghost btn--sm" href={aoHref(group.records[0])}>
                      Ouvrir référence
                    </Link>
                  </td>
                </tr>
              ))}
              {duplicateGroups.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    Aucun doublon probable détecté avec la clé acheteur + sujet + échéance.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid two-col" id="todo-office" style={{ marginTop: 16 }}>
        <div className="card section">
          <div className="section-header">
            <div>
              <p className="eyebrow">Todo consolidée</p>
              <h2>{openTodoCount} action(s) ouvertes</h2>
            </div>
          </div>
          <div className="office-todo-summary-grid">
            {todoConsolidated.map((item) => (
              <Link className="office-todo-summary-card" href={item.firstHref} key={item.category}>
                <span>{item.category}</span>
                <strong>{item.count}</strong>
                <em>Voir première action</em>
              </Link>
            ))}
            {todoConsolidated.length === 0 ? <p className="muted">Aucune action ouverte.</p> : null}
          </div>
        </div>

        <div className="card section">
          <div className="section-header">
            <div>
              <p className="eyebrow">TodoList par AO</p>
              <h2>Checklist opérationnelle</h2>
            </div>
          </div>
          <div className="office-todo-list">
            {todoRows.slice(0, 8).map(({ ao, todos }) => (
              <div className="office-todo-ao" key={`${ao.sourceTab}-${ao.aoNum}`}>
                <div className="office-todo-ao__head">
                  <strong>{ao.client}</strong>
                  <span className="ao-num">{ao.displayAoNum}</span>
                </div>
                <ul>
                  {todos.map((todo) => (
                    <li key={todo.id}>
                      <input type="checkbox" readOnly aria-label={todo.label} />
                      <div>
                        <Link href={todo.href}>{todo.label}</Link>
                        <p>{todo.helper}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {todoRows.length === 0 ? <p className="muted">Toutes les actions administratives sont couvertes.</p> : null}
          </div>
        </div>
      </section>

      <section className="card section" id="file-admin" style={{ marginTop: 16 }}>
        <div className="section-header">
          <div>
            <p className="eyebrow">File admin</p>
            <h2>AO à traiter</h2>
          </div>
          <span className="muted">{adminQueue.length} dossier(s)</span>
        </div>
        <div className="pipe-wrap">
          <table className="pipe">
            <thead>
              <tr>
                <th>Priorité</th>
                <th>AO</th>
                <th>Client / sujet</th>
                <th>Statut</th>
                <th>Manager</th>
                <th className="r">Délai</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {adminQueue.map((ao) => (
                <tr key={`${ao.sourceTab}-${ao.aoNum}`}>
                  <td>
                    <span className={`office-priority ${priorityClass(ao)}`}>{priorityLabel(ao)}</span>
                  </td>
                  <td>
                    <span className="ao-num">{ao.displayAoNum}</span>
                  </td>
                  <td>
                    <strong>{ao.client}</strong>
                    <div className="muted">{ao.sujet}</div>
                  </td>
                  <td>
                    <Pill status={ao.statut} />
                  </td>
                  <td>
                    {managerLabel(ao.manager)}
                    {ao.recommendedManager ? <div className="muted">Reco : {ao.recommendedManager}</div> : null}
                  </td>
                  <td className="num">{delayLabel(ao.delaiJours)}</td>
                  <td>
                    <Link className="btn btn--accent btn--sm" href={`/ao/${encodeURIComponent(ao.aoNum)}#pilotage-manager`}>
                      Ouvrir
                    </Link>
                  </td>
                </tr>
              ))}
              {adminQueue.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    Aucun dossier administratif prioritaire.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid two-col" style={{ marginTop: 16 }}>
        <div className="card section">
          <div className="section-header">
            <div>
              <p className="eyebrow">Charge équipe</p>
              <h2>Managers</h2>
            </div>
          </div>
          <div className="pipe-wrap">
            <table className="pipe">
              <thead>
                <tr>
                  <th>Manager</th>
                  <th className="r">AO</th>
                  <th className="r">GO</th>
                  <th className="r">Urgents</th>
                </tr>
              </thead>
              <tbody>
                {data.byManager.map((item) => (
                  <tr key={item.manager}>
                    <td>{item.manager}</td>
                    <td className="num">{item.total}</td>
                    <td className="num">{item.go}</td>
                    <td className="num">{item.urgent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card section">
          <div className="section-header">
            <div>
              <p className="eyebrow">Apprentissage</p>
              <h2>Derniers feedbacks manager</h2>
            </div>
          </div>
          <div className="pipe-wrap">
            <table className="pipe">
              <thead>
                <tr>
                  <th>AO</th>
                  <th>Décision</th>
                  <th>Motif</th>
                </tr>
              </thead>
              <tbody>
                {feedback
                  .slice(-8)
                  .reverse()
                  .map((row, index) => (
                    <tr key={`${row.ao_num}-${index}`}>
                      <td>
                        <span className="ao-num">{row.ao_num || "NC"}</span>
                      </td>
                      <td>{row.decision_manager || row.statut || "Non renseigné"}</td>
                      <td>{row.motif_manager || "Non renseigné"}</td>
                    </tr>
                  ))}
                {feedback.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="muted">
                      Aucun feedback enregistré.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
