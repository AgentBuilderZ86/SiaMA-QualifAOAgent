import { beforeEach, describe, expect, it, vi } from "vitest";

const saveQualification = vi.hoisted(() => vi.fn());
const requireUser = vi.hoisted(() => vi.fn(async () => "user@test.com"));
const revalidatePath = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() => vi.fn((url: string) => {
  const err = new Error("NEXT_REDIRECT") as Error & { digest: string };
  err.digest = `NEXT_REDIRECT;replace;${url};307;`;
  throw err;
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

describe("qualificationAction (form natif)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveQualification.mockResolvedValue({});
  });

  it("redirige vers la fiche AO après succès (pattern pré-PR #11)", async () => {
    const { qualificationAction } = await import("./actions");
    const formData = new FormData();
    formData.set("aoNum", "AO-ZIP-1");

    await expect(qualificationAction(formData)).rejects.toMatchObject({
      digest: expect.stringContaining("/ao/AO-ZIP-1")
    });
    expect(redirect).toHaveBeenCalledWith("/ao/AO-ZIP-1");
    expect(saveQualification).toHaveBeenCalled();
  });

  it("redirige vers qualification?qualError= en cas d'échec métier", async () => {
    saveQualification.mockRejectedValue(new Error("Corpus documentaire vide"));
    const { qualificationAction } = await import("./actions");
    const formData = new FormData();
    formData.set("aoNum", "AO-ERR");

    await expect(qualificationAction(formData)).rejects.toMatchObject({
      digest: expect.stringContaining("qualError=")
    });
  });
});
