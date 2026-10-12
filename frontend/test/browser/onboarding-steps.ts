import { expect, type Page } from "@playwright/test";
import { inputUsdc, type AgentSettings } from "../../lib/hosted-client";

export async function configureTerminal(page: Page, settings: AgentSettings, started = false) {
  if (!started) await page.getByRole("button", { name: "开始创建 ↵", exact: true }).click();
  await page.getByLabel("名称", { exact: true }).fill(settings.name);
  await page.getByRole("button", { name: "下一项 ↵", exact: true }).click();
  await page.getByLabel("模型", { exact: true }).selectOption(settings.modelId);
  await page.getByRole("button", { name: "下一项 ↵", exact: true }).click();
  await page.getByLabel("策略", { exact: true }).selectOption(settings.strategy);
  await page.getByRole("button", { name: "下一项 ↵", exact: true }).click();
  await page.getByLabel("单次推理预算（USDC）", { exact: true }).fill(inputUsdc(settings.perRunBudgetRaw));
  await page.getByRole("button", { name: "下一项 ↵", exact: true }).click();
  await page.getByLabel("累计推理预算（USDC）", { exact: true }).fill(inputUsdc(settings.totalBudgetRaw));
  await page.getByRole("button", { name: "下一项 ↵", exact: true }).click();
  await page.getByLabel("允许任务授信", { exact: true }).selectOption(settings.allowCredit ? "yes" : "no");
  await page.getByRole("button", { name: "检查配置 ↵", exact: true }).click();
  await expect(page.getByRole("region", { name: "确认 Agent 配置" })).toBeVisible();
}
