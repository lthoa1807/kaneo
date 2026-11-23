import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import createProject from "@/fetchers/project/create-project";
import deleteProject from "@/fetchers/project/delete-project";
import moveProject from "@/fetchers/project/move-project";
import updateProject from "@/fetchers/project/update-project";
import { projectFieldKeys } from "@/lib/project-field-query-keys";
import useCreateProject from "./use-create-project";
import useDeleteProject from "./use-delete-project";
import useMoveProject from "./use-move-project";
import useUpdateProject from "./use-update-project";

vi.mock("@/fetchers/project/create-project", () => ({
  default: vi.fn(async () => ({})),
}));
vi.mock("@/fetchers/project/update-project", () => ({
  default: vi.fn(async () => ({})),
}));
vi.mock("@/fetchers/project/delete-project", () => ({
  default: vi.fn(async () => ({})),
}));
vi.mock("@/fetchers/project/move-project", () => ({
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
  return { invalidate, rendered, queryClient };
}

function keys(invalidate: ReturnType<typeof vi.spyOn>) {
  return invalidate.mock.calls.map(
    (call: unknown[]) => (call[0] as { queryKey: readonly unknown[] }).queryKey,
  );
}

describe("project mutations keep the project field table current", () => {
  it("invalidates the workspace table on create", async () => {
    const { invalidate, rendered } = setup(() =>
      useCreateProject({
        workspaceId: "workspace-1",
        name: "Acme",
        slug: "ACME",
        icon: "Folder",
      }),
    );
    await act(() => rendered.result.current.mutateAsync());
    expect(vi.mocked(createProject)).toHaveBeenCalled();
    expect(keys(invalidate)).toContainEqual(
      projectFieldKeys.tableAll("workspace-1"),
    );
  });

  it("falls back to the table prefix on update", async () => {
    const { invalidate, rendered } = setup(() => useUpdateProject());
    await act(() =>
      rendered.result.current.mutateAsync({
        id: "project-1",
        name: "Acme",
        icon: "Folder",
        slug: "ACME",
        description: "",
        isPublic: false,
      }),
    );
    expect(vi.mocked(updateProject)).toHaveBeenCalled();
    expect(keys(invalidate)).toContainEqual(projectFieldKeys.tablePrefix);
  });

  it("invalidates the table and the deleted project's values on delete", async () => {
    const { invalidate, rendered } = setup(() => useDeleteProject());
    await act(() => rendered.result.current.mutateAsync({ id: "project-1" }));
    expect(vi.mocked(deleteProject)).toHaveBeenCalled();
    expect(keys(invalidate)).toEqual(
      expect.arrayContaining([
        projectFieldKeys.tablePrefix,
        projectFieldKeys.values("project-1"),
      ]),
    );
  });

  it("invalidates both workspaces and the moved project's values", async () => {
    const { invalidate, rendered, queryClient } = setup(() => useMoveProject());
    queryClient.setQueryData(["project", "project-1"], {
      id: "project-1",
      workspaceId: "source",
    });

    await act(() =>
      rendered.result.current.mutateAsync({
        id: "project-1",
        workspaceId: "target",
      }),
    );
    expect(vi.mocked(moveProject)).toHaveBeenCalled();
    expect(keys(invalidate)).toEqual(
      expect.arrayContaining([
        projectFieldKeys.tableAll("source"),
        projectFieldKeys.tableAll("target"),
        projectFieldKeys.values("project-1"),
      ]),
    );
  });

  it("uses the table prefix when the source workspace is unknown", async () => {
    const { invalidate, rendered } = setup(() => useMoveProject());
    await act(() =>
      rendered.result.current.mutateAsync({
        id: "project-1",
        workspaceId: "target",
      }),
    );
    expect(keys(invalidate)).toEqual(
      expect.arrayContaining([
        projectFieldKeys.tablePrefix,
        projectFieldKeys.tableAll("target"),
        projectFieldKeys.values("project-1"),
      ]),
    );
  });
});
