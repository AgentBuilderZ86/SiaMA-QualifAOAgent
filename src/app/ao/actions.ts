"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  closeAo,
  savePitchNotes,
  saveProposalSection,
  saveQualification,
  saveSimulation,
  transitionAo
} from "@/lib/ao";
import { requireUser } from "@/lib/auth";
import type { AoStatus } from "@/lib/ao";

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
