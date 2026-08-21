// Supabase Edge Function: delivers runner edits to RunnerPortal.
//
// POST { action: "drain" }        -> send everything queued that is due
// POST { action: "status" }       -> counts + rows needing a person's attention
// POST { action: "send-id-card" } -> one-shot send of a just-typed ID number
// POST { action: "probe" }        -> one live signed call, to prove the key works
// POST { action: "verify" }       -> reproduce the two documented signatures
// GET  *                          -> health, including that signature self-check
//
// The queue itself is filled by a trigger on runners (see
// supabase_schema_update_v15_add_runner_portal_sync.sql), so this function
// never decides *what* changed — only when to send it and what to do with the
// answer. That means it can be invoked as often as anything likes: an admin
// save, a cron job, a retry button. Nothing is sent twice.
//
// The secret lives only in this function's environment. It is never sent over
// the wire (it signs, it is not transmitted), never logged, and never reaches
// the browser.

declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
  };
}

import { Hono } from "https://deno.land/x/hono@v3.11.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v3.11.11/middleware.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0";

import { signedHeaders, verifyDocVectors } from "../_shared/rpSign.ts";
import {
  mapIdCardNumber,
  mapRunnerChanges,
  mergeChanges,
  type DroppedField,
  type RunnerChanges,
} from "../_shared/rpMapping.ts";

const EDITS_PATH = "/v1/registrations/edits";

/** RunnerPortal caps one request at 5,000 records. We stay far below it: a
 *  batch this size is corrections, and anything near the cap would mean we are
 *  re-sending the start list instead. */
const DEFAULT_BATCH_LIMIT = 200;
const HARD_BATCH_LIMIT = 5000;

/** After this many failed attempts a batch stops retrying and waits for a
 *  person. Every cause that survives eight tries is one waiting is not going to
 *  fix. */
const MAX_BATCH_ATTEMPTS = 8;

interface RpConfig {
  baseUrl: string;
  keyId: string;
  secret: string;
  event: string;
  year: number;
  dryRun: boolean;
  enabled: boolean;
  batchLimit: number;
}

const loadConfig = (): { config?: RpConfig; error?: string } => {
  const keyId = Deno.env.get("RP_KEY_ID");
  const secret = Deno.env.get("RP_SECRET");

  if (!keyId || !secret) {
    return { error: "RP_KEY_ID or RP_SECRET is not set in the Edge Function environment." };
  }

  const year = Number(Deno.env.get("RP_YEAR") ?? "2026");
  if (!Number.isInteger(year)) {
    return { error: `RP_YEAR is not an integer: ${Deno.env.get("RP_YEAR")}` };
  }

  return {
    config: {
      baseUrl: (Deno.env.get("RP_BASE_URL") ??
        "https://runner-portal-partner-api-382283506828.asia-southeast3.run.app")
        .replace(/\/+$/, ""),
      keyId,
      secret,
      event: Deno.env.get("RP_EVENT") ?? "bangsaen10",
      year,
      // Defaults to a dry run. Going live is a deliberate act, and the cost of
      // forgetting to turn this on is writing into a real start list.
      dryRun: (Deno.env.get("RP_DRY_RUN") ?? "true").toLowerCase() !== "false",
      enabled: (Deno.env.get("RP_ENABLED") ?? "true").toLowerCase() !== "false",
      batchLimit: Number(Deno.env.get("RP_MAX_BATCH") ?? DEFAULT_BATCH_LIMIT),
    },
  };
};

const getServiceClient = () => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set in Edge Function environment variables.");
    return null;
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
};

type ServiceClient = NonNullable<ReturnType<typeof getServiceClient>>;

// ---------------------------------------------------------------------------
// Who may call this
// ---------------------------------------------------------------------------
// These tables carry runner names, so unlike the public bib pass endpoints this
// one wants a real admin session — the same one that guards the runner table
// screen — or the service-role key for a scheduled drain.
const isAuthorised = async (client: ServiceClient, authHeader: string | undefined): Promise<boolean> => {
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;

  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;

  const { data, error } = await client.auth.getUser(token);
  return !error && !!data?.user;
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
interface SyncState {
  authority_moved: boolean;
  authority_moved_at: string | null;
  last_forbidden_at: string | null;
  last_forbidden_detail: string | null;
  retry_after_until: string | null;
  last_drain_at: string | null;
  last_success_at: string | null;
}

const loadState = async (client: ServiceClient): Promise<SyncState> => {
  const { data, error } = await client
    .from("runner_portal_sync_state")
    .select("*")
    .eq("id", 1)
    .single();

  if (error || !data) {
    throw new Error(`Cannot read runner_portal_sync_state: ${error?.message ?? "missing row"}`);
  }
  return data as unknown as SyncState;
};

const patchState = async (client: ServiceClient, patch: Record<string, unknown>) => {
  await client
    .from("runner_portal_sync_state")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", 1);
};

// ---------------------------------------------------------------------------
// Talking to RunnerPortal
// ---------------------------------------------------------------------------
interface RpCallResult {
  httpStatus: number;
  body: Record<string, unknown> | null;
  requestId: string | null;
  retryAfterSeconds: number | null;
  networkError: string | null;
}

/**
 * One signed attempt.
 *
 * The timestamp, nonce and signature are produced here, per call, because a
 * nonce may be used once and the timestamp is only good for +/-300 seconds:
 * re-sending identical headers is refused by design. The Idempotency-Key is the
 * opposite — it must be the *same* across attempts, which is why it comes from
 * the stored batch rather than being generated here.
 */
const callEdits = async (
  config: RpConfig,
  rawBody: string,
  idempotencyKey: string,
): Promise<RpCallResult> => {
  let response: Response;

  try {
    const headers = await signedHeaders({
      keyId: config.keyId,
      secret: config.secret,
      method: "POST",
      path: EDITS_PATH,
      body: rawBody,
    });

    response = await fetch(config.baseUrl + EDITS_PATH, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json; charset=utf-8",
        "Idempotency-Key": idempotencyKey,
      },
      // The exact string that was hashed. Handing fetch the object instead
      // would re-serialise it, and the signature would not match the bytes.
      body: rawBody,
    });
  } catch (err) {
    return {
      httpStatus: 0,
      body: null,
      requestId: null,
      retryAfterSeconds: null,
      networkError: err instanceof Error ? err.message : String(err),
    };
  }

  const body = await response.json().catch(() => null);
  const retryAfterHeader = response.headers.get("retry-after");

  return {
    httpStatus: response.status,
    body,
    requestId:
      response.headers.get("x-request-id") ??
      response.headers.get("x-rp-request-id") ??
      (body && typeof body.request_id === "string" ? body.request_id : null),
    retryAfterSeconds: retryAfterHeader ? parseRetryAfter(retryAfterHeader) : null,
    networkError: null,
  };
};

const parseRetryAfter = (value: string): number | null => {
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.round((date - Date.now()) / 1000)) : null;
};

/** 5s, 10s, 20s ... capped at 5 minutes. */
const backoffSeconds = (attempts: number): number => Math.min(300, 5 * 2 ** Math.max(0, attempts - 1));

// ---------------------------------------------------------------------------
// Draining the queue
// ---------------------------------------------------------------------------
interface QueueRow {
  id: string;
  runner_id: string;
  bib: string;
  changes: RunnerChanges;
  attempts: number;
  batch_id: string | null;
}

interface BatchRow {
  id: string;
  idempotency_key: string;
  request_body: string;
  dry_run: boolean;
  attempts: number;
  record_count: number;
}

interface DrainSummary {
  sent: number;
  updated: number;
  unchanged: number;
  not_found: number;
  rejected: number;
  ambiguous: number;
  skipped: number;
  retrying: number;
  halted: boolean;
  dry_run: boolean;
  batches: number;
  notes: string[];
}

const emptySummary = (dryRun: boolean): DrainSummary => ({
  sent: 0, updated: 0, unchanged: 0, not_found: 0, rejected: 0, ambiguous: 0,
  skipped: 0, retrying: 0, halted: false, dry_run: dryRun, batches: 0, notes: [],
});

const drain = async (
  client: ServiceClient,
  config: RpConfig,
  limit: number,
): Promise<DrainSummary> => {
  const summary = emptySummary(config.dryRun);
  const state = await loadState(client);

  await patchState(client, { last_drain_at: new Date().toISOString() });

  // The cutover has passed: RunnerPortal is the source of truth now and this
  // integration is finished, as agreed. Not an error, and nothing to retry.
  if (state.authority_moved) {
    summary.halted = true;
    summary.notes.push("ปิดรับแล้ว (authority_moved) — RunnerPortal เป็นต้นทางข้อมูลแล้ว ไม่ต้องส่งอีก");
    await client
      .from("runner_portal_sync_queue")
      .update({ status: "halted", reason: "ปิดรับแล้ว (authority_moved) ก่อนที่รายการนี้จะถูกส่ง", updated_at: new Date().toISOString() })
      .in("status", ["pending", "in_flight"]);
    return summary;
  }

  if (!config.enabled) {
    summary.notes.push("RP_ENABLED=false — ปิดการส่งชั่วคราว รายการยังคงค้างในคิว");
    return summary;
  }

  if (state.retry_after_until && Date.parse(state.retry_after_until) > Date.now()) {
    summary.retrying = 1;
    summary.notes.push(`รอถึง ${state.retry_after_until} ตาม Retry-After ก่อนส่งรอบถัดไป`);
    return summary;
  }

  await client.rpc("rp_release_stale_claims", { p_older_than: "5 minutes" });

  // Unfinished batches first, and with their original bytes and key. Rebuilding
  // them into a new batch would be the one thing idempotency cannot protect
  // against: RunnerPortal may already have applied a batch whose response we
  // never saw.
  const { data: unfinished } = await client
    .from("runner_portal_sync_batch")
    .select("id, idempotency_key, request_body, dry_run, attempts, record_count")
    .in("status", ["pending", "in_flight"])
    .order("created_at", { ascending: true })
    .limit(10);

  for (const batch of (unfinished ?? []) as unknown as BatchRow[]) {
    const stop = await sendBatch(client, config, batch, summary);
    if (stop) return summary;
  }

  const { data: claimed, error: claimError } = await client.rpc("rp_claim_sync_rows", {
    p_limit: Math.max(1, Math.min(limit, HARD_BATCH_LIMIT)),
  });

  if (claimError) throw new Error(`rp_claim_sync_rows failed: ${claimError.message}`);

  const rows = (claimed ?? []) as unknown as QueueRow[];
  if (rows.length === 0) return summary;

  const batch = await buildBatch(client, config, rows, summary);
  if (batch) {
    const stop = await sendBatch(client, config, batch, summary);
    if (stop) return summary;
  }

  return summary;
};

/**
 * Turn claimed rows into one request.
 *
 * Two things happen here that the response depends on. Rows for the same bib
 * are merged: the same bib twice in one payload is a 409, because RunnerPortal
 * will not let request order decide which value wins. And a row whose fields all
 * failed conversion is settled here rather than sent — see rpMapping.ts for why
 * dropping beats guessing.
 */
const buildBatch = async (
  client: ServiceClient,
  config: RpConfig,
  rows: QueueRow[],
  summary: DrainSummary,
): Promise<BatchRow | null> => {
  const byBib = new Map<string, QueueRow[]>();
  for (const row of rows) {
    const group = byBib.get(row.bib);
    if (group) group.push(row);
    else byBib.set(row.bib, [row]);
  }

  const records: Array<Record<string, unknown>> = [];
  const sendableRowIds: string[] = [];
  const now = new Date().toISOString();

  for (const [bib, group] of byBib) {
    const merged = mergeChanges(group.map((row) => row.changes));
    const { fields, dropped } = mapRunnerChanges(merged);

    if (Object.keys(fields).length === 0) {
      // Nothing survived conversion, so there is no edit to express. Settle the
      // rows with the reasons attached rather than sending an empty record.
      summary.skipped += group.length;
      await client
        .from("runner_portal_sync_queue")
        .update({
          status: "skipped",
          reason: dropped.length > 0
            ? dropped.map((d) => `${d.field}: ${d.reason}`).join(" | ")
            : "ไม่มีฟิลด์ที่ RunnerPortal รับได้ในการแก้ไขครั้งนี้",
          dropped_fields: dropped as unknown as Record<string, unknown>,
          updated_at: now,
        })
        .in("id", group.map((row) => row.id));
      continue;
    }

    records.push({ bib_number: bib, ...fields });
    for (const row of group) sendableRowIds.push(row.id);

    if (dropped.length > 0) {
      await client
        .from("runner_portal_sync_queue")
        .update({ dropped_fields: dropped as unknown as Record<string, unknown>, updated_at: now })
        .in("id", group.map((row) => row.id));
    }
  }

  if (records.length === 0) return null;

  // Built once, stored, then signed and sent as-is.
  const requestBody = JSON.stringify({
    event: config.event,
    year: config.year,
    dry_run: config.dryRun,
    records,
  });

  const { data: batch, error } = await client
    .from("runner_portal_sync_batch")
    .insert({
      request_body: requestBody,
      dry_run: config.dryRun,
      record_count: records.length,
      status: "pending",
    })
    .select("id, idempotency_key, request_body, dry_run, attempts, record_count")
    .single();

  if (error || !batch) throw new Error(`Cannot create sync batch: ${error?.message ?? "no row"}`);

  await client
    .from("runner_portal_sync_queue")
    .update({ batch_id: (batch as unknown as BatchRow).id, updated_at: now })
    .in("id", sendableRowIds);

  return batch as unknown as BatchRow;
};

/**
 * Sends one batch and settles its rows. Returns true when the drain should stop
 * rather than move on to the next batch.
 *
 * Stopping matters for the causes that are about the connection rather than the
 * payload — the cutover, a rate limit, RunnerPortal being down, a key that is
 * not allowed. Every remaining batch would meet the same wall, so carrying on
 * would turn one refusal into a stampede and mark good work as failed. A 400 or
 * 409 is the opposite: it is about that one payload, so the rest still go.
 *
 * Concurrent drains can both pick up the same unfinished batch. That is safe by
 * construction: same Idempotency-Key and identical bytes means RunnerPortal
 * replays the original report instead of applying anything twice.
 */
const sendBatch = async (
  client: ServiceClient,
  config: RpConfig,
  batch: BatchRow,
  summary: DrainSummary,
): Promise<boolean> => {
  const now = () => new Date().toISOString();
  const attempts = batch.attempts + 1;

  await client
    .from("runner_portal_sync_batch")
    .update({ status: "in_flight", attempts, updated_at: now() })
    .eq("id", batch.id);

  const result = await callEdits(config, batch.request_body, batch.idempotency_key);
  summary.batches += 1;

  const settleRows = async (patch: Record<string, unknown>) => {
    await client
      .from("runner_portal_sync_queue")
      .update({ ...patch, last_http_status: result.httpStatus, updated_at: now() })
      .eq("batch_id", batch.id);
  };

  // ---- The cutover ------------------------------------------------------
  if (result.httpStatus === 403 && result.body?.error === "authority_moved") {
    await patchState(client, { authority_moved: true, authority_moved_at: now() });
    await client
      .from("runner_portal_sync_batch")
      .update({
        status: "failed",
        http_status: 403,
        response: result.body,
        request_id: result.requestId,
        error: "authority_moved",
        completed_at: now(),
        updated_at: now(),
      })
      .eq("id", batch.id);

    await settleRows({
      status: "halted",
      reason: "ปิดรับแล้ว (authority_moved) — RunnerPortal เป็นต้นทางข้อมูลแล้ว",
    });
    // Everything still waiting is in the same position.
    await client
      .from("runner_portal_sync_queue")
      .update({ status: "halted", reason: "ปิดรับแล้ว (authority_moved) ก่อนที่รายการนี้จะถูกส่ง", updated_at: now() })
      .in("status", ["pending", "in_flight"]);

    summary.halted = true;
    summary.notes.push("RunnerPortal ตอบ 403 authority_moved — หยุดส่งถาวรตามที่ตกลงไว้ (ไม่ใช่ error)");
    return true;
  }

  // ---- A key that was never allowed to do this --------------------------
  if (result.httpStatus === 403) {
    const detail = JSON.stringify(result.body ?? {});
    await patchState(client, { last_forbidden_at: now(), last_forbidden_detail: detail });
    await failBatch(client, batch, result, "forbidden");
    await settleRows({
      status: "failed",
      reason: "403 forbidden — key ไม่มีสิทธิ์ registrations:edit หรือ event/ปี ไม่ตรงกับ key ต้องให้คนแก้ค่า ไม่ใช่รอ",
    });
    summary.rejected += batch.record_count;
    summary.notes.push("403 forbidden — ตั้งค่า key ผิด ต้องแจ้ง RunnerPortal (คนละเรื่องกับ authority_moved)");
    return true;
  }

  // ---- Refusals that mean a bug on this side ----------------------------
  if (result.httpStatus === 400 || result.httpStatus === 409) {
    await failBatch(client, batch, result, `http_${result.httpStatus}`);
    await settleRows({
      status: "failed",
      reason: `HTTP ${result.httpStatus} — ${JSON.stringify(result.body ?? {})} (ส่งซ้ำแบบเดิมจะได้ผลเดิม ต้องแก้ที่ระบบเรา)`,
    });
    summary.rejected += batch.record_count;
    summary.notes.push(`HTTP ${result.httpStatus} จาก RunnerPortal — เป็นข้อผิดพลาดฝั่งเรา ต้องมีคนตรวจ`);
    return false;
  }

  // ---- Throttled --------------------------------------------------------
  if (result.httpStatus === 429) {
    const wait = result.retryAfterSeconds ?? backoffSeconds(attempts);
    await patchState(client, {
      retry_after_until: new Date(Date.now() + wait * 1000).toISOString(),
    });
    await client
      .from("runner_portal_sync_batch")
      .update({ status: "pending", http_status: 429, response: result.body, request_id: result.requestId, updated_at: now() })
      .eq("id", batch.id);
    summary.retrying += batch.record_count;
    summary.notes.push(`429 rate limited — รอ ${wait} วินาทีแล้วส่งชุดเดิมซ้ำ (Idempotency-Key เดิม)`);
    return true;
  }

  // ---- Their fault, or the network --------------------------------------
  if (result.networkError || result.httpStatus === 0 || result.httpStatus >= 500) {
    const problem = result.networkError ?? `HTTP ${result.httpStatus}`;

    if (attempts >= MAX_BATCH_ATTEMPTS) {
      await failBatch(client, batch, result, `${problem} (เกิน ${MAX_BATCH_ATTEMPTS} ครั้ง)`);
      await settleRows({
        status: "failed",
        reason: `ส่งไม่สำเร็จ ${attempts} ครั้ง: ${problem} — ต้องมีคนตรวจสอบ`,
      });
      summary.notes.push(`ยอมแพ้หลังพยายาม ${attempts} ครั้ง: ${problem}`);
      return true;
    }

    const wait = backoffSeconds(attempts);
    await patchState(client, { retry_after_until: new Date(Date.now() + wait * 1000).toISOString() });
    await client
      .from("runner_portal_sync_batch")
      .update({
        status: "pending",
        http_status: result.httpStatus || null,
        response: result.body,
        request_id: result.requestId,
        error: problem,
        updated_at: now(),
      })
      .eq("id", batch.id);

    summary.retrying += batch.record_count;
    summary.notes.push(`${problem} — ฝั่ง RunnerPortal/เครือข่าย จะส่งชุดเดิมซ้ำในอีก ${wait} วินาที`);
    return true;
  }

  // ---- 200: per-record outcomes -----------------------------------------
  if (result.httpStatus === 200 && result.body) {
    await applyResults(client, batch, result, summary);
    await patchState(client, { last_success_at: now(), retry_after_until: null });
    return false;
  }

  // Anything else is unexpected; treat it as needing a person rather than
  // guessing at a retry policy for a status we have never seen.
  await failBatch(client, batch, result, `unexpected HTTP ${result.httpStatus}`);
  await settleRows({ status: "failed", reason: `ได้รับสถานะที่ไม่คาดคิด: HTTP ${result.httpStatus}` });
  summary.notes.push(`สถานะที่ไม่คาดคิด: HTTP ${result.httpStatus}`);
  return false;
};

const failBatch = async (
  client: ServiceClient,
  batch: BatchRow,
  result: RpCallResult,
  error: string,
) => {
  const now = new Date().toISOString();
  await client
    .from("runner_portal_sync_batch")
    .update({
      status: "failed",
      http_status: result.httpStatus || null,
      response: result.body,
      request_id: result.requestId,
      error,
      completed_at: now,
      updated_at: now,
    })
    .eq("id", batch.id);
};

interface RpRecordResult {
  bib_number?: string;
  outcome?: string;
  reason?: string;
  changed?: string[];
  ignored?: string[];
  overrides_cleared?: string[];
}

const applyResults = async (
  client: ServiceClient,
  batch: BatchRow,
  result: RpCallResult,
  summary: DrainSummary,
) => {
  const now = new Date().toISOString();
  const body = result.body as Record<string, unknown>;
  const results = Array.isArray(body.results) ? (body.results as RpRecordResult[]) : [];

  await client
    .from("runner_portal_sync_batch")
    .update({
      status: "succeeded",
      http_status: 200,
      response: body,
      request_id: result.requestId,
      completed_at: now,
      updated_at: now,
    })
    .eq("id", batch.id);

  const byBib = new Map<string, RpRecordResult>();
  for (const record of results) {
    if (record.bib_number) byBib.set(String(record.bib_number), record);
  }

  const { data: rows } = await client
    .from("runner_portal_sync_queue")
    .select("id, bib")
    .eq("batch_id", batch.id);

  for (const row of (rows ?? []) as unknown as Array<{ id: string; bib: string }>) {
    const record = byBib.get(row.bib);

    if (!record) {
      // A well-formed request always reports every record it was given, so a
      // missing one means our own bookkeeping is off, not RunnerPortal's.
      await client
        .from("runner_portal_sync_queue")
        .update({
          status: "failed",
          reason: "RunnerPortal ไม่ได้ตอบผลของ BIB นี้กลับมา — ต้องตรวจสอบ",
          last_http_status: 200,
          updated_at: now,
        })
        .eq("id", row.id);
      continue;
    }

    const delivered = record.outcome === "updated" || record.outcome === "unchanged";

    if (record.outcome === "updated") summary.updated += 1;
    else if (record.outcome === "unchanged") summary.unchanged += 1;
    else if (record.outcome === "not_found") summary.not_found += 1;
    else if (record.outcome === "ambiguous_bib") summary.ambiguous += 1;
    else summary.rejected += 1;

    if (delivered) summary.sent += 1;

    await client
      .from("runner_portal_sync_queue")
      .update({
        status: delivered ? "sent" : "failed",
        outcome: record.outcome ?? null,
        reason: delivered ? null : describeOutcome(record),
        changed_fields: record.changed ?? null,
        ignored_fields: record.ignored ?? null,
        overrides_cleared: record.overrides_cleared ?? null,
        last_http_status: 200,
        sent_at: delivered ? now : null,
        updated_at: now,
      })
      .eq("id", row.id);
  }

  if (body.dry_run === true) {
    summary.notes.push("โหมด dry_run — RunnerPortal รายงานผลให้ครบแต่ยังไม่เขียนข้อมูลจริง");
  }
};

const describeOutcome = (record: RpRecordResult): string => {
  switch (record.outcome) {
    case "not_found":
      return "ไม่พบ BIB นี้ในงานที่ RunnerPortal — ตรวจสอบว่าเลข BIB ถูกต้องหรือไม่";
    case "ambiguous_bib":
      return "BIB นี้ตรงกับมากกว่า 1 รายการที่ RunnerPortal — ผิดปกติ ต้องแจ้ง RunnerPortal";
    case "rejected":
      return `RunnerPortal ปฏิเสธรายการนี้: ${record.reason ?? "ไม่ระบุเหตุผล"}`;
    default:
      return `ผลลัพธ์ที่ไม่รู้จัก: ${record.outcome ?? "(ว่าง)"}`;
  }
};

// ---------------------------------------------------------------------------
// The one-shot ID card send
// ---------------------------------------------------------------------------
/**
 * The runners table only ever holds a SHA-256 of an ID number, so a corrected
 * one exists only for the moment the admin types it. That rules out the queue —
 * putting it there would mean storing the number in plain text, which is exactly
 * what this system was built not to do.
 *
 * So this path sends it immediately, in its own request, and keeps nothing. If
 * it fails there is nothing to retry from; the caller is told to save again.
 * The audit row it leaves behind records that a change happened, never what to.
 */
const sendIdCard = async (
  client: ServiceClient,
  config: RpConfig,
  runnerId: string,
  idCardNumber: string,
) => {
  const state = await loadState(client);
  if (state.authority_moved) {
    return { sent: false, halted: true, reason: "ปิดรับแล้ว (authority_moved) — ไม่ต้องส่งอีก" };
  }
  if (!config.enabled) {
    return { sent: false, reason: "RP_ENABLED=false — ปิดการส่งอยู่" };
  }

  const { data: runner, error } = await client
    .from("runners")
    .select("id, bib")
    .eq("id", runnerId)
    .single();

  if (error || !runner) {
    return { sent: false, reason: `ไม่พบนักวิ่ง id=${runnerId}` };
  }

  const bib = String((runner as unknown as { bib: string }).bib ?? "").trim();
  if (!bib) {
    return { sent: false, reason: "นักวิ่งรายนี้ไม่มีเลข BIB จึงไม่มีกุญแจสำหรับจับคู่" };
  }

  const value = mapIdCardNumber(idCardNumber);
  if (!value) {
    return {
      sent: false,
      reason: "เลขบัตรที่กรอกอ่านไม่ออก (ไม่ใช่เลขบัตรประชาชน 13 หลักที่ถูกต้อง และไม่ใช่เลขพาสปอร์ต) จึงไม่ส่ง",
    };
  }

  const rawBody = JSON.stringify({
    event: config.event,
    year: config.year,
    dry_run: config.dryRun,
    records: [{ bib_number: bib, id_card_number: value }],
  });

  const result = await callEdits(config, rawBody, crypto.randomUUID());

  if (result.httpStatus === 403 && result.body?.error === "authority_moved") {
    await patchState(client, { authority_moved: true, authority_moved_at: new Date().toISOString() });
    return { sent: false, halted: true, reason: "ปิดรับแล้ว (authority_moved) — RunnerPortal เป็นต้นทางข้อมูลแล้ว" };
  }

  const record: RpRecordResult | undefined =
    result.httpStatus === 200 && Array.isArray(result.body?.results)
      ? (result.body!.results as RpRecordResult[])[0]
      : undefined;

  const delivered = record?.outcome === "updated" || record?.outcome === "unchanged";

  // The audit row deliberately records only that the ID changed.
  await client.from("runner_portal_sync_queue").insert({
    runner_id: runnerId,
    bib,
    changes: { id_card_number: { old: "(ไม่เก็บ)", new: "(ไม่เก็บ)" } },
    status: delivered ? "sent" : "failed",
    outcome: record?.outcome ?? null,
    reason: delivered
      ? null
      : record
        ? describeOutcome(record)
        : `ส่งเลขบัตรไม่สำเร็จ (HTTP ${result.httpStatus}${result.networkError ? `: ${result.networkError}` : ""}) — เลขบัตรไม่ได้ถูกเก็บไว้ ต้องกดบันทึกใหม่เพื่อส่งอีกครั้ง`,
    changed_fields: record?.changed ?? null,
    ignored_fields: record?.ignored ?? null,
    overrides_cleared: record?.overrides_cleared ?? null,
    last_http_status: result.httpStatus || null,
    sent_at: delivered ? new Date().toISOString() : null,
  });

  return {
    sent: delivered,
    dry_run: config.dryRun,
    outcome: record?.outcome ?? null,
    http_status: result.httpStatus,
    overrides_cleared: record?.overrides_cleared ?? null,
    reason: delivered
      ? null
      : record
        ? describeOutcome(record)
        : `ส่งเลขบัตรไม่สำเร็จ (HTTP ${result.httpStatus}) — กรุณากดบันทึกใหม่อีกครั้ง (ข้อมูลอื่นถูกส่งแล้ว)`,
  };
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
const app = new Hono();

app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["POST", "GET", "OPTIONS"],
}));

app.options("/*", (c) => c.text("", 204));

// Health check. Must be a wildcard: Supabase routes the request to this
// function with the function name still in the path, so a literal '/health'
// route never matches.
app.get("*", async (c) => {
  const vectors = await verifyDocVectors();
  const { config, error } = loadConfig();

  return c.json({
    status: "ok",
    message: "runner-portal-sync is running.",
    // Proves the signing implementation still reproduces both published
    // examples. Uses the documentation's throwaway secret, never ours.
    signing: vectors.every((v) => v.match) ? "verified" : "FAILED",
    signing_detail: c.req.query("verbose")
      ? vectors.map(({ name, match, expected, got }) => ({ name, match, expected, got }))
      : undefined,
    configured: !error,
    config_error: error,
    event: config ? `${config.event} ${config.year}` : undefined,
    dry_run: config?.dryRun,
    enabled: config?.enabled,
  });
});

app.post("*", async (c) => {
  const client = getServiceClient();
  if (!client) return c.json({ error: "Server is not configured (Supabase credentials missing)." }, 500);

  if (!(await isAuthorised(client, c.req.header("Authorization")))) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const payload = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const action = String((payload as Record<string, unknown>).action ?? "drain");

  // Needs no key and touches nothing: the first thing to run when a signature
  // is not being accepted.
  if (action === "verify") {
    const vectors = await verifyDocVectors();
    return c.json({ ok: vectors.every((v) => v.match), vectors });
  }

  if (action === "status") {
    return c.json(await readStatus(client));
  }

  const { config, error } = loadConfig();
  if (!config) return c.json({ error: error ?? "not configured" }, 500);

  try {
    if (action === "drain") {
      const limit = Number((payload as Record<string, unknown>).limit ?? config.batchLimit);
      return c.json(await drain(client, config, Number.isFinite(limit) ? limit : config.batchLimit));
    }

    if (action === "send-id-card") {
      const runnerId = String((payload as Record<string, unknown>).runnerId ?? "");
      const idCardNumber = String((payload as Record<string, unknown>).idCardNumber ?? "");
      if (!runnerId || !idCardNumber) {
        return c.json({ error: "runnerId and idCardNumber are required" }, 400);
      }
      return c.json(await sendIdCard(client, config, runnerId, idCardNumber));
    }

    // One real signed call, writing nothing. Today the right answer is
    // 403 authority_moved: the key works, the signature is accepted, and the
    // write window simply is not open yet.
    if (action === "probe") {
      const bib = String((payload as Record<string, unknown>).bib ?? "000000");
      const rawBody = JSON.stringify({
        event: config.event,
        year: config.year,
        dry_run: true,
        records: [{ bib_number: bib, shirt_size: "M" }],
      });
      const result = await callEdits(config, rawBody, crypto.randomUUID());
      return c.json({
        http_status: result.httpStatus,
        body: result.body,
        request_id: result.requestId,
        network_error: result.networkError,
        interpretation: interpretProbe(result),
      });
    }

    return c.json({ error: `unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("runner-portal-sync failed:", err);
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

const interpretProbe = (result: RpCallResult): string => {
  if (result.networkError) return `ต่อไม่ได้: ${result.networkError}`;
  if (result.httpStatus === 403 && result.body?.error === "authority_moved") {
    return "✅ ถูกต้องตามที่คาด: key ใช้ได้ ลายเซ็นถูก สิทธิ์ถูก แต่ยังไม่เปิดช่วงเวลาให้เขียนข้อมูล";
  }
  if (result.httpStatus === 403) return "❌ 403 forbidden — ตั้งค่า key ผิด ต้องแจ้ง RunnerPortal";
  if (result.httpStatus === 401) return "❌ 401 — ลายเซ็น เวลา หรือ key มีปัญหา ตรวจนาฬิกาเครื่องและ RP_SECRET";
  if (result.httpStatus === 200) return "✅ เปิดรับแล้ว และคำขอนี้เป็น dry_run จึงไม่ได้เขียนข้อมูลจริง";
  return `ได้รับ HTTP ${result.httpStatus}`;
};

const readStatus = async (client: ServiceClient) => {
  const state = await loadState(client);

  const counts: Record<string, number> = {};
  for (const status of ["pending", "in_flight", "sent", "failed", "skipped", "halted"]) {
    const { count } = await client
      .from("runner_portal_sync_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    counts[status] = count ?? 0;
  }

  // Rows a person has to look at, newest first.
  const { data: attention } = await client
    .from("runner_portal_sync_queue")
    .select("id, bib, status, outcome, reason, changes, dropped_fields, overrides_cleared, ignored_fields, created_at")
    .in("status", ["failed", "skipped"])
    .order("created_at", { ascending: false })
    .limit(50);

  const { config } = loadConfig();

  return {
    state,
    counts,
    attention: attention ?? [],
    dry_run: config?.dryRun ?? null,
    enabled: config?.enabled ?? null,
    event: config ? `${config.event} ${config.year}` : null,
  };
};

serve(app.fetch);
