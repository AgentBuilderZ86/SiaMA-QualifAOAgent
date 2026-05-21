import { beforeEach, describe, expect, it, vi } from "vitest";

const saveQualification = vi.hoisted(() => vi.fn());
const requireUser = vi.hoisted(() => vi.fn(async () => "user@test.com"));
const revalidatePath = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() => vi.fn(() => {
  throw new Error("redirect should not be called");
}));

vi.mock("@/lib/ao", () => ({
  saveQualification,
  closeAo: vi.fn(),
  commitAtelierDraft: vi.fn(),
  savePitchNotes: vi.fn(),
  saveProposalSection: vi.fn(),
  saveSimulation: vi.fn(),
  saveCvAdaptations: vi.fn(),
  decideOpportunityReassignment: vi.fn(),
  updateOpportunityGovernance: vi.fn(),
  transitionAo: vi.fn(),
  runAtelierChat: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser }));

vi.mock("next/cache", () => ({ revalidatePath }));

vi.mock("next/navigation", () => ({ redirect }));

describe("qualificationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveQualification.mockResolvedValue({});
  });

  it("retourne ok:true sans appeler redirect (compatible useActionState)", async () => {
    const { qualificationAction } = await import("./actions");
    const formData = new FormData();
    formData.set("aoNum", "AO-ZIP-1");
    formData.append("documentAutres", new File(["RC : critères."], "dossier.zip", { type: "application/zip" }));

    const state = await qualificationAction({ error: "" }, formData);

    expect(state).toEqual({ error: "", ok: true });
    expect(redirect).not.toHaveBeenCalled();
    expect(saveQualification).toHaveBeenCalled();
  });
});
