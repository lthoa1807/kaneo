import type { ProjectFieldDefinition } from "./types";

export type TableFilter = {
  fieldId: string;
  operator: string;
  value?: string | string[];
};

export type TableSort = {
  key: string;
  direction: "asc" | "desc";
};

export type ProjectFieldTableQuery = {
  workspaceId: string;
  userId: string;
  filters: TableFilter[];
  sort: TableSort[];
  limit: number;
  offset: number;
  includeArchived: boolean;
};

export type ProjectFieldTableStatistics = {
  completionPercentage: number;
  totalTasks: number;
  dueDate: Date | null;
};

export type ProjectFieldTableRow = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  statistics: ProjectFieldTableStatistics;
  values: Record<string, string | null>;
  formulas: Record<string, string | null>;
};

export type ProjectFieldTableResult = {
  definitions: ProjectFieldDefinition[];
  projects: ProjectFieldTableRow[];
  total: number;
};

export type LoadedProjectFieldDefinition = ProjectFieldDefinition;
