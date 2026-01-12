// List of feature flags
export const FEATURE_FLAGS = {
  SUBTITLES_SUPPORT: true,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export function isEnabled(flag: FeatureFlag): boolean {
  const envKey = `NEXT_PUBLIC_FF_${flag}`;
  const envValue = process.env[envKey];

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
