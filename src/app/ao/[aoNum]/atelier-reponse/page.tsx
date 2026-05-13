import Link from "next/link";
import { notFound } from "next/navigation";
import { getAoDetail, atelierStrategieFromPipeline } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { hasConfiguredLlm } from "@/lib/llmChat";
import { AppShell, PageHeader, Pill } from "@/components/shell";
import { buildAoRail } from "../aoRail";
import { AtelierClient } from "./AtelierClient";

export const dynamic = "force-dynamic";

export default async function AtelierReponsePage({ params }: { params: Promise<{ aoNum: string }> }) {
  const user = await requireUser();
  const { aoNum } = await params;
  const decoded = decodeURIComponent(aoNum);
  const detail = await getAoDetail(decoded);
  if (!detail) notFound();
  const { ao, pipeline } = detail;
  const aoHref = encodeURIComponent(ao.aoNum);
  const eligible = ao.statut === "BO" || ao.statut === "P2P";
  const atelier = atelierStrategieFromPipeline(pipeline ?? undefined);
  const llmConfigured = hasConfiguredLlm();

  if (!eligible) {
    return (
      <AppShell user={user} product="AO Agent" rail={buildAoRail(aoHref, "atelier", ao.statut)}>
        <PageHeader
          eyebrow={
            <>
              Atelier · <span className="ao-num">{ao.displayAoNum}</span>
            </>
          }
          title={ao.client}
          sub={ao.sujet}
          actions={
            <>
              <Pill status={ao.statut} />
              <Link className="btn btn--ghost" href={`/ao/${aoHref}`}>
                ← Retour AO
              </Link>
            </>
          }
        />
        <section className="card section">
          <h2>Phase non éligible</h2>
          <p className="muted">
            L&apos;atelier stratégie et chiffrage est ouvert uniquement pour les AO en phase <strong>BO</strong> ou <strong>P2P</strong>{" "}
            (réponse / propale).
          </p>
          <p style={{ marginTop: 8 }}>
            Statut actuel : <Pill status={ao.statut} />
          </p>
          <p style={{ marginTop: 16 }}>
            <Link className="btn btn--accent" href={`/ao/${aoHref}/proposal`}>
              Aller à Simulation &amp; propale
            </Link>
          </p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell user={user} product="AO Agent" rail={buildAoRail(aoHref, "atelier", ao.statut)}>
      <PageHeader
        eyebrow={
          <>
            Atelier réponse · <span className="ao-num">{ao.displayAoNum}</span>
          </>
        }
        title={ao.client}
        sub={ao.sujet}
        actions={
          <>
            <Pill status={ao.statut} />
            <Link className="btn btn--ghost" href={`/ao/${aoHref}`}>
              ← Retour AO
            </Link>
            <Link className="btn btn--ghost" href={`/ao/${aoHref}/proposal`}>
              Simulation &amp; propale
            </Link>
          </>
        }
      />

      <p className="t-meta muted" style={{ marginBottom: 16 }}>
        Échangez avec le LLM sur la stratégie de réponse et le chiffrage ; le bloc de droite permet de contrôler ce qui sera écrit dans
        Google Sheets avant validation.
      </p>

      <AtelierClient
        aoNum={ao.aoNum}
        aoHref={aoHref}
        initialMessages={atelier.messages}
        initialDraft={atelier.lastDraft}
        llmConfigured={llmConfigured}
      />
    </AppShell>
  );
}
