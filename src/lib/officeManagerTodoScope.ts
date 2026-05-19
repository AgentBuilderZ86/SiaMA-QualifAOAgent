import type { AoRecord, AoStatus } from "@/lib/aoTypes";

export const OFFICE_MANAGER_TODO_STATUSES = ["BO", "P2P"] as const;

const OFFICE_MANAGER_TODO_STATUS_SET: ReadonlySet<AoStatus> = new Set(OFFICE_MANAGER_TODO_STATUSES);

export function isOfficeManagerTodoStatus(status: AoRecord["statut"]) {
  return OFFICE_MANAGER_TODO_STATUS_SET.has(status);
}

export function filterOfficeManagerTodoRecords(records: AoRecord[]) {
  return records.filter((ao) => isOfficeManagerTodoStatus(ao.statut));
}
