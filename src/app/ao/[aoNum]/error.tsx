"use client";

import Link from "next/link";

export default function AoError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card section">
      <p className="eyebrow">Erreur AO</p>
      <h1>Impossible d’afficher cette étape AO</h1>
      <div className="alert" role="alert">
        {error.message || "Une erreur inattendue est survenue pendant le traitement."}
      </div>
      <div className="actions-grid" style={{ marginTop: 16 }}>
        <button className="btn btn--accent" type="button" onClick={() => reset()}>
          Réessayer
        </button>
        <Link className="btn btn--ghost" href="/dashboard">
          Retour dashboard
        </Link>
      </div>
    </div>
  );
}
