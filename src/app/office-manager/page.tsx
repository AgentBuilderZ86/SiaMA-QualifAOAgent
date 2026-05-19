import Link from "next/link";
import { getDashboardData } from "@/lib/ao";
import { readSheet } from "@/lib/google";
import { delayLabel, numericDelaiJours, urgentByDeadline } from "@/lib/aoDeadline";
import { isPendingReassignment } from "@/lib/managerGovernance";
import { requireUser } from "@/lib/auth";
import { AppShell, PageHeader, Pill, type SideRailGroup } from "@/components/shell";
import type { AoRecord } from "@/lib/aoTypes";

export const dynamic = "force-dynamic";

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
      </div>

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
