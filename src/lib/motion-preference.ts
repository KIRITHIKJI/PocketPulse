/**
 * In-app motion preference. "system" follows the OS `prefers-reduced-motion` setting;
 * "reduce" and "full" override it. Stored per device until profile preferences sync (Phase 4).
 */
export const MOTION_PREFERENCES = ["system", "reduce", "full"] as const;
export type MotionPreference = (typeof MOTION_PREFERENCES)[number];

export const MOTION_STORAGE_KEY = "pp-motion";

export function parseMotionPreference(value: unknown): MotionPreference {
  return MOTION_PREFERENCES.includes(value as MotionPreference)
    ? (value as MotionPreference)
    : "system";
}

/** Maps the preference onto Motion's `MotionConfig.reducedMotion` values. */
export function toReducedMotionConfig(preference: MotionPreference): "user" | "always" | "never" {
  if (preference === "reduce") return "always";
  if (preference === "full") return "never";
  return "user";
}

/**
 * Inline script run before first paint so CSS reduced-motion overrides apply without a flash.
 * Kept dependency-free and wrapped in try/catch because storage can be blocked.
 */
export const MOTION_BOOT_SCRIPT = `(function(){try{var v=localStorage.getItem(${JSON.stringify(
  MOTION_STORAGE_KEY,
)});if(v==="reduce"||v==="full"){document.documentElement.dataset.motion=v;}}catch(e){}})();`;
