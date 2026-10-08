import type { BrowserContextOptions } from 'playwright';
import { z } from 'zod';
import type { KeyboardCoverage, StoredScenarioRun } from './types.js';

export const EXTRA_ENVIRONMENTS = ['mobile', 'zoom-200', 'forced-colors'] as const;
export type ExtraEnvironment = (typeof EXTRA_ENVIRONMENTS)[number];
export type EnvironmentId = 'desktop' | ExtraEnvironment;

export interface ScanEnvironment {
  id: EnvironmentId;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  forcedColors: 'active' | 'none';
}

export const environmentsSchema = z
  .array(z.enum(EXTRA_ENVIRONMENTS))
  .max(3)
  .refine((values) => new Set(values).size === values.length, 'Choose each environment only once');

const PROFILES: Record<EnvironmentId, ScanEnvironment> = {
  desktop: {
    id: 'desktop',
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    forcedColors: 'none',
  },
  mobile: {
    id: 'mobile',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    forcedColors: 'none',
  },
  // Desktop layout at 200%: half the CSS viewport, double the device scale.
  // This emulates reflow, not browser UI zoom or WCAG conformance.
  'zoom-200': {
    id: 'zoom-200',
    viewport: { width: 640, height: 360 },
    deviceScaleFactor: 2,
    forcedColors: 'none',
  },
  'forced-colors': {
    id: 'forced-colors',
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    forcedColors: 'active',
  },
};

export function scanEnvironments(extra: ExtraEnvironment[] = []): ScanEnvironment[] {
  return ['desktop' as const, ...extra].map((id) => structuredClone(PROFILES[id]));
}

export function environmentOptions(profile: ScanEnvironment): BrowserContextOptions {
  return {
    viewport: profile.viewport,
    screen: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    forcedColors: profile.forcedColors,
  };
}

export interface EnvironmentRun {
  environment: ScanEnvironment;
  status: 'completed' | 'failed';
  error: string | null;
  elapsedMs: number;
  findings: number;
  keyboardCoverage: KeyboardCoverage | null;
  scenarioRuns: StoredScenarioRun[];
}
