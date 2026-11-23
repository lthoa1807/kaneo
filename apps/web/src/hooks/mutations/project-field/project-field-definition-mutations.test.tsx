import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import createProjectField from "@/fetchers/project-field/create-project-field";
import deleteProjectField from "@/fetchers/project-field/delete-project-field";
import reorderProjectFields from "@/fetchers/project-field/reorder-project-fields";
import updateProjectField from "@/fetchers/project-field/update-project-field";
import { projectFieldKeys } from "@/lib/project-field-query-keys";
import useCreateProjectField from "./use-create-project-field";
import useDeleteProjectField from "./use-delete-project-field";
import useReorderProjectFields from "./use-reorder-project-fields";
import useUpdateProjectField from "./use-update-project-field";

vi.mock("@/fetchers/project-field/create-project-field", () => ({
  default: vi.fn(async () => ({})),
}));
vi.mock("@/fetchers/project-field/update-project-field", () => ({
  default: vi.fn(async () => ({})),
}));
vi.mock("@/fetchers/project-field/delete-project-field", () => ({
  default: vi.fn(async () => ({})),
}));
vi.mock("@/fetchers/project-field/reorder-project-fields", () => ({
  default: vi.fn(async () => ({})),
}));

function setup<T>(hook: () => T) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(hook, { wrapper });
  return { invalidate, rendered };
}

function invalidatedPrefixes(invalidate: ReturnType<typeof vi.spyOn>) {
  return invalidate.mock.calls.map(
    (call: unknown[]) => (call[0] as { queryKey: readonly unknown[] }).queryKey,
  );
}

describe("project field definition mutations", () => {
  it("invalidates definitions, the table, and all project values on create", async () => {
    const { invalidate, rendered } = setup(() =>
      useCreateProjectField("workspace-1"),
    );

    await act(() =>
      rendered.result.current.mutateAsync({
        workspaceId: "workspace-1",
        name: "Customer",
        type: "text",
      }),
    );

    expect(vi.mocked(createProjectField)).toHaveBeenCalled();
    expect(invalidatedPrefixes(invalidate)).toEqual(
      expect.arrayContaining([
        projectFieldKeys.definitions("workspace-1"),
        projectFieldKeys.tableAll("workspace-1"),
        projectFieldKeys.valuesAll,
      ]),
    );
    expect(
      invalidatedPrefixes(invalidate).some((key: readonly unknown[]) =>
        key.includes("custom-field"),
      ),
    ).toBe(false);
  });

  it("invalidates the same scopes on update, delete, and reorder", async () => {
    const update = setup(() => useUpdateProjectField("workspace-1"));
    await act(() =>
      update.rendered.result.current.mutateAsync({
        id: "field-1",
        name: "Renamed",
      }),
    );
    expect(vi.mocked(updateProjectField).mock.calls[0]?.[0]).toEqual({
      id: "field-1",
      name: "Renamed",
    });

    const remove = setup(() => useDeleteProjectField("workspace-1"));
    await act(() => remove.rendered.result.current.mutateAsync("field-1"));
    expect(vi.mocked(deleteProjectField).mock.calls[0]?.[0]).toBe("field-1");

    const reorder = setup(() => useReorderProjectFields("workspace-1"));
    await act(() =>
      reorder.rendered.result.current.mutateAsync({
        workspaceId: "workspace-1",
        fields: [{ id: "field-1", position: 0 }],
      }),
    );
    expect(vi.mocked(reorderProjectFields).mock.calls[0]?.[0]).toEqual({
      workspaceId: "workspace-1",
      fields: [{ id: "field-1", position: 0 }],
    });

    for (const { invalidate } of [update, remove, reorder]) {
      expect(invalidatedPrefixes(invalidate)).toEqual(
        expect.arrayContaining([
          projectFieldKeys.definitions("workspace-1"),
          projectFieldKeys.tableAll("workspace-1"),
          projectFieldKeys.valuesAll,
        ]),
      );
    }
  });

  it("waits for each mutation to settle before the next one", async () => {
    const { rendered } = setup(() => useCreateProjectField("workspace-1"));
    act(() =>
      rendered.result.current.mutate({
        workspaceId: "workspace-1",
        name: "Customer",
        type: "text",
      }),
    );
    await waitFor(() => expect(rendered.result.current.isSuccess).toBe(true));
  });
});
