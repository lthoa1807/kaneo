export type EditableFieldType =
  | "text"
  | "number"
  | "date"
  | "dropdown"
  | "multiselect"
  | "boolean";

export type EditableFieldDefinition = {
  name: string;
  type: EditableFieldType;
  required: boolean;
  defaultValue: string | null;
  options: string[] | null;
  hiddenOptions: string[];
};
