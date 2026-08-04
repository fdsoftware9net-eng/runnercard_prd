import liff from '@line/liff';
import { getConfig } from '../constants';

const LIFF_QUERY_PARAM = 'src';
const LIFF_QUERY_VALUE = 'liff';
// Must stay in sync with the LIFF app's registered Endpoint URL path.
const LIFF_ENTRY_PATH = '/liff-entry.html';
const DEV_MOCK_LINE_USER_ID = 'DEV_MOCK_U0000000000000000000000000000';

/**
 * Where LINE should send the user back after login.
 *
 * This must point at the bounce page, NOT the current URL. liff.login()
 * defaults redirectUri to wherever it is called from — which here is
 * "/#/lookup?src=liff" — and LINE rejects any redirect_uri whose path falls
 * outside the registered Endpoint URL ("/liff-entry.html"), answering with
 * "400 Bad Request" on its login screen. Returning to the bounce page keeps
 * the path valid, and the page then forwards back into the hash router with
 * the user already logged in.
 */
const getLiffRedirectUri = (): string =>
  `${window.location.origin}${LIFF_ENTRY_PATH}?${LIFF_QUERY_PARAM}=${LIFF_QUERY_VALUE}`;

let initPromise: Promise<void> | null = null;
let cachedLineUserId: string | null = null;

/**
 * True only when the page was reached through the dedicated LIFF entry point
 * (the LIFF app's registered Endpoint URL), never for organic web traffic.
 */
export const isLiffQueryFlag = (searchParams: URLSearchParams): boolean => {
  return searchParams.get(LIFF_QUERY_PARAM) === LIFF_QUERY_VALUE;
};

/**
 * True while running `vite dev` and either:
 *  - VITE_LINE_LIFF_ID isn't configured yet, or
 *  - VITE_LIFF_FORCE_MOCK=true is set (lets you test the full simulated flow
 *    even after a real LIFF ID has been added to .env, without triggering a
 *    real LINE login redirect).
 * Lets the whole LIFF flow be exercised locally (forced-login, register,
 * send-image, close) without a real LIFF app or real yourqr.today
 * credentials. Every liffService function below simulates success instead of
 * touching the real LIFF SDK. Only ever active in dev builds — never in a
 * production build, regardless of what env vars are set.
 */
export const isDevLiffMock = (): boolean => {
  try {
    if (!import.meta.env.DEV) return false;
    if (import.meta.env.VITE_LIFF_FORCE_MOCK === 'true') return true;
    return !getConfig().LINE_LIFF_ID;
  } catch {
    return false;
  }
};

/**
 * The LINE userId the mock returns. Override with VITE_LIFF_MOCK_LINE_USER_ID
 * to run the pipeline against a real LINE account's id while still skipping the
 * real LINE login redirect.
 */
export const getMockLineUserId = (): string => {
  try {
    return import.meta.env.VITE_LIFF_MOCK_LINE_USER_ID || DEV_MOCK_LINE_USER_ID;
  } catch {
    return DEV_MOCK_LINE_USER_ID;
  }
};

/**
 * When the LIFF SDK is mocked, the Edge Function / third-party calls are
 * mocked too by default. Set VITE_LIFF_REAL_API=true to keep skipping the LINE
 * login but still fire the real upload/register/send requests — useful for
 * verifying the Supabase Storage upload and the yourqr.today integration
 * without needing a working LIFF login in the browser.
 */
export const shouldMockPipelineApi = (): boolean => {
  if (!isDevLiffMock()) return false;
  try {
    return import.meta.env.VITE_LIFF_REAL_API !== 'true';
  } catch {
    return true;
  }
};

/**
 * Dev-only testing aid: stop the auto-send pipeline after a given step instead
 * of running to completion. Accepts 'uploading' or 'registering'. Always
 * disabled in production builds so a stray env var can't halt the real flow.
 */
export const getLiffStopAfterStep = (): string => {
  try {
    if (!import.meta.env.DEV) return '';
    return import.meta.env.VITE_LIFF_STOP_AFTER || '';
  } catch {
    return '';
  }
};

/**
 * Memoized liff.init() — safe to call from multiple pages/effects; the second
 * call resolves from the cached promise instead of re-initializing the SDK.
 */
export const initLiff = (): Promise<void> => {
  if (isDevLiffMock()) {
    console.warn('[liffService] DEV MOCK: skipping real liff.init() — no VITE_LINE_LIFF_ID configured.');
    return Promise.resolve();
  }

  if (!initPromise) {
    initPromise = (async () => {
      const { LINE_LIFF_ID } = getConfig();
      if (!LINE_LIFF_ID) {
        throw new Error('LINE LIFF ID is not configured (VITE_LINE_LIFF_ID).');
      }
      await liff.init({ liffId: LINE_LIFF_ID });
    })().catch((err) => {
      // Reset so a later retry can attempt init again instead of being stuck
      // on a permanently-rejected cached promise.
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
};

/**
 * Forces LINE login if not already logged in. This triggers a full page
 * redirect to LINE's OAuth flow and back, so it must only ever be called from
 * RunnerLookupPage.tsx (before any search happens) — never from BibPassDisplay,
 * where a redirect would wipe out in-flight navigation state.
 */
export const ensureLoggedIn = async (): Promise<void> => {
  if (isDevLiffMock()) {
    console.warn('[liffService] DEV MOCK: pretending the user is already logged in to LINE.');
    return;
  }
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: getLiffRedirectUri() });
    // liff.login() navigates away; nothing after this point will run.
  }
};

/**
 * Returns the LINE user's profile userId, cached for the session to avoid
 * redundant liff.getProfile() calls across the auto-send pipeline.
 *
 * Calls initLiff() itself (idempotent/cached) so this works even when the SPA
 * was cold-loaded directly at /bibpass/... without ever going through
 * /lookup?src=liff first.
 */
export const getLineUserId = async (): Promise<string> => {
  if (cachedLineUserId) {
    return cachedLineUserId;
  }
  if (isDevLiffMock()) {
    cachedLineUserId = getMockLineUserId();
    console.warn('[liffService] DEV MOCK: returning a mocked LINE userId:', cachedLineUserId);
    return cachedLineUserId;
  }
  await initLiff();
  if (!liff.isLoggedIn()) {
    throw new Error('Not logged in to LINE.');
  }
  const profile = await liff.getProfile();
  cachedLineUserId = profile.userId;
  return cachedLineUserId;
};

/**
 * True when there is an active LIFF login session that the auto-send pipeline
 * can use. Used by BibPassDisplay to detect a cold-launch directly at
 * /bibpass/:accessKey?autoSend=1 (e.g. the LINE webview was relaunched)
 * without ever going through /lookup?src=liff — in that case the pipeline
 * should silently fall back to the manual card view instead of erroring.
 * Never triggers an interactive login (that's ensureLoggedIn()'s job, and
 * that's restricted to the lookup page).
 */
export const isLiffReady = async (): Promise<boolean> => {
  if (isDevLiffMock()) {
    return true;
  }
  try {
    await initLiff();
    return liff.isLoggedIn();
  } catch {
    return false;
  }
};

/**
 * Closes the LIFF window. No-ops safely outside of a LINE in-app context
 * (e.g. testing in a normal desktop browser with ?src=liff appended manually).
 */
export const closeLiffWindow = (): void => {
  if (isDevLiffMock()) {
    console.warn('[liffService] DEV MOCK: would call liff.closeWindow() here — staying on the page so you can inspect the final state.');
    return;
  }
  try {
    if (liff.isInClient()) {
      liff.closeWindow();
    }
  } catch (err) {
    console.warn('Failed to close LIFF window:', err);
  }
};
