import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import getDashboardSummary from "@/fetchers/dashboard/get-dashboard-summary";
import useGetDashboardSummary from "./use-get-dashboard-summary";

vi.mock("@/fetchers/dashboard/get-dashboard-summary", () => ({
  default: vi.fn(),
}));

const mockedFetch = vi.mocked(getDashboardSummary);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useGetDashboardSummary", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValue({ generatedAt: new Date() } as never);
  });

  it("does not fetch for a guest, who holds no task:read", () => {
    const { result } = renderHook(
      () => useGetDashboardSummary("workspace-1", false),
      { wrapper },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("fetches once the page may run, under the dashboard key", async () => {
    const { result } = renderHook(
      () => useGetDashboardSummary("workspace-1", true),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockedFetch).toHaveBeenCalledWith("workspace-1");
    expect(result.current.data).toEqual({ generatedAt: expect.any(Date) });
  });
});
