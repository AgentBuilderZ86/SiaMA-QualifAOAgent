import Link from "next/link";
import { getDashboardData } from "@/lib/ao";
import { readSheet } from "@/lib/google";
import { delayLabel, numericDelaiJours, urgentByDeadline } from "@/lib/aoDeadline";
import { isPendingReassignment } from "@/lib/managerGovernance";
import { requireUser } from "@/lib/auth";
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

const DEFAULT_ADMIN_DOCUMENTS = [
  "CPS / cahier des prescriptions spéciales",
  "RC / règlement de consultation",
  "Avis d'appel d'offres ou lettre de consultation",
  "Acte d'engagement / déclaration sur l'honneur",
  "Attestations fiscales, sociales et registre de commerce",
  "Bordereau des prix / offre financière",
  "Caution provisoire si le RC l'exige"
] as const;

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

function isDocumentLoaded(fiche: QualificationFiche | null) {
  if (!fiche) return false;
  const name = String(fiche.documentName || "").trim();
  const extract = String(fiche.documentExtract || "").trim();
  return Boolean(name || (extract && extract !== "Non trouvé dans le document."));
}

function detectedLoadedFiles(fiche: QualificationFiche | null) {
  if (!fiche?.documentExtract) return [];
  const files = [...fiche.documentExtract.matchAll(/--- Fichier ZIP :\s*([^-]+?)\s*---/g)]
    .map((match) => match[1]?.trim())
    .filter(Boolean);
  if (files.length) return [...new Set(files)].slice(0, 6);
  return fiche.documentName ? [fiche.documentName] : [];
}

function cleanRequirement(value: string) {
  return value
    .replace(/^[\s:;,\-.•\d)]+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

function extractAdminRequirements(fiche: QualificationFiche | null) {
  const text = String(fiche?.documentExtract || "");
  if (!text || text === "Non trouvé dans le document.") return [];
  const candidates = new Set<string>();
  const lines = text.split(/\n+/).map(cleanRequirement).filter(Boolean);
  const keyword =
    /(pi[eè]ces?|documents?|dossier administratif|attestation|certificat|caution|registre de commerce|cnss|fiscal|acte d'engagement|déclaration sur l'honneur|bordereau|offre financière|offre technique|r[èe]glement de consultation|cps|rc|avis d'appel)/i;

  lines.forEach((line, index) => {
    if (!keyword.test(line)) return;
    candidates.add(line);
    const next = cleanRequirement(lines[index + 1] || "");
    if (next && next.length < 120 && !/^(article|chapitre|section)\b/i.test(next)) candidates.add(next);
  });

  return [...candidates].filter((item) => item.length >= 8).slice(0, 8);
}

function buildAdminDocumentTodos(ao: AoRecord, startPriority: number): OfficeTodo[] {
  const fiche = parseQualification(ao);
  const loaded = isDocumentLoaded(fiche);
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
