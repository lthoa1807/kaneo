import { describe, expect, it } from "vite-plus/test";
import { normalizeTelegramConfig } from "../../../apps/api/src/plugins/telegram/config";

const base = {
  botToken: `12345678:${"x".repeat(35)}`,
  chatId: "-1001234567890",
};

describe("Telegram event defaults", () => {
  it("sends intake requests for a config stored before the key existed", () => {
    const config = normalizeTelegramConfig({
      ...base,
      events: { taskCreated: true },
    });

    expect(config.events?.intakeRequestCreated).toBe(true);
  });

  it("keeps an explicit choice to stop intake messages", () => {
    const config = normalizeTelegramConfig({
      ...base,
      events: { intakeRequestCreated: false },
    });

    expect(config.events?.intakeRequestCreated).toBe(false);
  });
});
