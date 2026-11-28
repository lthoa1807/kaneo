import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { IntakeStatus } from "./intake-status";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { IntakeStepper } = await import("./intake-stepper");

afterEach(cleanup);

function renderStepper(status: IntakeStatus) {
  render(<IntakeStepper status={status} />);
  return screen.getAllByRole("listitem");
}

function currentStep() {
  return document.querySelector('[aria-current="step"]');
}

describe("IntakeStepper", () => {
  it("marks earlier steps done and later steps upcoming", () => {
    const steps = renderStepper("in_progress");

    expect(steps).toHaveLength(5);
    expect(steps[0]?.dataset.state).toBe("done");
    expect(steps[1]?.dataset.state).toBe("done");
    expect(steps[2]?.dataset.state).toBe("current");
    expect(steps[3]?.dataset.state).toBe("upcoming");
    expect(currentStep()).toBe(steps[2]);
    expect(steps[2]?.textContent).toContain("intake:detail.stepper.inProgress");
  });

  it("puts the current step at 4 when the request is delivered", () => {
    const steps = renderStepper("delivered");

    expect(currentStep()).toBe(steps[3]);
    expect(steps[3]?.textContent).toContain("intake:detail.stepper.awaiting");
  });

  it("keeps step 3 current on needs_revision and adds the feedback note", () => {
    const steps = renderStepper("needs_revision");

    expect(currentStep()).toBe(steps[2]);
    expect(screen.getByText("intake:detail.stepper.revisionNote")).toBeTruthy();
  });

  it("shows every step done on confirmed without a current step", () => {
    const steps = renderStepper("confirmed");

    expect(currentStep()).toBeNull();
    for (const step of steps) {
      expect(step.dataset.state).toBe("done");
    }
  });

  it("ends the line on rejected instead of drawing steps 4 and 5", () => {
    const steps = renderStepper("rejected");

    expect(steps).toHaveLength(3);
    expect(steps[1]?.dataset.state).toBe("done");
    expect(steps[2]?.dataset.state).toBe("rejected");
    expect(steps[2]?.textContent).toContain("intake:detail.stepper.rejected");
    expect(currentStep()).toBeNull();
    expect(screen.getByText("intake:detail.stepper.rejectedNote")).toBeTruthy();
  });
});
