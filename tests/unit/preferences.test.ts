import { isSupabaseConfigured, readPublicSupabaseEnv } from "@/lib/env";
import {
  MOTION_BOOT_SCRIPT,
  MOTION_STORAGE_KEY,
  parseMotionPreference,
  toReducedMotionConfig,
} from "@/lib/motion-preference";

describe("motion preference", () => {
  it("parses known values and falls back to system", () => {
    expect(parseMotionPreference("reduce")).toBe("reduce");
    expect(parseMotionPreference("full")).toBe("full");
    expect(parseMotionPreference("system")).toBe("system");
    expect(parseMotionPreference(null)).toBe("system");
    expect(parseMotionPreference("fast")).toBe("system");
    expect(parseMotionPreference(1)).toBe("system");
  });

  it("maps onto MotionConfig reducedMotion", () => {
    expect(toReducedMotionConfig("system")).toBe("user");
    expect(toReducedMotionConfig("reduce")).toBe("always");
    expect(toReducedMotionConfig("full")).toBe("never");
  });

  it("boot script applies a stored override before paint and tolerates blocked storage", () => {
    delete document.documentElement.dataset.motion;
    localStorage.setItem(MOTION_STORAGE_KEY, "reduce");
    new Function(MOTION_BOOT_SCRIPT)();
    expect(document.documentElement.dataset.motion).toBe("reduce");

    delete document.documentElement.dataset.motion;
    localStorage.setItem(MOTION_STORAGE_KEY, "<img onerror=x>");
    new Function(MOTION_BOOT_SCRIPT)();
    expect(document.documentElement.dataset.motion).toBeUndefined();

    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => new Function(MOTION_BOOT_SCRIPT)()).not.toThrow();
    getItem.mockRestore();
    localStorage.clear();
  });
});

describe("isSupabaseConfigured", () => {
  it("is false when values are missing or are the .env.example placeholders", () => {
    expect(isSupabaseConfigured({})).toBe(false);
    expect(
      isSupabaseConfigured({
        NEXT_PUBLIC_SUPABASE_URL: "https://your-project-ref.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_your-key-here",
      }),
    ).toBe(false);
    expect(
      isSupabaseConfigured({
        NEXT_PUBLIC_SUPABASE_URL: "not a url",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "abc",
      }),
    ).toBe(false);
    expect(
      isSupabaseConfigured({
        NEXT_PUBLIC_SUPABASE_URL: "http://example.com",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "abc",
      }),
    ).toBe(false);
  });

  it("is true for an https project or a local Supabase instance", () => {
    expect(
      isSupabaseConfigured({
        NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc",
      }),
    ).toBe(true);
    expect(
      isSupabaseConfigured({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc",
      }),
    ).toBe(true);
  });

  it("accepts the legacy anon key when no publishable key is set", () => {
    expect(
      readPublicSupabaseEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOi",
      }),
    ).toEqual({ url: "https://abcd.supabase.co", publishableKey: "eyJhbGciOi" });
  });
});
