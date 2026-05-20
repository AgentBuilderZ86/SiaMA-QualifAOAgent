"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  closeAo,
  commitAtelierDraft,
  savePitchNotes,
  saveProposalSection,
  saveQualification,
  saveSimulation,
  saveCvAdaptations,
  decideOpportunityReassignment,
  updateOpportunityGovernance,
  transitionAo,
  runAtelierChat
} from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import type { AoStatus } from "@/lib/ao";
import type { AtelierCommitPayload, AtelierLastDraft } from "@/lib/atelierStrategie";

function pathFor(aoNum: string) {
  return `/ao/${encodeURIComponent(aoNum)}`;
}

export async function transitionAction(formData: FormData) {
  const actor = await requireUser();
  const aoNum = String(formData.get("aoNum") || "");
  const status = String(formData.get("status") || "") as AoStatus;
  const note = String(formData.get("note") || "");
  await transitionAo(aoNum, status, actor, note);
  revalidatePath("/dashboard");
  revalidatePath(pathFor(aoNum));
  redirect(pathFor(aoNum));
}

export async function opportunityGovernanceAction(formData: FormData) {
  const actor = await requireUser();
  const aoNum = String(formData.get("aoNum") || "");
  await updateOpportunityGovernance(aoNum, actor, {
    status: String(formData.get("status") || ""),
    justification: String(formData.get("justification") || ""),
    recommendedManager: String(formData.get("recommendedManager") || "")
  });
  revalidatePath("/dashboard");
  revalidatePath("/chat");
  revalidatePath("/rules");
  revalidatePath(pathFor(aoNum));
  redirect(pathFor(aoNum));
}

export async function reassignmentDecisionAction(formData: FormData) {
  const actor = await requireUser();
  const aoNum = String(formData.get("aoNum") || "");
  const decision = String(formData.get("decision") || "") === "accept" ? "accept" : "reject";
  await decideOpportunityReassignment(aoNum, actor, decision, String(formData.get("justification") || ""));
  revalidatePath("/dashboard");
  revalidatePath("/chat");
  revalidatePath("/rules");
  revalidatePath(pathFor(aoNum));
  redirect(pathFor(aoNum));
}

export async function qualificationAction(formData: FormData) {
  const actor = await requireUser();
  const aoNum = String(formData.get("aoNum") || "");
  await saveQualification(aoNum, actor, formData);
  revalidatePath("/dashboard");
  revalidatePath(pathFor(aoNum));
  redirect(pathFor(aoNum));
}

export async function simulationAction(formData: FormData) {
  const actor = await requireUser();
  const aoNum = String(formData.get("aoNum") || "");
  const budget = String(formData.get("budget") || "");
  await saveSimulation(aoNum, actor, budget);
  revalidatePath("/dashboard");
  revalidatePath(pathFor(aoNum));
  redirect(pathFor(aoNum));
}

export async function proposalAction(formData: FormData) {
  const actor = await requireUser();
  const aoNum = String(formData.get("aoNum") || "");
  const section = String(formData.get("section") || "Introduction");
  const context = String(formData.get("context") || "");
  await saveProposalSection(aoNum, actor, section, context);
  revalidatePath("/dashboard");
  revalidatePath(pathFor(aoNum));
  redirect(pathFor(aoNum));
}

export async function cvAdaptationAction(formData: FormData) {
  const actor = await requireUser();
  const aoNum = String(formData.get("aoNum") || "");
  await saveCvAdaptations(aoNum, actor, formData);
  revalidatePath("/dashboard");
  revalidatePath(pathFor(aoNum));
  revalidatePath(`${pathFor(aoNum)}/proposal`);
  redirect(`${pathFor(aoNum)}/proposal`);
}

export async function pitchAction(formData: FormData) {
  const actor = await requireUser();
  const aoNum = String(formData.get("aoNum") || "");
  const notes = String(formData.get("notes") || "");
  await savePitchNotes(aoNum, actor, notes);
  revalidatePath("/dashboard");
  revalidatePath(pathFor(aoNum));
  redirect(pathFor(aoNum));
}

export async function closureAction(formData: FormData) {
  const actor = await requireUser();
  const aoNum = String(formData.get("aoNum") || "");
  await closeAo(aoNum, actor, {
    result: String(formData.get("result") || "PL") as "PW" | "PL",
    finalAmount: String(formData.get("finalAmount") || ""),
    competitor: String(formData.get("competitor") || ""),
    reason: String(formData.get("reason") || "À documenter"),
    lessons: String(formData.get("lessons") || "")
  });
  revalidatePath("/dashboard");
  revalidatePath(pathFor(aoNum));
  redirect(pathFor(aoNum));
}

export type AtelierChatActionResult =
  | { ok: true; messages: Array<{ role: "user" | "assistant"; content: string; at: string }>; lastDraft?: AtelierLastDraft }
  | { ok: false; error: string };

export async function atelierChatAction(aoNum: string, newUserMessage: string): Promise<AtelierChatActionResult> {
  try {
    const actor = await requireUser();
    const out = await runAtelierChat(aoNum, actor, newUserMessage);
    const p = pathFor(aoNum);
    revalidatePath(p);
    revalidatePath(`${p}/atelier-reponse`);
    revalidatePath("/dashboard");
    return { ok: true, messages: out.messages, lastDraft: out.lastDraft };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue" };
  }
}

export type AtelierCommitActionResult = { ok: true } | { ok: false; error: string };

export async function atelierCommitAction(aoNum: string, payload: AtelierCommitPayload): Promise<AtelierCommitActionResult> {
  try {
    const actor = await requireUser();
    await commitAtelierDraft(aoNum, actor, payload);
    const p = pathFor(aoNum);
    revalidatePath(p);
    revalidatePath(`${p}/atelier-reponse`);
    revalidatePath(`${p}/proposal`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue" };
  }
}
