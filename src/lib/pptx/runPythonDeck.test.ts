import { afterEach, describe, expect, it } from "vitest";

import { deckEngineFromEnv } from "./runPythonDeck";

describe("deckEngineFromEnv", () => {
  const prev = process.env.QUALIFICATION_DECK_ENGINE;

  afterEach(() => {
    if (prev === undefined) delete process.env.QUALIFICATION_DECK_ENGINE;
    else process.env.QUALIFICATION_DECK_ENGINE = prev;
  });

  it("retourne auto par défaut", () => {
    delete process.env.QUALIFICATION_DECK_ENGINE;
    expect(deckEngineFromEnv()).toBe("auto");
  });

  it("accepte python et pptxgen en minuscules", () => {
    process.env.QUALIFICATION_DECK_ENGINE = "PYTHON";
    expect(deckEngineFromEnv()).toBe("python");
    process.env.QUALIFICATION_DECK_ENGINE = "PPTXGEN";
    expect(deckEngineFromEnv()).toBe("pptxgen");
  });

  it("retourne auto pour une valeur inconnue", () => {
    process.env.QUALIFICATION_DECK_ENGINE = "nope";
    expect(deckEngineFromEnv()).toBe("auto");
  });
});
