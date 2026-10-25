import { authErrorMessage, GENERIC_AUTH_ERROR } from "@/lib/auth/errors";
import { HOME_PATH, routeAccess, safeNextPath } from "@/lib/auth/routes";
import {
  fieldErrors,
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/auth/schemas";
import { ALL_NAV_ITEMS } from "@/lib/navigation";

const APP_ROUTES = [...ALL_NAV_ITEMS.map((item) => item.href), "/add/text", "/transactions/abc"];

describe("routeAccess", () => {
  it("protects every app route and leaves auth entry points public", () => {
    for (const route of APP_ROUTES) expect(routeAccess(route), route).toBe("protected");
    expect(routeAccess("/onboarding")).toBe("protected");
    expect(routeAccess("/welcome")).toBe("public");
    expect(routeAccess("/auth/confirm")).toBe("public");
    expect(routeAccess("/login")).toBe("signed-out-only");
    expect(routeAccess("/register")).toBe("signed-out-only");
    expect(routeAccess("/forgot-password")).toBe("signed-out-only");
    expect(routeAccess("/reset-password")).toBe("recovery");
  });

  it("matches on path segments, not prefixes", () => {
    expect(routeAccess("/loginx")).toBe("protected");
    expect(routeAccess("/welcome-back")).toBe("protected");
    expect(routeAccess("/authority")).toBe("protected");
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/transactions?period=month", "/transactions?period=month"],
    ["/home", "/home"],
    ["//evil.example/home", HOME_PATH],
    ["/\\evil.example", HOME_PATH],
    ["https://evil.example", HOME_PATH],
    ["javascript:alert(1)", HOME_PATH],
    ["home", HOME_PATH],
    ["/login", HOME_PATH],
    ["/register?x=1", HOME_PATH],
    ["/ok\nSet-Cookie: x", HOME_PATH],
    [null, HOME_PATH],
    [42, HOME_PATH],
  ])("%j → %j", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("auth form schemas", () => {
  it("validates sign-in input", () => {
    expect(signInSchema.safeParse({ email: " a@b.co ", password: "x" }).data?.email).toBe("a@b.co");
    const bad = signInSchema.safeParse({ email: "nope", password: "" });
    expect(bad.success).toBe(false);
    expect(fieldErrors(bad.error!)).toEqual({
      email: "Enter a valid email address.",
      password: "Enter your password.",
    });
  });

  it("requires matching passwords of 8–72 characters on sign-up and reset", () => {
    const base = { email: "a@b.co", password: "short", confirmPassword: "short" };
    expect(fieldErrors(signUpSchema.safeParse(base).error!).password).toBe(
      "Use at least 8 characters.",
    );
    const mismatch = signUpSchema.safeParse({
      ...base,
      password: "longenough",
      confirmPassword: "different",
    });
    expect(fieldErrors(mismatch.error!).confirmPassword).toBe("Passwords don’t match.");
    expect(
      resetPasswordSchema.safeParse({ password: "x".repeat(73), confirmPassword: "x".repeat(73) })
        .success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({
        password: "a long passphrase",
        confirmPassword: "a long passphrase",
      }).success,
    ).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "" }).success).toBe(false);
  });
});

describe("authErrorMessage", () => {
  it("maps known codes and never echoes server text", () => {
    expect(authErrorMessage({ code: "invalid_credentials" })).toMatch(/don’t match/);
    expect(authErrorMessage({ code: "user_already_exists" })).not.toMatch(/already registered/);
    expect(authErrorMessage({ status: 429 })).toMatch(/Too many attempts/);
    expect(authErrorMessage({ code: "something_new" })).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage(null)).toBe(GENERIC_AUTH_ERROR);
  });
});
