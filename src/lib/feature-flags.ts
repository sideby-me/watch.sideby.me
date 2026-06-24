// List of feature flags
export const FEATURE_FLAGS = {
  SUBTITLES_SUPPORT: true,
  SFU_MEDIA: false, // default OFF; flip via NEXT_PUBLIC_FF_SFU_MEDIA=true (requires Vercel redeploy)
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

// Next.js only inlines NEXT_PUBLIC_* env vars into the client bundle when accessed
// as static literal member expressions (process.env.NEXT_PUBLIC_FF_X). A computed
// access like process.env[`NEXT_PUBLIC_FF_${flag}`] is never replaced and evaluates
// to undefined in the browser, so this static per-flag map is required.
const FLAG_ENV: Record<FeatureFlag, string | undefined> = {
  SUBTITLES_SUPPORT: process.env.NEXT_PUBLIC_FF_SUBTITLES_SUPPORT,
  SFU_MEDIA: process.env.NEXT_PUBLIC_FF_SFU_MEDIA,
};

export function isEnabled(flag: FeatureFlag): boolean {
  const envValue = FLAG_ENV[flag];

  if (envValue !== undefined) {
    return envValue === 'true';
  }

  return FEATURE_FLAGS[flag];
}

// Debugging utility
export function getAllFeatureFlags(): Record<FeatureFlag, boolean> {
  return Object.keys(FEATURE_FLAGS).reduce(
    (acc, flag) => {
      acc[flag as FeatureFlag] = isEnabled(flag as FeatureFlag);
      return acc;
    },
    {} as Record<FeatureFlag, boolean>
  );
}
