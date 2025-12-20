import { expect, test } from "@playwright/test";
import { readState } from "./_state";

test("issues list loads", async ({ page }, testInfo) => {
  const { baseURL } = await readState(testInfo.project.name as "local" | "remote");
  await page.goto(`${baseURL}/issues`);
  await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible();
  await expect(page.getByText("issue-1")).toBeVisible();
});

test("can post a comment from issue page", async ({ page }, testInfo) => {
  const { baseURL } = await readState(testInfo.project.name as "local" | "remote");
  await page.goto(`${baseURL}/issues/issue-1`);

  const txt = `e2e-${Date.now()}`;
  await page.getByPlaceholder("Write a comment…").fill(txt);
  await page.getByRole("button", { name: "Post" }).click();

  await expect(page.getByText(txt)).toBeVisible();
});


