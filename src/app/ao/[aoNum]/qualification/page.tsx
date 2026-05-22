import Link from "next/link";
import { notFound } from "next/navigation";
import { getAoDetail } from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import { getSheetsConfigStatus } from "@/lib/google";
import { AppShell, PageHeader, Pill } from "@/components/shell";
import { buildAoRail } from "../aoRail";
import { QualificationForm } from "./QualificationForm";

/** Évite toute optimisation statique qui pourrait retarder la mise à jour d’URL côté client au changement d’onglet rail. */
export const dynamic = "force-dynamic";
/** ZIP + extraction + IA : dépasse souvent la limite serverless par défaut (26 s sur Netlify). */
export const maxDuration = 60;

export default async function QualificationPage({
  params,
  searchParams
}: {
  params: Promise<{ aoNum: string }>;
  searchParams: Promise<{ error?: string; qualError?: string }>;
}) {
  const user = await requireUser();
  const { aoNum } = await params;
  const query = await searchParams;
  const qualError = (() => {
    if (!query.qualError) return "";
    try {
      return decodeURIComponent(query.qualError);
    } catch {
      return query.qualError;
    }
  })();
  const detail = await getAoDetail(decodeURIComponent(aoNum));
  if (!detail) notFound();
  const { ao } = detail;
  const aoHref = encodeURIComponent(ao.aoNum);
  const sheetsStatus = getSheetsConfigStatus();

  return (
    <AppShell user={user} product="AO Agent" rail={buildAoRail(aoHref, "qualification", ao.statut)}>
      <PageHeader
        eyebrow={
          <>
            Qualification BO · <span className="ao-num">{ao.displayAoNum}</span>
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

      <div className="alert" style={{ marginBottom: 16 }}>
        Chargez l’Avis et le RC en priorité (l’Avis seul ne couvre souvent que titre, montant et date ; le RC apporte
        critères et périmètre). Le CPS est utile en complément. OCR open source (Tesseract) cible d’abord le RC scanné
        sur Netlify.
      </div>
      {!sheetsStatus.configured ? (
        <div className="alert" role="status" style={{ marginBottom: 16 }}>
          <strong>Google Sheets non configuré</strong> ({sheetsStatus.missing.join(", ")}) : la fiche sera enregistrée
          en cache serveur local (temporaire sur Netlify). Ajoutez <code>GOOGLE_SHEET_ID</code> et les identifiants Google
          pour une persistance durable — ce n’est pas la cause de l’erreur « unexpected response ».
        </div>
      ) : null}
      {query.error === "fiche-ia-manquante" ? (
        <div className="alert" role="alert" style={{ marginBottom: 16 }}>
          La fiche HTML n’est pas encore disponible : relancez la qualification intelligente pour générer l’analyse IA.
        </div>
      ) : null}

      <QualificationForm aoNum={ao.aoNum} hasSourceUrl={Boolean(ao.sourceUrl)} initialError={qualError} />
    </AppShell>
  );
}
