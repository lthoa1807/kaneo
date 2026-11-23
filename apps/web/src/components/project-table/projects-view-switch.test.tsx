import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ProjectsViewSwitch } from "./projects-view-switch";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key.split(".").pop() }),
}));

afterEach(cleanup);

describe("ProjectsViewSwitch", () => {
  it("shows how many project fields the table has", () => {
    render(
      <ProjectsViewSwitch view="overview" fieldCount={2} onChange={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "fields (2)" })).toBeDefined();
  });

  it("keeps the label plain when the workspace has no fields", () => {
    render(<ProjectsViewSwitch view="fields" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "fields" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: "fields" }).getAttribute("title"),
    ).toBe("fieldsHint");
  });
});
