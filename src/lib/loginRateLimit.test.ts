import { describe, expect, it, beforeEach } from "vitest";
import { recordLoginAttempt, resetLoginAttempts } from "@/lib/loginRateLimit";

describe("loginRateLimit", () => {
  beforeEach(() => {
    // Réinitialise le store entre chaque test via une clé unique
  });

  it("autorise les premières tentatives", () => {
    const key = `test-${Math.random()}`;
    const result = recordLoginAttempt(key);
    expect(result.allowed).toBe(true);
    expect(result.attemptsLeft).toBe(4);
  });

  it("bloque après 5 tentatives sur la même clé", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) recordLoginAttempt(key);
    const blocked = recordLoginAttempt(key);
    expect(blocked.allowed).toBe(false);
    expect(blocked.attemptsLeft).toBe(0);
  });

  it("resetLoginAttempts réinitialise le compteur", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) recordLoginAttempt(key);
    resetLoginAttempts(key);
    const result = recordLoginAttempt(key);
    expect(result.allowed).toBe(true);
  });

  it("les clés différentes sont indépendantes", () => {
    const keyA = `test-a-${Math.random()}`;
    const keyB = `test-b-${Math.random()}`;
    for (let i = 0; i < 5; i++) recordLoginAttempt(keyA);
    const result = recordLoginAttempt(keyB);
    expect(result.allowed).toBe(true);
  });
});
