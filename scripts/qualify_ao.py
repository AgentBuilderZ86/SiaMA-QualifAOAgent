#!/usr/bin/env python3
"""
qualify_ao.py — Pipeline Python standalone : ZIP/PDF/DOCX → fiche qualification HTML.

Usage:
    python scripts/qualify_ao.py <fichier>
    python scripts/qualify_ao.py <fichier> --output-dir /tmp/fiches
    python scripts/qualify_ao.py <fichier> --client "PNUD"
    python scripts/qualify_ao.py <fichier> --open

Dépendances : pypdf>=3.0, python-docx>=1.0 (voir requirements_qualify.txt).
Logique portée depuis :
  - src/lib/qualification/patterns.ts       (GO/NOGO scoring)
  - src/lib/qualification/documentMetadata.ts (regex métadonnées)
  - src/lib/documents.ts                    (extraction texte + sections)
  - src/lib/qualification/htmlFiche.ts      (structure HTML 11 sections)
"""
from __future__ import annotations

import argparse
import io
import re
import sys
import unicodedata
import webbrowser
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ─── Constantes ──────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parents[1]
MAX_EXTRACT_CHARS = 50_000
MAX_ZIP_ENTRIES   = 10
MAX_ENTRY_BYTES   = 15 * 1024 * 1024
MAX_ENTRY_CHARS   = 25_000
MIN_TEXT_BEFORE_OCR = 180

# ─── Données métier (portage patterns.ts) ────────────────────────────────────

MANAGERS: dict[str, dict[str, str]] = {
    "ZRIOUIL ADIL":     {"name": "ZRIOUIL ADIL",     "title": "Senior Manager TEC"},
    "ARHMIR GHITA":     {"name": "ARHMIR GHITA",      "title": "Manager"},
    "AL ALAMI HOUDA":   {"name": "AL ALAMI HOUDA",    "title": "Manager"},
    "TERCHOUNE ILIASS": {"name": "TERCHOUNE ILIASS",  "title": "Manager"},
    "RHOUNI FARAH":     {"name": "RHOUNI FARAH",      "title": "Manager"},
}

GO_PATTERNS: list[dict[str, Any]] = [
    {"id": "ia",                  "score": 3, "manager": "ZRIOUIL ADIL",
     "reason": "Pattern IA — Cosumar, BCP, CDG",
     "keywords": ["intelligence artificielle","ia generative","ia générative","llm","machine learning",
                  "roadmap ia","base de donnees ia","base de données ia","formation ia"]},
    {"id": "data-gouvernance",    "score": 3, "manager": "ZRIOUIL ADIL",
     "reason": "Pattern Data/Gouvernance — OPTORG, CDG, BCP",
     "keywords": ["gouvernance","data governance","data catalog","data quality","qualite des donnees",
                  "qualité des données","mdm","raci data","data steward"]},
    {"id": "architecture-data",   "score": 3, "manager": "ZRIOUIL ADIL",
     "reason": "Pattern Architecture Data / SI",
     "keywords": ["architecture data","data warehouse","data lakehouse","data mesh","etl","elt",
                  "pipeline donnees","pipeline données","plateforme donnees","plateforme données",
                  "platteforme données"]},
    {"id": "sap-erp",             "score": 3, "manager": "ZRIOUIL ADIL",
     "reason": "Pattern SAP / ERP",
     "keywords": ["sap","erp finance","integration erp","intégration erp",
                  "consolidation legale","consolidation légale"]},
    {"id": "transfo-digitale",    "score": 3, "manager": "ZRIOUIL ADIL",
     "reason": "Pattern SI / Transformation digitale",
     "keywords": ["transformation digitale","schema directeur","schéma directeur","sdsi",
                  "systeme d'information","système d'information","si metier","si métier"]},
    {"id": "capacity-building",   "score": 2, "manager": "ARHMIR GHITA",
     "reason": "Pattern Formation / Capacity Building — Expertise France",
     "keywords": ["renforcement des capacites","renforcement des capacités","capacity building",
                  "ingenierie de formation","ingénierie de formation","programme de formation"]},
    {"id": "rh",                  "score": 3, "manager": "AL ALAMI HOUDA",
     "reason": "Pattern RH — COSUMAR",
     "keywords": ["capital humain","ressources humaines","strategie rh","stratégie rh","gpec"]},
    {"id": "sirh",                "score": 3, "manager": "AL ALAMI HOUDA",
     "reason": "Pattern SIRH",
     "keywords": ["sirh","systeme d'information rh","système d'information rh","gestion paie"]},
    {"id": "transport",           "score": 3, "manager": "TERCHOUNE ILIASS",
     "reason": "Pattern Transport — ONCF",
     "keywords": ["transport","mobilite","mobilité","mass transit","oncf"]},
    {"id": "regulation",          "score": 2, "manager": "TERCHOUNE ILIASS",
     "reason": "Pattern Régulation — Iliass",
     "keywords": ["regulation","régulation","autorite de regulation","autorité de régulation",
                  "appui financement","kfw"]},
    {"id": "esg-rse",             "score": 2, "manager": "RHOUNI FARAH",
     "reason": "Pattern ESG / RSE — Rhouni Farah",
     "keywords": ["esg","rse","responsabilite societale","responsabilité sociétale","durabilite",
                  "durabilité","reporting extra-financier","taxonomie ue"]},
    {"id": "processus-achats",    "score": 2, "manager": "ARHMIR GHITA",
     "reason": "Pattern Achats / Supply — Ghita",
     "keywords": ["processus achats","optimisation achats","sourcing strategique","sourcing stratégique",
                  "gestion des fournisseurs","performance achats"]},
    {"id": "pilotage-kpi",        "score": 2, "manager": "ARHMIR GHITA",
     "reason": "Pattern Pilotage / KPI — Ghita",
     "keywords": ["pilotage","tableau de bord","kpi","indicateurs de performance",
                  "scorecard","balanced scorecard"]},
    {"id": "pmo-gouvernance",     "score": 2, "manager": "ARHMIR GHITA",
     "reason": "Pattern PMO / Gouvernance projets — Ghita",
     "keywords": ["pmo","project management office","portefeuille projets",
                  "gouvernance de projet","programme de transformation"]},
    {"id": "energie-transition",  "score": 2, "manager": "ARHMIR GHITA",
     "reason": "Pattern Énergie / Transition — Ghita",
     "keywords": ["transition energetique","transition énergétique","efficacite energetique",
                  "efficacité énergétique","energie renouvelable","énergie renouvelable","masen","onee"]},
    {"id": "pca-continuite",      "score": 2, "manager": "ZRIOUIL ADIL",
     "reason": "Pattern PCA / Continuité d'activité — Zriouil",
     "keywords": ["plan de continuite","plan de continuité","pca","pra","business continuity",
                  "gestion de crise","resilience"]},
    {"id": "experience-client",   "score": 2, "manager": "ZRIOUIL ADIL",
     "reason": "Pattern CX / Expérience client — Zriouil",
     "keywords": ["experience client","expérience client","cx","parcours client","customer journey",
                  "satisfaction client","nps"]},
    {"id": "emploi-insertion",    "score": 2, "manager": "AL ALAMI HOUDA",
     "reason": "Pattern Emploi / Insertion — Al Alami Houda",
     "keywords": ["emploi","insertion professionnelle","marche du travail","marché du travail",
                  "promotion de l'emploi","employabilite","employabilité"]},
    {"id": "assistance-technique","score": 2, "manager": "TERCHOUNE ILIASS",
     "reason": "Pattern Assistance Technique — Terchoune Iliass",
     "keywords": ["assistance technique","at ","expert resident","expert résident",
                  "délégation de compétences"]},
    {"id": "audit-organisationnel","score": 2, "manager": "AL ALAMI HOUDA",
     "reason": "Pattern Audit Org / Restructuration — Houda",
     "keywords": ["audit organisationnel","diagnostic organisationnel","restructuration",
                  "reorganisation","réorganisation","organigramme"]},
    {"id": "marketing-communication","score": 1, "manager": "ZRIOUIL ADIL",
     "reason": "Pattern Marketing / Communication — Zriouil",
     "keywords": ["strategie marketing","stratégie marketing","plan de communication",
                  "marque employeur","brand management","digital marketing"]},
    {"id": "finance-controle",    "score": 2, "manager": "TERCHOUNE ILIASS",
     "reason": "Pattern Finance / Contrôle de gestion — Iliass",
     "keywords": ["controle de gestion","contrôle de gestion","reporting financier",
                  "consolidation financiere","consolidation financière",
                  "modelisation financiere","modélisation financière"]},
    {"id": "juridique-conformite","score": 2, "manager": "TERCHOUNE ILIASS",
     "reason": "Pattern Juridique / Conformité — Iliass",
     "keywords": ["conformite reglementaire","conformité réglementaire","compliance",
                  "protection des donnees","protection des données","rgpd","loi 09-08"]},
]

NOGO_PATTERNS: list[dict[str, Any]] = [
    {"id": "passi",                  "is_watch": False,
     "reason": "NO GO — PASSI requis",
     "keywords": ["passi","audit securite des si","audit sécurité des si","pentest"]},
    {"id": "cyber",                  "is_watch": False,
     "reason": "NO GO — cybersécurité hors périmètre",
     "keywords": ["siem","soar","soc ","utm ","antivirus","firewall","cybersecurite","cybersécurité","iso 27001"]},
    {"id": "tma",                    "is_watch": False,
     "reason": "NO GO — TMA hors offre",
     "keywords": ["tierce maintenance applicative","tma","maintenance applicative"]},
    {"id": "licences",               "is_watch": False,
     "reason": "NO GO — licences, pas du conseil",
     "keywords": ["location des licences","microsoft 365","licences logicielles"]},
    {"id": "sig",                    "is_watch": False,
     "reason": "NO GO — SIG/cadastre hors périmètre",
     "keywords": ["cadastre","sig ","modelisation sig","modélisation sig","recensement foncier"]},
    {"id": "site-web",               "is_watch": True,
     "reason": "WATCH — dev web standard",
     "keywords": ["developpement d'un site web","développement d'un site web","site web institutionnel"]},
    {"id": "btp-construction",       "is_watch": False,
     "reason": "NO GO — BTP / Génie civil hors périmètre conseil",
     "keywords": ["batiment","bâtiment","genie civil","génie civil",
                  "travaux de construction","travaux publics","btp",
                  "architecte","maîtrise d'œuvre","chantier"]},
    {"id": "agrements-specifiques",  "is_watch": False,
     "reason": "NO GO — Agréments techniques spécifiques requis",
     "keywords": ["agrement d13","agrément d13","bureau d'etudes agréé","bureau d'études agréé",
                  "agreation","agrément technique"]},
    {"id": "langue-amazighe",        "is_watch": False,
     "reason": "NO GO — Compétence amazighe hors capacité",
     "keywords": ["langue amazighe","tamazight","tifinagh"]},
    {"id": "agroalimentaire-terrain","is_watch": False,
     "reason": "NO GO — Expertise agro / terrain hors périmètre",
     "keywords": ["controle qualite alimentaire","contrôle qualité alimentaire",
                  "agroalimentaire terrain","inspection sanitaire","veterinaire"]},
    {"id": "handling-logistique",    "is_watch": False,
     "reason": "NO GO — Handling / Logistique opérationnelle hors offre",
     "keywords": ["handling","manutention","logistique operationnelle","logistique opérationnelle",
                  "gestion d'entrepot","gestion d'entrepôt"]},
    {"id": "tracabilite-terrain",    "is_watch": False,
     "reason": "NO GO — Traçabilité terrain / RFID opérationnel hors périmètre",
     "keywords": ["tracabilite physique","traçabilité physique","rfid deploiement",
                  "déploiement rfid","inventaire physique terrain"]},
    {"id": "groupement-interdit",    "is_watch": True,
     "reason": "WATCH — Groupement interdit, vérifier capacité solo",
     "keywords": ["groupement interdit","offre individuelle uniquement",
                  "soumissionnaire unique obligatoire"]},
    {"id": "social-terrain",         "is_watch": False,
     "reason": "NO GO — Travail social / Médiation terrain hors périmètre",
     "keywords": ["accompagnement social terrain","mediation sociale","animation communautaire",
                  "travailleur social"]},
    {"id": "environnement-terrain",  "is_watch": True,
     "reason": "WATCH — EIE / Environnement terrain — vérifier compétences",
     "keywords": ["etude d'impact environnemental","étude d'impact environnemental","eia",
                  "analyse cycle de vie produit","bureau d'etudes environnemental"]},
]

STRATEGIC_CLIENTS: list[str] = [
    "al mada","bnp","bmce","attijariwafa","cdc","cdg","ocp","oncf","pnud","undp",
    "banque mondiale","ades","mca","iam","itissalat al maghrib","awb","cnss","onda",
    "cosumar","nareva","tmsa","anre","bcp","banque centrale populaire",
    "ministere de l'economie","ministère de l'économie",
    "ministere des finances","ministère des finances",
]

MAX_PATTERN_SCORE = 15

# ─── Normalisation ────────────────────────────────────────────────────────────

def nfc(s: str) -> str:
    """Supprime les accents et met en minuscules pour la comparaison."""
    return (
        unicodedata.normalize("NFD", s.lower())
        .encode("ascii", "ignore")
        .decode()
    )

def normalize_text(s: str) -> str:
    """Nettoie les espaces et retours chariot."""
    s = s.replace("\r", "\n")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()

# ─── Étape 1 : Parsing nom de fichier ────────────────────────────────────────

MONTHS_FR = (
    "janvier|février|fevrier|mars|avril|mai|juin|"
    "juillet|août|aout|septembre|octobre|novembre|décembre|decembre"
)

def parse_filename(path: str) -> dict[str, str | None]:
    stem = Path(path).stem
    ao_num: str | None = None
    client: str | None = None
    date_hint: str | None = None

    m = re.match(r"^(\d{6,})", stem)
    if m:
        ao_num = m.group(1)

    _skip = {"rfp", "cps", "rc", "avis", "appel", "ao", "doc",
             "file", "tdr", "tdm", "dossier", "offre", "cahier"}
    segments = re.split(r"[_\-.\s]+", stem)
    for seg in segments:
        if re.fullmatch(r"\d+", seg):
            continue
        if re.fullmatch(r"(?:" + MONTHS_FR + r")", seg, re.IGNORECASE):
            continue
        if seg.lower() in _skip:
            continue
        if len(seg) >= 3 and re.search(r"[a-zA-ZÀ-ÿ]", seg):
            client = seg.upper()
            break

    dm = re.search(r"\b(" + MONTHS_FR + r")\s+(20\d{2})\b", stem, re.IGNORECASE)
    if dm:
        date_hint = f"{dm.group(1).capitalize()} {dm.group(2)}"

    return {"ao_num": ao_num, "client": client, "date_hint": date_hint}

# ─── Étape 2 : Extraction de texte ───────────────────────────────────────────

def _entry_priority(name: str) -> int:
    n = name.lower()
    if re.search(r"avis|aao|appel.?off", n):
        return 0
    if re.search(r"cps|cctp|dce|cahier", n):
        return 1
    if re.search(r"(^|/)rc[^a-z]|consultation", n):
        return 2
    if re.search(r"bpu|financ|prix", n):
        return 4
    return 5

def _extract_pdf_bytes(data: bytes, name: str) -> tuple[str, str]:
    try:
        import pypdf  # type: ignore
    except ImportError:
        return "", "pypdf non installé — pip install pypdf"
    try:
        reader = pypdf.PdfReader(io.BytesIO(data))
        pages = [page.extract_text() or "" for page in reader.pages]
        raw = normalize_text("\n".join(pages))
        if len(raw.strip()) < MIN_TEXT_BEFORE_OCR:
            return raw, f"{name} : PDF peu lisible (< {MIN_TEXT_BEFORE_OCR} chars) — OCR recommandé."
        return raw, ""
    except Exception as exc:
        return "", f"{name} : erreur extraction PDF ({exc})."

def _extract_docx_bytes(data: bytes, name: str) -> tuple[str, str]:
    try:
        import docx  # type: ignore
    except ImportError:
        return "", "python-docx non installé — pip install python-docx"
    try:
        doc = docx.Document(io.BytesIO(data))
        raw = normalize_text("\n".join(p.text for p in doc.paragraphs))
        return raw, ""
    except Exception as exc:
        return "", f"{name} : erreur extraction DOCX ({exc})."

def extract_text(path: str) -> tuple[str, list[str]]:
    """Retourne (texte_brut, liste_warnings)."""
    p = Path(path)
    warnings: list[str] = []
    ext = p.suffix.lower()

    if ext == ".txt":
        return normalize_text(p.read_text(encoding="utf-8", errors="replace")), warnings

    if ext == ".pdf":
        text, w = _extract_pdf_bytes(p.read_bytes(), p.name)
        if w:
            warnings.append(w)
        return text[:MAX_EXTRACT_CHARS], warnings

    if ext == ".docx":
        text, w = _extract_docx_bytes(p.read_bytes(), p.name)
        if w:
            warnings.append(w)
        return text[:MAX_EXTRACT_CHARS], warnings

    if ext == ".zip":
        parts: list[str] = []
        total_len = 0
        supported = {".pdf", ".docx", ".txt"}
        try:
            with zipfile.ZipFile(p) as zf:
                entries = [
                    e for e in zf.infolist()
                    if not e.is_dir() and Path(e.filename).suffix.lower() in supported
                ]
                entries.sort(key=lambda e: _entry_priority(e.filename))
                processed = 0
                for entry in entries:
                    if processed >= MAX_ZIP_ENTRIES:
                        warnings.append(f"ZIP : seuls les {MAX_ZIP_ENTRIES} premiers fichiers traités.")
                        break
                    if entry.file_size > MAX_ENTRY_BYTES:
                        warnings.append(f"Ignoré (trop lourd) : {entry.filename}")
                        continue
                    try:
                        data = zf.read(entry.filename)
                    except Exception as exc:
                        warnings.append(f"Lecture impossible : {entry.filename} ({exc})")
                        continue

                    name = Path(entry.filename).name
                    esuf = Path(entry.filename).suffix.lower()
                    if esuf == ".txt":
                        chunk = normalize_text(data.decode("utf-8", errors="replace"))
                        w = ""
                    elif esuf == ".pdf":
                        chunk, w = _extract_pdf_bytes(data, name)
                    else:
                        chunk, w = _extract_docx_bytes(data, name)

                    if w:
                        warnings.append(w)
                    chunk = chunk[:MAX_ENTRY_CHARS]
                    sep = f"\n\n--- Fichier ZIP : {entry.filename} ---\n\n"
                    if total_len + len(sep) + len(chunk) > MAX_EXTRACT_CHARS:
                        warnings.append("Archive tronquée : limite globale atteinte.")
                        break
                    parts.append(sep + chunk)
                    total_len += len(sep) + len(chunk)
                    processed += 1
        except zipfile.BadZipFile as exc:
            warnings.append(f"ZIP corrompu : {exc}")
        return "".join(parts)[:MAX_EXTRACT_CHARS], warnings

    warnings.append(f"Format non supporté : {ext}. Utilisez .pdf, .docx, .txt ou .zip.")
    return "", warnings

# ─── Étape 3 : Extraction métadonnées ────────────────────────────────────────

def _find_budget(text: str) -> str | None:
    patterns = [
        r"\b(\d[\d\s]{2,})\s*(dh|mad|dirhams?)\b",
        r"budget\s*[:\s]+(\d[\d\s]+)",
        r"montant\s*[:\s]+(\d[\d\s]+)",
        r"enveloppe\s*[:\s]+(\d[\d\s]+)",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            raw = (m.group(1) if len(m.groups()) >= 1 else m.group(0)).strip()
            raw = re.sub(r"\s+", " ", raw)
            if len(raw) >= 2:
                suffix = (" " + m.group(2).upper()) if len(m.groups()) >= 2 and m.group(2) else ""
                return raw + suffix
    return None

def _find_date_limite(text: str) -> str | None:
    snippets = [
        r"date\s+limite\s*[:\s]+(.{0,80}?)(?:\n|$)",
        r"avant\s+le\s*[:\s]*(.{0,40})",
        r"remise\s+des\s+offres\s*[:\s]*(.{0,80}?)(?:\n|$)",
    ]
    for pat in snippets:
        m = re.search(pat, text, re.IGNORECASE)
        if m and m.group(1).strip():
            return m.group(1).strip()[:120]
    dates = re.findall(r"\b(\d{1,2})[/.]\s*(\d{1,2})[/.]\s*(\d{2,4})\b", text)
    if dates:
        d, mo, y = dates[-1]
        year = ("20" + y) if len(y) == 2 else y
        return f"{d}/{mo}/{year}"
    return None

def _find_duree(text: str) -> str | None:
    m = re.search(r"\b(\d{1,4})\s*jours?\s*(ouvrables?|calendaires?)?", text, re.IGNORECASE)
    if m:
        return f"{m.group(1)} jour(s){' ' + m.group(2) if m.group(2) else ''}"
    m = re.search(r"dur[eé]e\s*[:\s]+(\d+)\s*(mois|semaines?)", text, re.IGNORECASE)
    if m:
        return f"{m.group(1)} {m.group(2)}"
    return None

def _find_maitre_ouvrage(text: str) -> str | None:
    patterns = [
        r"ma[iî]tre\s*d['’]ouvrage\s*[:\s]+(.{1,120}?)(?:\n|\.|;)",
        r"commanditaire\s*[:\s]+(.{1,120}?)(?:\n|\.|;)",
        r"client\s*[:\s]+(.{1,80}?)(?:\n|\.|;)",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m and m.group(1).strip():
            v = re.sub(r"\s+", " ", m.group(1).strip())[:200]
            if len(v) > 3:
                return v
    return None

def _find_lieu(text: str) -> str | None:
    patterns = [
        r"lieu\s*(?:de\s*)?(?:r[eé]union|ex[eé]cution|prestation)\s*[:\s]+(.{1,100}?)(?:\n|\.|;)",
        r"\b(?:[àa]|r[eé]sidence)\s+([A-ZÉÈÀÂ][a-zéèàâôûç\-]+(?:\s+[A-ZÉÈÀÂ][a-zéèàâôûç\-]+)?)\b",
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m and m.group(1).strip():
            v = m.group(1).strip()[:120]
            if len(v) > 2:
                return v
    return None

def _find_emails(text: str) -> list[str]:
    found: set[str] = set()
    for m in re.finditer(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", text):
        e = m.group(0).lower()
        if not e.endswith((".png", ".jpg")):
            found.add(e)
    return sorted(found)[:12]

def extract_metadata(text: str) -> dict[str, Any]:
    return {
        "date_limite":    _find_date_limite(text),
        "budget":         _find_budget(text),
        "duree":          _find_duree(text),
        "maitre_ouvrage": _find_maitre_ouvrage(text),
        "lieu":           _find_lieu(text),
        "emails":         _find_emails(text),
    }

# ─── Étape 4 : Scoring patterns ──────────────────────────────────────────────

def _find_hits(haystack: str, keywords: list[str]) -> list[str]:
    h = nfc(haystack)
    return [kw for kw in keywords if nfc(kw) in h]

def score_patterns(text: str, client: str) -> dict[str, Any]:
    activated: list[dict] = []
    for pat in GO_PATTERNS:
        hits = _find_hits(text, pat["keywords"])
        if hits:
            activated.append({**pat, "hits": hits})

    blocking: list[dict] = []
    watching: list[dict] = []
    for pat in NOGO_PATTERNS:
        hits = _find_hits(text, pat["keywords"])
        if hits:
            entry = {**pat, "hits": hits}
            (watching if pat["is_watch"] else blocking).append(entry)

    base_score = sum(p["score"] for p in activated)
    bonus_client: dict | None = None
    if base_score > 0:
        h = nfc(client)
        for sc in STRATEGIC_CLIENTS:
            if nfc(sc) in h:
                bonus_client = {"client": sc, "points": 1}
                break

    total = min(MAX_PATTERN_SCORE, base_score + (bonus_client["points"] if bonus_client else 0))
    has_blocker = bool(blocking)

    if has_blocker:
        decision, tone = "NO GO", "nogo"
        label = "NO GO — Signal bloquant détecté"
    elif total >= 6:
        decision, tone = "GO", "go"
        label = "GO — Répondre fortement recommandé"
    elif total >= 3:
        decision, tone = "WATCH", "watch"
        label = "WATCH — À confirmer avec le manager"
    else:
        decision, tone = "NO GO", "nogo"
        label = "NO GO — Score insuffisant"

    manager: dict | None = None
    if activated:
        best = max(activated, key=lambda p: p["score"])
        manager = MANAGERS.get(best["manager"])

    if blocking:
        rationale = (
            f"Bloqué par {len(blocking)} signal(s) NO GO : "
            + " ; ".join(p["reason"] for p in blocking) + "."
        )
    elif not activated:
        rationale = "Aucun pattern Sia activé dans le document analysé."
    else:
        parts = [f"{p['reason']} (+{p['score']} pts)" for p in activated]
        if bonus_client:
            parts.append(f"Bonus client stratégique « {bonus_client['client']} » (+{bonus_client['points']} pt)")
        rationale = f"Score patterns {total}/{MAX_PATTERN_SCORE} : " + " ; ".join(parts) + "."

    return {
        "score": total, "max_score": MAX_PATTERN_SCORE,
        "decision": decision, "tone": tone, "label": label,
        "activated": activated, "blocking": blocking, "watching": watching,
        "bonus_client": bonus_client, "manager": manager, "rationale": rationale,
    }

# ─── Étape 5 : Extraction sections (NLP simple) ──────────────────────────────

def _lines_of(text: str) -> list[str]:
    return [ln.strip() for ln in normalize_text(text).split("\n") if ln.strip()]

def _find_section(lines: list[str], keywords: list[str], max_chars: int = 1200, max_lines: int = 18) -> str:
    nkw = [nfc(kw) for kw in keywords]
    for i, line in enumerate(lines):
        nl = nfc(line)
        if any(kw in nl for kw in nkw):
            collected = [line]
            for j in range(i + 1, min(len(lines), i + max_lines)):
                nxt = lines[j]
                looks_like_heading = (
                    len(nxt) < 90 and bool(re.match(r"^\d+(\.\d+)*\.?\s+[A-ZÉÈÀÂÎÏÔÙÛÇ]", nxt))
                )
                if looks_like_heading and len(collected) > 2:
                    break
                collected.append(nxt)
            return "\n".join(collected)[:max_chars]
    return ""

def _detect_warnings(text: str) -> list[str]:
    checks = [
        ("groupement interdit",   "Groupement potentiellement interdit ou contraint"),
        ("certification",         "Certification ou attestation spécifique à vérifier"),
        ("références similaires", "Références similaires exigées"),
        ("pénalité",              "Pénalités contractuelles à analyser"),
        ("délai",                 "Délai de réalisation à confirmer"),
        ("budget",                "Budget ou enveloppe financière à confirmer"),
    ]
    lower = text.lower()
    return [label for kw, label in checks if kw in lower]

def extract_sections(text: str) -> dict[str, Any]:
    lines = _lines_of(text)
    return {
        "contexte":  _find_section(lines, ["introduction","contexte","présentation de l'organisation",
                                           "presentation de l'organisation","contact","coordonnées",
                                           "coordination","référent","referent","représentant"]),
        "objet":     _find_section(lines, ["objet","objectif","mission","appel d'offres",
                                           "cahier des charges","besoin exprimé","besoins"]),
        "perimetre": _find_section(lines, ["périmètre","perimetre","scope","prestations attendues",
                                           "besoins","lieu","localisation","ville","site",
                                           "adresse","géographique","geographique"]),
        "livrables": _find_section(lines, ["livrables","deliverables","restitution","rapport",
                                           "documents attendus"]),
        "duree":     _find_section(lines, ["durée","duree","planning","calendrier","délai","delai",
                                           "remise des offres","clôture","echeance","échéance"]),
        "profils":   _find_section(lines, ["profil","expert","consultant","équipe","equipe",
                                           "qualification","contact","interlocuteur","référent technique"]),
        "criteres":  _find_section(lines, ["critères","criteres","évaluation","evaluation",
                                           "notation","pondération","ponderation"]),
        "budget":    _find_section(lines, ["budget","enveloppe","montant","prix","financière","financiere"]),
        "risques":   _find_section(lines, ["risques","contraintes","sécurité","securite","exigences",
                                           "pénalité","penalite","soumission"]),
        "points_vigilance": _detect_warnings(text),
    }

# ─── Étape 6 : Thème couleur ─────────────────────────────────────────────────

def choose_theme(decision: str) -> dict[str, str]:
    if decision == "GO":
        return {"accent": "#00A578", "bg": "#E6FAF4", "text": "#065F46",
                "border": "#B5E8D6", "icon": "✅", "tone": "go"}
    if decision == "WATCH":
        return {"accent": "#7C3AED", "bg": "#F5F0FF", "text": "#4C1D95",
                "border": "#C4B5FD", "icon": "⚠️", "tone": "watch"}
    return {"accent": "#D63B3B", "bg": "#FEF2F2", "text": "#991B1B",
            "border": "#F4C2C2", "icon": "🚫", "tone": "nogo"}

# ─── Étape 7 : Génération HTML ───────────────────────────────────────────────

def _esc(s: Any) -> str:
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )

def _section_text(num: int, title: str, content: str, fallback: str = "Non extrait du document.") -> str:
    body = _esc(content or fallback).replace("\n", "<br>")
    return f"""
    <div class="section">
      <div class="section-header">
        <div class="section-num">{num}</div>
        <div class="section-title">{_esc(title)}</div>
      </div>
      <div class="section-body"><p style="white-space:pre-wrap">{body}</p></div>
    </div>"""

def _tag(label: str, tone: str = "gray") -> str:
    cls = {"go": "tag-go", "nogo": "tag-nogo", "watch": "tag-watch",
           "gray": "tag-gray"}.get(tone, "tag-gray")
    return f'<span class="tag {cls}">{_esc(label)}</span>'

def build_html(
    ao_num: str | None,
    client: str,
    date_hint: str | None,
    meta: dict[str, Any],
    score: dict[str, Any],
    sections: dict[str, Any],
    warnings: list[str],
    source_path: str,
) -> str:
    theme = choose_theme(score["decision"])
    generated = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")

    # ── CSS ──────────────────────────────────────────────────────────────────
    css = """
    @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap');
    :root {
      --sia-black:#0E0E10; --sia-green:#00E0A4; --sia-green-ink:#00A578;
      --go:#00A578; --go-bg:#E6FAF4; --go-text:#065F46; --go-border:#B5E8D6;
      --watch:#7C3AED; --watch-bg:#F5F0FF; --watch-text:#4C1D95; --watch-border:#C4B5FD;
      --nogo:#D63B3B; --nogo-bg:#FEF2F2; --nogo-text:#991B1B; --nogo-border:#F4C2C2;
      --text:#0E0E10; --muted:#6B6B72; --border:#E5E5E1; --bg:#FAFAF7;
      --surface:#FFFFFF; --surface-1:#F6F6F4;
      --font-d:'Inter Tight',system-ui,-apple-system,'Segoe UI',sans-serif;
      --font-m:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:var(--font-d);background:var(--bg);color:var(--text);
         font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased}
    .header{background:var(--sia-black);color:#FAFAF7;padding:28px 44px 24px;
            border-bottom:3px solid var(--sia-green);position:relative;overflow:hidden}
    .header::before{content:'';position:absolute;top:-60px;right:-60px;width:200px;height:200px;
                    border-radius:50%;background:rgba(0,224,164,.06)}
    .header-top{display:flex;justify-content:space-between;align-items:flex-start;
                margin-bottom:16px;gap:16px;flex-wrap:wrap;position:relative;z-index:1}
    .sia-logo{font-weight:600;font-size:17px;letter-spacing:.16em;text-transform:uppercase;
              color:var(--sia-green)}
    .sia-logo span{color:#C0C0C5;font-weight:400;font-size:11px;letter-spacing:0;
                   text-transform:none;display:block;margin-top:3px}
    .ao-badge{background:#1C1C22;border:1px solid #22222A;border-radius:8px;
              padding:7px 14px;text-align:right;font-size:11px;color:#C0C0C5}
    .ao-badge strong{font-family:var(--font-m);font-size:13px;font-weight:600;
                     color:#FAFAF7;display:block}
    h1{font-size:22px;font-weight:600;letter-spacing:-.005em;line-height:1.2;
       color:#FAFAF7;position:relative;z-index:1}
    h1 .sub{display:block;font-size:13px;font-weight:400;color:#C0C0C5;margin-top:4px}
    .header-meta{display:flex;gap:16px;font-size:11px;color:#8A8A92;
                 flex-wrap:wrap;margin-top:14px;position:relative;z-index:1}
    .header-meta span::before{content:'• ';color:var(--sia-green);margin-right:3px}
    .banner{padding:14px 44px;display:flex;align-items:center;
            justify-content:space-between;gap:16px;flex-wrap:wrap;
            border-left:5px solid var(--sia-green)}
    .banner-main{display:flex;align-items:center;gap:12px}
    .banner-icon{font-size:26px}
    .banner-text strong{font-size:17px;font-weight:600;display:block}
    .banner-text span{font-size:11px;display:block;margin-top:1px}
    .score-pill{font-family:var(--font-m);font-weight:600;font-size:17px;
                padding:7px 16px;border-radius:999px;white-space:nowrap;color:#FFF}
    .container{max-width:960px;margin:0 auto;padding:0 20px 48px}
    .section{background:var(--surface);border:1px solid var(--border);border-radius:8px;
             overflow:hidden;margin-top:16px;
             box-shadow:0 1px 0 rgba(14,14,16,.04),0 1px 2px rgba(14,14,16,.06)}
    .section-header{display:flex;align-items:center;gap:10px;padding:12px 18px;
                    border-bottom:1px solid var(--border);background:var(--surface-1)}
    .section-num{width:24px;height:24px;border-radius:50%;background:var(--sia-black);
                 color:var(--sia-green);font-family:var(--font-m);font-weight:600;
                 font-size:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .section-title{font-weight:600;font-size:14px}
    .section-body{padding:16px 18px}
    table{width:100%;border-collapse:collapse}
    th{background:var(--surface-1);font-weight:600;font-size:10px;text-transform:uppercase;
       letter-spacing:.08em;color:var(--muted);padding:9px 12px;text-align:left;
       border-bottom:1px solid var(--border)}
    td{padding:9px 12px;border-bottom:1px solid var(--surface-1);vertical-align:top;font-size:13px}
    tr:last-child td{border-bottom:none}
    .label{font-weight:500;color:var(--muted);width:30%}
    .tag{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:999px;
         font-size:11px;font-weight:500;border:1px solid transparent;margin:2px 2px 2px 0}
    .tag-go{background:var(--go-bg);color:var(--go-text);border-color:var(--go-border)}
    .tag-watch{background:var(--watch-bg);color:var(--watch-text);border-color:var(--watch-border)}
    .tag-nogo{background:var(--nogo-bg);color:var(--nogo-text);border-color:var(--nogo-border)}
    .tag-gray{background:var(--surface-1);color:var(--muted);border-color:var(--border)}
    .pattern-grid{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
    .rationale{font-size:12px;color:var(--muted);margin-top:10px;
               background:var(--surface-1);border-radius:6px;padding:10px 12px}
    .warning-list{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
    .footer{text-align:center;font-size:11px;color:var(--muted);
            padding:24px 0 32px;border-top:1px solid var(--border);margin-top:24px}
    @media(max-width:600px){
      .header{padding:20px 16px 16px}.banner{padding:12px 16px}
      .container{padding:0 12px 32px}.section-body{padding:12px}
    }
    """

    # ── Bannière décision ────────────────────────────────────────────────────
    banner_style = (
        f"background:{theme['bg']};border-left-color:{theme['accent']}"
    )
    score_pill_style = f"background:{theme['accent']}"
    if score["tone"] == "watch":
        score_pill_style += ";color:#FFF"
    banner = f"""
    <div class="banner" style="{banner_style}">
      <div class="banner-main">
        <div class="banner-icon">{theme['icon']}</div>
        <div class="banner-text">
          <strong style="color:{theme['text']}">{_esc(score['label'])}</strong>
          <span style="color:{theme['accent']}">Analyse patterns Sia · sans IA</span>
        </div>
      </div>
      <div class="score-pill" style="{score_pill_style}">
        {score['score']}<span style="font-size:11px;font-weight:400;opacity:.85">/{MAX_PATTERN_SCORE}</span>
      </div>
    </div>"""

    # ── Section 1 : Identification ───────────────────────────────────────────
    def row(label: str, value: Any, mono: bool = False) -> str:
        v = _esc(str(value)) if value else "<span style='color:var(--muted)'>—</span>"
        style = "font-family:var(--font-m);font-size:12px" if mono else ""
        return f"<tr><td class='label'>{_esc(label)}</td><td style='{style}'>{v}</td></tr>"

    emails_html = (
        " ".join(f"<a href='mailto:{_esc(e)}'>{_esc(e)}</a>" for e in meta["emails"])
        if meta["emails"] else "—"
    )
    sec1 = f"""
    <div class="section">
      <div class="section-header">
        <div class="section-num">1</div>
        <div class="section-title">Identification de l'appel d'offres</div>
      </div>
      <div class="section-body">
        <table>
          {row("N° AO", ao_num or "—", mono=True)}
          {row("Client / Maître d'ouvrage", client)}
          {row("Maître d'ouvrage (doc)", meta.get("maitre_ouvrage"))}
          {row("Objet", sections.get("objet"))}
          {row("Date limite de remise", meta.get("date_limite"))}
          {row("Durée", meta.get("duree"))}
          {row("Budget estimé", meta.get("budget"))}
          {row("Lieu d'exécution", meta.get("lieu"))}
          <tr><td class="label">Contacts</td><td style="font-size:12px">{emails_html}</td></tr>
        </table>
      </div>
    </div>"""

    # ── Section 2 : Scoring patterns ────────────────────────────────────────
    go_tags = "".join(_tag(p["reason"], "go") for p in score["activated"])
    block_tags = "".join(_tag(p["reason"], "nogo") for p in score["blocking"])
    watch_tags = "".join(_tag(p["reason"], "watch") for p in score["watching"])
    sec2 = f"""
    <div class="section">
      <div class="section-header">
        <div class="section-num">2</div>
        <div class="section-title">Scoring patterns Sia ({score['score']}/{MAX_PATTERN_SCORE})</div>
      </div>
      <div class="section-body">
        {"<div class='pattern-grid'>" + go_tags + "</div>" if go_tags else ""}
        {"<div class='pattern-grid' style='margin-top:6px'>" + block_tags + "</div>" if block_tags else ""}
        {"<div class='pattern-grid' style='margin-top:6px'>" + watch_tags + "</div>" if watch_tags else ""}
        <div class="rationale">{_esc(score['rationale'])}</div>
        {("<div style='margin-top:10px;font-size:12px;color:var(--muted)'>"
          + "👤 Manager recommandé : <strong>"
          + _esc(score['manager']['name'])
          + "</strong> — "
          + _esc(score['manager']['title'])
          + "</div>") if score.get("manager") else ""}
      </div>
    </div>"""

    # ── Sections 3–11 : texte ────────────────────────────────────────────────
    secs_text = ""
    secs_text += _section_text(3,  "Contexte",               sections.get("contexte",""))
    secs_text += _section_text(4,  "Objet de la mission",    sections.get("objet",""))
    secs_text += _section_text(5,  "Périmètre",              sections.get("perimetre",""))
    secs_text += _section_text(6,  "Livrables attendus",     sections.get("livrables",""))
    secs_text += _section_text(7,  "Durée & calendrier",     sections.get("duree",""))
    secs_text += _section_text(8,  "Profils requis",         sections.get("profils",""))
    secs_text += _section_text(9,  "Critères d'évaluation",  sections.get("criteres",""))
    secs_text += _section_text(10, "Budget",
        (sections.get("budget","") or "") +
        ("\n\nDétecté par regex : " + meta["budget"] if meta.get("budget") else ""))

    # Section 11 : risques + points de vigilance
    pv = sections.get("points_vigilance", [])
    pv_html = ("<div class='warning-list'>"
               + "".join(_tag(p, "watch") for p in pv)
               + "</div>") if pv else ""
    risques_body = _esc(sections.get("risques","") or "Non extrait du document.").replace("\n","<br>")
    sec11 = f"""
    <div class="section">
      <div class="section-header">
        <div class="section-num">11</div>
        <div class="section-title">Risques &amp; points de vigilance</div>
      </div>
      <div class="section-body">
        <p style="white-space:pre-wrap">{risques_body}</p>
        {pv_html}
      </div>
    </div>"""

    # ── Avertissements extraction ────────────────────────────────────────────
    warn_html = ""
    if warnings:
        items = "".join(f"<li>{_esc(w)}</li>" for w in warnings)
        warn_html = f"""
        <div style="background:#FFFBEB;border:1px solid #FDE2A6;border-radius:8px;
                    padding:12px 16px;margin-top:16px;font-size:12px;color:#8A6217">
          <strong>⚠ Avertissements extraction</strong>
          <ul style="margin-top:6px;padding-left:18px">{items}</ul>
        </div>"""

    # ── Footer ───────────────────────────────────────────────────────────────
    manager_line = ""
    if score.get("manager"):
        m = score["manager"]
        manager_line = f"<br>Manager suggéré : <strong>{_esc(m['name'])}</strong> · {_esc(m['title'])}"
    footer = f"""
    <div class="footer">
      Fiche générée le {_esc(generated)} · qualify_ao.py · Sia Management<br>
      Source : {_esc(source_path)}{manager_line}
    </div>"""

    # ── Assemblage ───────────────────────────────────────────────────────────
    title_txt = f"{ao_num or 'AO'} — {client}"
    ao_badge_html = (
        f"<div class='ao-badge'><strong>{_esc(ao_num)}</strong>N° AO</div>"
        if ao_num else ""
    )
    meta_items = [f"<span>{_esc(client)}</span>"]
    if meta.get("date_limite"):
        meta_items.append(f"<span>Date limite : {_esc(meta['date_limite'])}</span>")
    if date_hint:
        meta_items.append(f"<span>{_esc(date_hint)}</span>")
    meta_items.append(f"<span>Score : {score['score']}/{MAX_PATTERN_SCORE}</span>")

    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Fiche qualification · {_esc(title_txt)}</title>
  <style>{css}</style>
</head>
<body>
  <div class="header">
    <div class="header-top">
      <div class="sia-logo">SIA<span>Qualification AO · Pipeline Python</span></div>
      {ao_badge_html}
    </div>
    <h1>{_esc(client)}<span class="sub">{_esc(sections.get('objet','') or title_txt)[:120]}</span></h1>
    <div class="header-meta">{''.join(meta_items)}</div>
  </div>
  {banner}
  <div class="container">
    {warn_html}
    {sec1}
    {sec2}
    {secs_text}
    {sec11}
    {footer}
  </div>
</body>
</html>"""

# ─── Point d'entrée CLI ──────────────────────────────────────────────────────

def _slug(s: str) -> str:
    s = re.sub(r"[^\w\-]", "_", s)
    return re.sub(r"_+", "_", s).strip("_")[:40]

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Pipeline Python : ZIP/PDF/DOCX → fiche qualification HTML Sia."
    )
    parser.add_argument("input", help="Fichier source (.pdf, .docx, .txt, .zip)")
    parser.add_argument("--output-dir", default=str(ROOT / "output"),
                        help="Répertoire de sortie (défaut : output/)")
    parser.add_argument("--client", default="",
                        help="Override du client détecté depuis le nom de fichier")
    parser.add_argument("--open", action="store_true", dest="open_browser",
                        help="Ouvre le HTML dans le navigateur après génération")
    args = parser.parse_args()

    src = Path(args.input)
    if not src.exists():
        sys.exit(f"Fichier introuvable : {src}")

    print(f"[1/7] Analyse nom de fichier : {src.name}")
    signals = parse_filename(str(src))
    ao_num  = signals["ao_num"]
    client  = args.client.strip().upper() or signals["client"] or src.stem.upper()[:20]
    date_hint = signals["date_hint"]
    print(f"      N° AO={ao_num or '—'}  Client={client}  Date={date_hint or '—'}")

    print("[2/7] Extraction du texte…")
    text, warnings = extract_text(str(src))
    print(f"      {len(text):,} chars extraits, {len(warnings)} avertissement(s)")
    if not text.strip():
        sys.exit("Aucun texte extrait. Vérifiez le fichier et les dépendances (pypdf, python-docx).")

    print("[3/7] Extraction des métadonnées (regex)…")
    meta = extract_metadata(text)
    if meta.get("date_limite"): print(f"      Date limite : {meta['date_limite']}")
    if meta.get("budget"):      print(f"      Budget : {meta['budget']}")
    if meta.get("duree"):       print(f"      Durée : {meta['duree']}")

    print("[4/7] Scoring patterns GO/NOGO…")
    score = score_patterns(text, client)
    decision_line = score["label"]
    print(f"      {decision_line}  (score {score['score']}/{MAX_PATTERN_SCORE})")
    if score["blocking"]:
        for b in score["blocking"]:
            print(f"      🚫 {b['reason']}")
    if score["watching"]:
        for w in score["watching"]:
            print(f"      ⚠  {w['reason']}")
    if score["activated"]:
        for a in score["activated"]:
            print(f"      ✅ {a['reason']} (+{a['score']} pts)")

    print("[5/7] Extraction des sections (NLP simple)…")
    sections = extract_sections(text)
    non_empty = sum(1 for k, v in sections.items() if k != "points_vigilance" and v)
    print(f"      {non_empty}/9 sections extraites, {len(sections['points_vigilance'])} point(s) vigilance")

    print("[6/7] Choix du thème HTML…")
    theme = choose_theme(score["decision"])
    print(f"      Thème : {score['decision']} → {theme['accent']}")

    print("[7/7] Génération du HTML…")
    html = build_html(ao_num, client, date_hint, meta, score, sections, warnings, str(src))

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    ao_slug  = _slug(ao_num or "")
    cli_slug = _slug(client)
    out_name = f"fiche_qualification_{ao_slug}_{cli_slug}.html" if ao_slug else f"fiche_qualification_{cli_slug}.html"
    out_path = out_dir / out_name
    out_path.write_text(html, encoding="utf-8")
    print(f"\n✅  Fiche générée : {out_path}")

    if args.open_browser:
        webbrowser.open(out_path.as_uri())

if __name__ == "__main__":
    main()
