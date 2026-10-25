import { expect, test } from "@playwright/test";

import { APP_ROUTES, PUBLIC_ROUTES } from "./routes";

// Signed-out behaviour. None of these submit valid credentials, so they never create accounts
// or contact the Supabase project beyond loading pages.

test("root sends signed-out visitors to welcome", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("₹10");
});

for (const route of APP_ROUTES) {
  test(`${route} requires sign-in and remembers where to return`, async ({ page }) => {
    await page.goto(`${route}?from=e2e`);
    await expect(page).toHaveURL((url) => url.pathname === "/login");
    const next = new URL(page.url()).searchParams.get("next");
    expect(next).toBe(`${route}?from=e2e`);
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
  });
}

for (const route of PUBLIC_ROUTES) {
  test(`${route} renders with a heading, no horizontal overflow and no console errors`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/coming soon/i);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

test("sign-in validates input on the server and keeps the email", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByText("Enter your password.")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("not-an-email");
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
});

test("registration checks password length and confirmation", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Email").fill("student@example.com");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByLabel("Confirm password").fill("different");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
  await expect(page.getByText("Passwords don’t match.")).toBeVisible();
});

test("forgot-password validates the email", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("Enter your email address.")).toBeVisible();
});

test("reset-password without a recovery session offers a new link", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "No active reset link" })).toBeVisible();
  await page.getByRole("link", { name: "Send a new link" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});

test("an invalid email link explains itself", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=bogus&type=recovery&next=/reset-password");
  await expect(page).toHaveURL(/\/forgot-password\?error=link_invalid$/);
  await expect(page.getByRole("alert").filter({ hasText: "invalid or has expired" })).toBeVisible();
});

test("post-login redirects can't leave the site", async ({ page }) => {
  await page.goto("/login?next=//evil.example");
  await expect(page.locator('input[name="next"]')).toHaveValue("/home");
});

test("theme choice persists across reloads on public pages", async ({ page }) => {
  await page.goto("/welcome");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByTestId("theme-switcher").click();
  await page.getByRole("menuitemradio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/light/);
});
