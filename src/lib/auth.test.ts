import { describe, expect, it, beforeEach } from "vitest";
import { validateLogin } from "@/lib/auth";

describe("validateLogin", () => {
  beforeEach(() => {
    process.env["APP_USER_EMAIL"] = "admin@sia.com";
    process.env["APP_USER_PASSWORD"] = "secret123";
  });

  it("accepte des identifiants corrects", () => {
    expect(validateLogin("admin@sia.com", "secret123")).toBe(true);
  });

  it("refuse un mot de passe incorrect", () => {
    expect(validateLogin("admin@sia.com", "mauvais")).toBe(false);
  });

  it("refuse un email incorrect", () => {
    expect(validateLogin("autre@sia.com", "secret123")).toBe(false);
  });

  it("est insensible à la casse pour l'email", () => {
    expect(validateLogin("ADMIN@SIA.COM", "secret123")).toBe(true);
  });

  it("retourne false si les variables d'environnement sont absentes", () => {
    delete process.env["APP_USER_EMAIL"];
    delete process.env["APP_USER_PASSWORD"];
    expect(validateLogin("", "")).toBe(false);
  });

  it("ne throw pas quand les longueurs diffèrent (timing-safe)", () => {
    expect(() => validateLogin("x", "secret123")).not.toThrow();
    expect(validateLogin("x", "secret123")).toBe(false);
  });
});
