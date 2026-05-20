import type { CollectedAo } from "@/lib/aoSources/types";

export type MoroccoAoAccessMethod = "national-portal" | "eprocurement" | "static-page" | "github-lead";

export type MoroccoAoSourceRegistryEntry = {
  id: string;
  sourceName: string;
  country: "Maroc";
  kind: CollectedAo["sourceKind"];
  homepage: string;
  seeds: string[];
  accessMethod: MoroccoAoAccessMethod;
  documentHints: string[];
  evidenceUrls: string[];
  notes: string;
};

export type MoroccoGithubLead = {
  repository: string;
  url: string;
  target: string;
  updatedAt: string;
  license: string;
  use: "audit-only";
};

export const MOROCCO_WEB_AO_SOURCES: MoroccoAoSourceRegistryEntry[] = [
  {
    id: "pmmp",
    sourceName: "Portail Marocain des Marches Publics",
    country: "Maroc",
    kind: "public-web",
    homepage: "https://www.marchespublics.gov.ma/pmmp/",
    seeds: [
      "https://www.marchespublics.gov.ma/index.php?page=entreprise.EntrepriseHome",
      "https://www.marchespublics.gov.ma/?page=entreprise.EntrepriseAdvancedSearch",
      "https://www.marchespublics.gov.ma/mobile/?lang=fr&page=entreprise.EntrepriseAdvancedSearch&searchAnnCons="
    ],
    accessMethod: "national-portal",
    documentHints: ["DCE", "CPS", "RC", "Avis", "Bordereau"],
    evidenceUrls: ["https://www.marchespublics.gov.ma/pmmp/"],
    notes: "Portail central de dematerialisation des marches publics marocains."
  },
  {
    id: "ofppt",
    sourceName: "OFPPT Appels d'offres",
    country: "Maroc",
    kind: "public-web",
    homepage: "https://www.ofppt.ma/fr/appels-d-offres",
    seeds: ["https://www.ofppt.ma/fr/appels-d-offres?Description=&field_domaine_activite_target_id=All&field_mode_de_passation_target_id=All&page=1&title="],
    accessMethod: "static-page",
    documentHints: ["Avis", "CPS", "RC"],
    evidenceUrls: ["https://www.ofppt.ma/fr/appels-d-offres"],
    notes: "Page officielle OFPPT listant les consultations."
  },
  {
    id: "adm",
    sourceName: "ADM Achats",
    country: "Maroc",
    kind: "public-web",
    homepage: "https://achats.adm.co.ma/",
    seeds: ["https://achats.adm.co.ma/"],
    accessMethod: "eprocurement",
    documentHints: ["Dossier de consultation", "Reglement", "CPS"],
    evidenceUrls: ["https://achats.adm.co.ma/"],
    notes: "Plateforme achats dediee Autoroutes du Maroc."
  },
  {
    id: "masen",
    sourceName: "MASEN eTendering",
    country: "Maroc",
    kind: "public-web",
    homepage: "http://etendering.masen.ma/",
    seeds: ["http://etendering.masen.ma/"],
    accessMethod: "eprocurement",
    documentHints: ["Dossier", "CPS", "RC"],
    evidenceUrls: ["http://etendering.masen.ma/"],
    notes: "Plateforme de consultations MASEN."
  },
  {
    id: "bank-al-maghrib",
    sourceName: "Bank Al-Maghrib Achats",
    country: "Maroc",
    kind: "public-web",
    homepage: "https://www.bkam.ma/Achats/Appels-d-offres/Avis-d-appels-d-offres",
    seeds: [
      "https://www.bkam.ma/Achats/Appels-d-offres/Avis-d-appels-d-offres",
      "https://portailachats.bankalmaghrib.ma/?consAnnulee=1&page=entreprise.EntrepriseAdvancedSearch&searchAnnCons="
    ],
    accessMethod: "eprocurement",
    documentHints: ["Avis", "Reglement", "Dossier"],
    evidenceUrls: ["https://www.bkam.ma/Achats/Appels-d-offres/Avis-d-appels-d-offres", "https://portailachats.bankalmaghrib.ma/"],
    notes: "Site achats et portail e-procurement de Bank Al-Maghrib."
  },
  {
    id: "al-omrane",
    sourceName: "Groupe Al Omrane Appels d'offres",
    country: "Maroc",
    kind: "public-web",
    homepage: "https://alomrane.gov.ma/Eservices/Appels-d-offres",
    seeds: ["https://alomrane.gov.ma/Eservices/Appels-d-offres"],
    accessMethod: "static-page",
    documentHints: ["Avis", "Reglement", "CPS"],
    evidenceUrls: ["https://alomrane.gov.ma/Eservices/Appels-d-offres"],
    notes: "Portail officiel Al Omrane avec filtres par activite, ville et filiale."
  },
  {
    id: "tanger-med",
    sourceName: "Tanger Med Appels d'offres",
    country: "Maroc",
    kind: "public-web",
    homepage: "https://www.tangermed.ma/fr/appels-doffres/",
    seeds: ["https://www.tangermed.ma/fr/appels-doffres/", "https://tangermed.ma/en/tenders"],
    accessMethod: "static-page",
    documentHints: ["Appel d'offres", "Referentiel achats", "CAG"],
    evidenceUrls: ["https://www.tangermed.ma/fr/appels-doffres/"],
    notes: "Page appels d'offres et espace fournisseurs Tanger Med."
  },
  {
    id: "onda",
    sourceName: "ONDA Appels d'offres Achats",
    country: "Maroc",
    kind: "public-web",
    homepage: "https://www.onda.ma/Je-suis-Professionnel/Appels-d'offres/Appels-d'offres-Achats",
    seeds: ["https://www.onda.ma/Je-suis-Professionnel/Appels-d'offres/Appels-d'offres-Achats"],
    accessMethod: "static-page",
    documentHints: ["Dossier", "Reglement", "Avis"],
    evidenceUrls: ["https://www.onda.ma/Je-suis-Professionnel/Appels-d'offres/Appels-d'offres-Achats"],
    notes: "Portail professionnel ONDA pour achats et appels d'offres."
  },
  {
    id: "maroc-telecom",
    sourceName: "Maroc Telecom Appels d'offres",
    country: "Maroc",
    kind: "public-web",
    homepage: "https://www.iam.ma/groupe-maroc-telecom/nous-connaitre/publications/appels-d-offres-iam.aspx",
    seeds: [
      "https://www.iam.ma/groupe-maroc-telecom/nous-connaitre/publications/appels-d-offres-iam.aspx",
      "https://www.iam.ma/en/groupe-maroc-telecom/appels-d-offres?delta=60&start=1"
    ],
    accessMethod: "static-page",
    documentHints: ["Cahier des charges", "Consultation ouverte", "Avis"],
    evidenceUrls: ["https://www.iam.ma/groupe-maroc-telecom/nous-connaitre/publications/appels-d-offres-iam.aspx"],
    notes: "Page officielle Itissalat Al Maghrib / Maroc Telecom."
  },
  {
    id: "ocp",
    sourceName: "OCP Relation Fournisseurs",
    country: "Maroc",
    kind: "public-web",
    homepage: "https://relationfournisseurs.ocp.ma/",
    seeds: ["https://relationfournisseurs.ocp.ma/", "https://ao-ouvert.ocp.ma/"],
    accessMethod: "eprocurement",
    documentHints: ["AMI", "Dossier", "Cahier des charges"],
    evidenceUrls: ["https://relationfournisseurs.ocp.ma/", "https://ao-ouvert.ocp.ma/"],
    notes: "Portails fournisseurs et appels ouverts OCP."
  },
  {
    id: "onee-electricite",
    sourceName: "ONEE Branche Electricite",
    country: "Maroc",
    kind: "public-web",
    homepage: "https://www.one.ma/FR/pages/aoselect.asp?esp=2&id1=7&id2=64&id3=54&t2=1&t3=1",
    seeds: ["https://www.one.ma/FR/pages/aoselect.asp?esp=2&id1=7&id2=64&id3=54&t2=1&t3=1"],
    accessMethod: "static-page",
    documentHints: ["Fiche appel d'offres", "Dossier", "Avis"],
    evidenceUrls: ["https://www.one.ma/FR/pages/aoselect.asp?esp=2&id1=7&id2=64&id3=54&t2=1&t3=1"],
    notes: "Liste des appels d'offres ONEE Branche Electricite."
  }
];

export const MOROCCO_GITHUB_AO_LEADS: MoroccoGithubLead[] = [
  {
    repository: "gbennouna-ncit/novec-tenders",
    url: "https://github.com/gbennouna-ncit/novec-tenders",
    target: "marchespublics.gov.ma",
    updatedAt: "2026-02-12",
    license: "Non renseignee",
    use: "audit-only"
  },
  {
    repository: "AbdoAnss/marchespublics-scraper",
    url: "https://github.com/AbdoAnss/marchespublics-scraper",
    target: "marchespublics.gov.ma",
    updatedAt: "2026-04-26",
    license: "Non renseignee",
    use: "audit-only"
  },
  {
    repository: "Hajariiii/Syst-me-de-Veille-des-Appels-d-Offres",
    url: "https://github.com/Hajariiii/Syst-me-de-Veille-des-Appels-d-Offres",
    target: "marchespublics.gov.ma",
    updatedAt: "2022-10-03",
    license: "Non renseignee",
    use: "audit-only"
  },
  {
    repository: "Hakimo003/crawlMarchespublics",
    url: "https://github.com/Hakimo003/crawlMarchespublics",
    target: "marchespublics.gov.ma",
    updatedAt: "2017-05-08",
    license: "Non renseignee",
    use: "audit-only"
  },
  {
    repository: "holden590/grant-finder",
    url: "https://github.com/holden590/grant-finder",
    target: "marchespublics.gov.ma",
    updatedAt: "2026-05-19",
    license: "Non renseignee",
    use: "audit-only"
  }
];
