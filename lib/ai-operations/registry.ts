import type { AiOperation } from "./types";
import { OPERATIONS as ticketOps } from "./modules/tickets";
import { OPERATIONS as taxonomyOps } from "./modules/taxonomy";
import { OPERATIONS as orgOps } from "./modules/org";
import { OPERATIONS as catalogOps } from "./modules/catalog-services";
import { OPERATIONS as cmdbOps } from "./modules/cmdb";
import { OPERATIONS as configOps } from "./modules/config";
import { OPERATIONS as knowledgeOps } from "./modules/knowledge";
import { OPERATIONS as pcOps } from "./modules/problems-changes";
import { OPERATIONS as projectOps } from "./modules/projects";

/** Every RBAC-gated operation Sable can perform, composed from the domain modules. */
export const ALL_OPERATIONS: AiOperation[] = [
  ...ticketOps,
  ...taxonomyOps,
  ...orgOps,
  ...catalogOps,
  ...cmdbOps,
  ...configOps,
  ...knowledgeOps,
  ...pcOps,
  ...projectOps,
];

const BY_ID = new Map(ALL_OPERATIONS.map((o) => [o.id, o]));

export function findOperation(id: string): AiOperation | undefined {
  return BY_ID.get(id);
}
