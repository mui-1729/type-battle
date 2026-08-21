import { expect, test } from "@playwright/test";

test("keeps player report context and lets the user review the issue draft", async ({ page }) => {
  await page.goto(
    "/feedback?kind=player-report&roomCode=ABC234&opponentId=guest_rival&opponentNickname=Rival"
  );

  await expect(page.getByRole("heading", { name: "対戦相手を報告" })).toBeVisible();
  await expect(page.getByText("ABC234", { exact: true })).toBeVisible();
  await expect(page.getByText("Rival", { exact: true })).toBeVisible();
  await expect(page.getByText("guest_rival", { exact: true })).toBeVisible();

  const reviewLink = page.getByRole("link", { name: /報告内容を確認する/ });
  const initialHref = await reviewLink.getAttribute("href");
  expect(initialHref).not.toBeNull();
  const initialIssueUrl = new URL(initialHref ?? "https://example.invalid");
  expect(initialIssueUrl.origin).toBe("https://github.com");
  expect(initialIssueUrl.pathname).toBe("/mui-1729/type-battle/issues/new");
  expect(initialIssueUrl.searchParams.get("body")).toContain("room: ABC234");
  expect(initialIssueUrl.searchParams.get("body")).toContain("opponent id: guest_rival");

  await page.getByLabel("報告理由").selectOption("nickname");
  await expect.poll(async () => {
    const href = await reviewLink.getAttribute("href");
    return href ? new URL(href).searchParams.get("title") : null;
  }).toContain("不適切なニックネーム");

  await expect(page.getByText(/GitHub Issue は公開されます/)).toBeVisible();
});
