import { Buffer } from 'node:buffer';
import { LIMITS } from './profile.mjs';

const SCHOOL_CASE_FILE = 'oh-school-district-part-year-native.spec.ts';
const PHASES = ['school-entry', 'school-first-confirmation', 'header-entry', 'header-first-confirmation', 'review-download'];
const MARKER_PREFIX = /^OH_SCHOOL_PY_PHASE (school-entry|school-first-confirmation|header-entry|header-first-confirmation|review-download)(?=\s|$)/mu;
const MARKER = /^OH_SCHOOL_PY_PHASE (school-entry|school-first-confirmation|header-entry|header-first-confirmation|review-download) (begin|end) (0|[1-9][0-9]{0,4})(?:\r?\n)?$/u;
const MAX_STDOUT_ENTRIES = 64;
const MAX_STDOUT_BYTES = 8192;

function own(value, key) {
  const descriptor = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, key) : undefined;
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}

function unavailablePhases() {
  return Object.fromEntries(PHASES.map(phase => [phase, { status: 'unavailable' }]));
}

function projectSchoolPhases(stdout) {
  const phases = unavailablePhases();
  const count = own(stdout, 'length');
  if (!Array.isArray(stdout) || count > MAX_STDOUT_ENTRIES) return phases;
  let bytes = 0;
  let next = 0;
  for (let index = 0; index < count; index++) {
    const entry = own(stdout, index);
    const text = own(entry, 'text');
    if (typeof text !== 'string') {
      // Playwright can report binary chunks. These cannot contain console.info markers.
      const buffer = own(entry, 'buffer');
      if (typeof buffer !== 'string') return unavailablePhases();
      bytes += Buffer.byteLength(buffer);
      if (bytes > MAX_STDOUT_BYTES) return unavailablePhases();
      continue;
    }
    bytes += Buffer.byteLength(text);
    if (bytes > MAX_STDOUT_BYTES) return unavailablePhases();
    if (!MARKER_PREFIX.test(text)) continue;
    const match = MARKER.exec(text);
    if (!match || match[0].length !== text.length) return unavailablePhases();
    const [, phase, step, milliseconds] = match;
    const durationMs = Number(milliseconds);
    const starting = next % 2 === 0;
    if (phase !== PHASES[Math.floor(next / 2)] || step !== (starting ? 'begin' : 'end') || durationMs > LIMITS.periodMs || (starting && durationMs !== 0)) {
      return unavailablePhases();
    }
    phases[phase] = starting ? { status: 'started' } : { status: 'completed', durationMs };
    next++;
  }
  return phases;
}

export function projectSchoolCasePhases(row) {
  if (own(row, 'file') !== SCHOOL_CASE_FILE) return {};
  const result = own(own(row, 'results'), '0');
  return { schoolPhases: projectSchoolPhases(own(result, 'stdout')) };
}
