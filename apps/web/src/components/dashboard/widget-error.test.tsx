import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";

vi.mock("react-i18next", async (original) => ({
  ...(await original<object>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

import WidgetError from "./widget-error";

afterEach(cleanup);

it("states the failure and retries on demand", () => {
  const onRetry = vi.fn();
  render(<WidgetError onRetry={onRetry} />);

  expect(screen.getByText("dashboard:error.title")).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "dashboard:error.retry" }),
  );
  expect(onRetry).toHaveBeenCalledOnce();
});
