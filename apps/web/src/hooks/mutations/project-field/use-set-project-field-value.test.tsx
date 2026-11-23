import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import type {
  ProjectFieldTableResponse,
  ProjectFieldWithValue,
} from "@/components/project-fields/types";
import setProjectFieldValue from "@/fetchers/project-field/set-project-field-value";
import { projectFieldKeys } from "@/lib/project-field-query-keys";
import useSetProjectFieldValue from "./use-set-project-field-value";

vi.mock("@/fetchers/project-field/set-project-field-value", () => ({
  default: vi.fn(),
}));

const mockedSetValue = vi.mocked(setProjectFieldValue);

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function values(value: string | null): ProjectFieldWithValue[] {
  return [
    {
      id: "customer",
      workspaceId: "workspace-1",
      projectId: "project-1",
      name: "Customer",
      type: "text",
      required: false,
      defaultValue: null,
      options: null,
      hiddenOptions: [],
      formula: null,
      position: 0,
      createdAt: "",
      updatedAt: "",
      valueId: value ? "value-1" : null,
      value,
      computedValue: null,
    },
  ];
}

function table(value: string | null): ProjectFieldTableResponse {
  return {
    definitions: [],
    total: 1,
    projects: [
      {
        id: "project-1",
        name: "Acme",
        slug: "ACME",
        icon: null,
        archivedAt: null,
        createdAt: "",
        statistics: {
          completionPercentage: 0,
          totalTasks: 0,
          dueDate: null,
        },
        values: { customer: value },
        formulas: {},
      },
    ],
  };
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(projectFieldKeys.values("project-1"), values("Old"));
  queryClient.setQueryData(
    projectFieldKeys.table("workspace-1", { page: 0 }),
    table("Old"),
  );
  queryClient.setQueryData(
    projectFieldKeys.table("workspace-1", { page: 1 }),
    table("Old"),
  );
  const { result } = renderHook(() => useSetProjectFieldValue(), {
    wrapper: createWrapper(queryClient),
  });
  return { queryClient, result };
}

describe("useSetProjectFieldValue", () => {
  it("optimistically writes the value into values and every table page", async () => {
    let resolve: (value: unknown) => void = () => {};
    mockedSetValue.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }) as never,
    );
    const { queryClient, result } = setup();

    act(() => {
      result.current.mutate({
        workspaceId: "workspace-1",
        projectId: "project-1",
        fieldId: "customer",
        value: "Acme",
      });
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData<ProjectFieldWithValue[]>(
          projectFieldKeys.values("project-1"),
        )?.[0]?.value,
      ).toBe("Acme");
    });
    expect(
      queryClient.getQueryData<ProjectFieldTableResponse>(
        projectFieldKeys.table("workspace-1", { page: 0 }),
      )?.projects[0]?.values.customer,
    ).toBe("Acme");
    expect(
      queryClient.getQueryData<ProjectFieldTableResponse>(
        projectFieldKeys.table("workspace-1", { page: 1 }),
      )?.projects[0]?.values.customer,
    ).toBe("Acme");

    resolve({});
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("rolls every snapshot back when the server rejects the write", async () => {
    mockedSetValue.mockRejectedValue(new Error("Nope"));
    const { queryClient, result } = setup();

    act(() => {
      result.current.mutate({
        workspaceId: "workspace-1",
        projectId: "project-1",
        fieldId: "customer",
        value: "Acme",
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(
      queryClient.getQueryData<ProjectFieldWithValue[]>(
        projectFieldKeys.values("project-1"),
      )?.[0]?.value,
    ).toBe("Old");
    expect(
      queryClient.getQueryData<ProjectFieldTableResponse>(
        projectFieldKeys.table("workspace-1", { page: 0 }),
      )?.projects[0]?.values.customer,
    ).toBe("Old");
    expect(
      queryClient.getQueryData<ProjectFieldTableResponse>(
        projectFieldKeys.table("workspace-1", { page: 1 }),
      )?.projects[0]?.values.customer,
    ).toBe("Old");
  });

  it("clears an optional value optimistically", async () => {
    mockedSetValue.mockResolvedValue({} as never);
    const { queryClient, result } = setup();

    await act(async () => {
      await result.current.mutateAsync({
        workspaceId: "workspace-1",
        projectId: "project-1",
        fieldId: "customer",
        value: null,
      });
    });

    expect(mockedSetValue).toHaveBeenCalledWith({
      projectId: "project-1",
      fieldId: "customer",
      value: null,
    });
    expect(
      queryClient.getQueryData<ProjectFieldWithValue[]>(
        projectFieldKeys.values("project-1"),
      )?.[0]?.value,
    ).toBeNull();
  });
});
