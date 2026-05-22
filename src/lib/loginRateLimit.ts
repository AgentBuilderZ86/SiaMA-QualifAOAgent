/** Tentatives max avant blocage. */
const MAX_ATTEMPTS = 5;
/** Fenêtre glissante en ms (15 min). */
const WINDOW_MS = 15 * 60 * 1_000;

type Entry = { count: number; firstAttemptAt: number };

// Module-level Map : persiste entre requêtes dans une même instance Lambda chaude.
// Sur cold start Netlify la map est vide — protection best-effort pour un outil interne.
const store = new Map<string, Entry>();

/**
 * Enregistre une tentative pour la clé donnée (IP ou email).
 * Retourne `allowed: false` si le quota est dépassé dans la fenêtre.
 */
export function recordLoginAttempt(key: string): { allowed: boolean; attemptsLeft: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.firstAttemptAt > WINDOW_MS) {
    store.set(key, { count: 1, firstAttemptAt: now });
    return { allowed: true, attemptsLeft: MAX_ATTEMPTS - 1 };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, attemptsLeft: 0 };
  }

  entry.count++;
  return { allowed: true, attemptsLeft: MAX_ATTEMPTS - entry.count };
}

/** Réinitialise le compteur après une connexion réussie. */
export function resetLoginAttempts(key: string) {
  store.delete(key);
}
