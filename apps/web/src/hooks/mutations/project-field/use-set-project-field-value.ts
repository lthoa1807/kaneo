import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  ProjectFieldTableResponse,
  ProjectFieldWithValue,
} from "@/components/project-fields/types";
import setProjectFieldValue, {
  type SetProjectFieldValueRequest,
} from "@/fetchers/project-field/set-project-field-value";
import { projectFieldKeys } from "@/lib/project-field-query-keys";

export type SetProjectFieldValueArgs = SetProjectFieldValueRequest & {
  workspaceId: string;
  projectId: string;
};

type ValuesSnapshot = Array<
  [queryKey: readonly unknown[], data: ProjectFieldWithValue[] | undefined]
>;
type TableSnapshot = Array<
  [queryKey: readonly unknown[], data: ProjectFieldTableResponse | undefined]
>;

function useSetProjectFieldValue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, fieldId, value }: SetProjectFieldValueArgs) =>
      setProjectFieldValue({ projectId, fieldId, value }),
    onMutate: async ({ workspaceId, projectId, fieldId, value }) => {
      const valuesKey = projectFieldKeys.values(projectId);
      const tableKey = projectFieldKeys.tableAll(workspaceId);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: valuesKey }),
        queryClient.cancelQueries({ queryKey: tableKey }),
      ]);

      const valuesSnapshot: ValuesSnapshot = queryClient.getQueriesData({
        queryKey: valuesKey,
      });
      const tableSnapshot: TableSnapshot = queryClient.getQueriesData({
        queryKey: tableKey,
      });

      queryClient.setQueriesData<ProjectFieldWithValue[]>(
        { queryKey: valuesKey },
        (fields) =>
          fields?.map((field) =>
            field.id === fieldId ? { ...field, value } : field,
          ),
      );
      queryClient.setQueriesData<ProjectFieldTableResponse>(
        { queryKey: tableKey },
        (table) =>
          table
            ? {
                ...table,
                projects: table.projects.map((project) =>
                  project.id === projectId
                    ? {
                        ...project,
                        values: { ...project.values, [fieldId]: value },
                      }
                    : project,
                ),
              }
            : table,
      );

      return { valuesSnapshot, tableSnapshot };
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.valuesSnapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
      for (const [key, data] of context?.tableSnapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSettled: (_data, _error, { workspaceId, projectId }) => {
      void queryClient.invalidateQueries({
        queryKey: projectFieldKeys.values(projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: projectFieldKeys.tableAll(workspaceId),
      });
    },
  });
}

export default useSetProjectFieldValue;
