import { readOptions } from "../custom-field/choice-options";
import type { workspaceCustomFieldDefinitionTable } from "../database/schema";
import { parseProjectFieldFormula } from "./definition-rules";
import type { ProjectFieldDefinition, ProjectFieldType } from "./types";

type StoredProjectField =
  typeof workspaceCustomFieldDefinitionTable.$inferSelect;

export function toProjectFieldDefinition(
  field: StoredProjectField,
): ProjectFieldDefinition {
  return {
    ...field,
    type: field.type as ProjectFieldType,
    options: field.options === null ? null : readOptions(field.options),
    hiddenOptions: readOptions(field.hiddenOptions),
    formula: parseProjectFieldFormula(field.formula),
  };
}
