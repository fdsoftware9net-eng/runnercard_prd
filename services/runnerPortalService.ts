// Client for the runner-portal-sync Edge Function.
//
// The admin screen never talks to RunnerPortal itself: the shared secret lives
// in the Edge Function's environment, and a browser cannot hold one. What the
// screen does is nudge the queue after a save and read back what happened.
//
// Every call here is best-effort by design. The edit is already committed and
// the trigger has already queued it before any of this runs, so a failure to
// nudge means the correction goes out on the next drain — never that it is
// lost. The one exception is the ID card number, which we do not store and
// therefore cannot re-send; that call reports back so the admin can be told.

import { getConfig } from '../constants';
import { getSupabaseClient } from './supabaseService';

const RUNNER_PORTAL_SYNC_EDGE_FUNCTION_URL = '/functions/v1/runner-portal-sync';

/** Outcome of one queued edit, as RunnerPortal reported it. */
export type RunnerPortalOutcome =
  | 'updated'
  | 'unchanged'
  | 'not_found'
  | 'ambiguous_bib'
  | 'rejected';

export interface RunnerPortalDrainSummary {
  sent: number;
  updated: number;
  unchanged: number;
  not_found: number;
  rejected: number;
  ambiguous: number;
  skipped: number;
  retrying: number;
  /** The agreed cutover has passed. Stop sending; this is not a failure. */
  halted: boolean;
  dry_run: boolean;
  batches: number;
  notes: string[];
}

export interface RunnerPortalIdCardResult {
  sent: boolean;
  halted?: boolean;
  dry_run?: boolean;
  outcome?: RunnerPortalOutcome | null;
  http_status?: number;
  overrides_cleared?: string[] | null;
  reason?: string | null;
}

export interface RunnerPortalAttentionRow {
  id: string;
  bib: string;
  status: 'failed' | 'skipped';
  outcome: RunnerPortalOutcome | null;
  reason: string | null;
  changes: Record<string, { old: unknown; new: unknown }>;
  dropped_fields: Array<{ field: string; value: string; reason: string }> | null;
  overrides_cleared: string[] | null;
  ignored_fields: string[] | null;
  created_at: string;
}

export interface RunnerPortalStatus {
  state: {
    authority_moved: boolean;
    authority_moved_at: string | null;
    last_forbidden_at: string | null;
    last_forbidden_detail: string | null;
    retry_after_until: string | null;
    last_drain_at: string | null;
    last_success_at: string | null;
  };
  counts: Record<string, number>;
  attention: RunnerPortalAttentionRow[];
  dry_run: boolean | null;
  enabled: boolean | null;
  event: string | null;
}

const callSyncFunction = async <T>(
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ data?: T; error?: string }> => {
  const config = getConfig();

  // The function wants the admin's own session, not the anon key: the sync
  // tables carry runner names and are not public data.
  const { data: { session } } = await getSupabaseClient().auth.getSession();
  const token = session?.access_token ?? config.SUPABASE_ANON_KEY;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${config.SUPABASE_URL}${RUNNER_PORTAL_SYNC_EDGE_FUNCTION_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return { error: payload?.error || `RunnerPortal sync failed (HTTP ${response.status})` };
    }
    return { data: payload as T };
  } catch (err: any) {
    return { error: err?.name === 'AbortError' ? 'RunnerPortal sync timed out.' : (err?.message || 'RunnerPortal sync failed.') };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Send whatever is queued.
 *
 * Call it after a save. Safe to call at any time and from anywhere — overlapping
 * drains claim different rows, and an unfinished batch is replayed with its
 * original Idempotency-Key rather than applied twice.
 */
export const drainRunnerPortalQueue = async (): Promise<{ data?: RunnerPortalDrainSummary; error?: string }> =>
  callSyncFunction<RunnerPortalDrainSummary>({ action: 'drain' }, 30_000);

/**
 * Send a national ID or passport number the admin just typed.
 *
 * Separate from the queue because we deliberately do not store the number: the
 * runners table keeps only its hash. It therefore cannot be retried later, so
 * the result matters and the caller should surface a failure.
 */
export const sendIdCardToRunnerPortal = async (
  runnerId: string,
  idCardNumber: string,
): Promise<{ data?: RunnerPortalIdCardResult; error?: string }> =>
  callSyncFunction<RunnerPortalIdCardResult>(
    { action: 'send-id-card', runnerId, idCardNumber },
    20_000,
  );

/** Queue counts, integration state, and the rows that need a person. */
export const getRunnerPortalStatus = async (): Promise<{ data?: RunnerPortalStatus; error?: string }> =>
  callSyncFunction<RunnerPortalStatus>({ action: 'status' }, 20_000);

/**
 * One live signed call that writes nothing.
 *
 * Until RunnerPortal opens the write window the correct answer is
 * 403 authority_moved — which means the key, the signature and the scope are all
 * right. `403 forbidden` is the one that means something is misconfigured.
 */
export const probeRunnerPortal = async (): Promise<{ data?: { http_status: number; interpretation: string; body: unknown; request_id: string | null }; error?: string }> =>
  callSyncFunction({ action: 'probe' }, 20_000);

/** Turn a drain summary into one line for the admin, or null if there is
 *  nothing worth saying. */
export const describeDrainSummary = (summary: RunnerPortalDrainSummary): string | null => {
  if (summary.halted) {
    return 'RunnerPortal ปิดรับการแก้ไขจากระบบนี้แล้ว — การแก้ไขจะไม่ถูกส่งไปอีก';
  }

  const parts: string[] = [];
  if (summary.updated > 0) parts.push(`อัพเดท ${summary.updated}`);
  if (summary.unchanged > 0) parts.push(`ตรงกันอยู่แล้ว ${summary.unchanged}`);
  if (summary.not_found > 0) parts.push(`ไม่พบ BIB ${summary.not_found}`);
  if (summary.rejected > 0) parts.push(`ถูกปฏิเสธ ${summary.rejected}`);
  if (summary.ambiguous > 0) parts.push(`BIB ซ้ำ ${summary.ambiguous}`);
  if (summary.skipped > 0) parts.push(`ไม่ได้ส่ง ${summary.skipped}`);
  if (summary.retrying > 0) parts.push(`รอส่งใหม่ ${summary.retrying}`);

  if (parts.length === 0) return null;

  const prefix = summary.dry_run ? '[ทดสอบ dry_run] RunnerPortal: ' : 'RunnerPortal: ';
  return prefix + parts.join(' · ');
};
