import liff from '@line/liff';
import { getConfig } from '../constants';

// Must stay in sync with the LIFF app's registered Endpoint URL path.
const LIFF_ENTRY_PATH = '/liff-entry.html';
const DEV_MOCK_LINE_USER_ID = 'DEV_MOCK_U0000000000000000000000000000';

/**
 * Where LINE should send the user back after login.
 *
 * This must point at the bounce page, NOT the current URL. liff.login()
 * defaults redirectUri to wherever it is called from — which here is
 * "/#/lookup" — and LINE rejects any redirect_uri whose path falls outside the
 * registered Endpoint URL ("/liff-entry.html"), answering with "400 Bad
 * Request" on its login screen. Returning to the bounce page keeps the path
 * valid, and the page then forwards back into the hash router with the user
 * already logged in.
 */
const getLiffRedirectUri = (): string => `${window.location.origin}${LIFF_ENTRY_PATH}`;

let initPromise: Promise<void> | null = null;
let sessionPromise: Promise<boolean> | null = null;
let cachedLineUserId: string | null = null;

/**
 * True while running `vite dev` and either:
 *  - VITE_LINE_LIFF_ID isn't configured yet, or
 *  - VITE_LIFF_FORCE_MOCK=true is set (lets you test the full simulated flow
 *    even after a real LIFF ID has been added to .env, without triggering a
 *    real LINE login redirect).
 * Every liffService function below simulates being inside the LINE app instead
 * of touching the real SDK. Only ever active in dev builds — never in a
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
 * login but still fire the real upload/register/send requests.
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
 * Memoized liff.init(). Called on every page load regardless of how the app was
 * opened — the SDK is what tells us whether we are inside the LINE app, so we
 * cannot decide that before initializing. Safe to call from anywhere; the
 * second call resolves from the cached promise.
 */
export const initLiff = (): Promise<void> => {
  if (isDevLiffMock()) {
    console.warn('[liffService] DEV MOCK: skipping real liff.init().');
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
 * True when the page is running inside the LINE app's in-app browser, as
 * opposed to an ordinary external browser. Only meaningful after initLiff()
 * has resolved — prefer awaiting prepareLineSession() and using its result.
 */
export const isInLineClient = (): boolean => {
  if (isDevLiffMock()) return true;
  try {
    return liff.isInClient();
  } catch {
    return false;
  }
};

/**
 * Runs once per page load: initialize LIFF, and if we turn out to be inside the
 * LINE app, force login and cache the runner's LINE userId so it is ready by
 * the time they search.
 *
 * Resolves to whether we are in the LINE app. Never throws — an ordinary
 * browser visit (or a misconfigured/unavailable LIFF) simply resolves false and
 * the app behaves exactly as it did before LIFF existed.
 */
export const prepareLineSession = (): Promise<boolean> => {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      try {
        await initLiff();
      } catch (err) {
        console.warn('[liffService] liff.init() failed — treating as a normal browser visit.', err);
        return false;
      }

      if (!isInLineClient()) return false;

      if (isDevLiffMock()) {
        cachedLineUserId = getMockLineUserId();
        console.warn('[liffService] DEV MOCK: pretending to be in the LINE app as', cachedLineUserId);
        return true;
      }

      if (!liff.isLoggedIn()) {
        // Redirects away to LINE's login page and comes back to the bounce
        // page; nothing after this runs on this page load.
        liff.login({ redirectUri: getLiffRedirectUri() });
        return true;
      }

      try {
        const profile = await liff.getProfile();
        cachedLineUserId = profile.userId;
      } catch (err) {
        // Profile scope declined, or the session expired. Without a userId the
        // auto-send flow cannot run, so fall back to the normal browser flow.
        console.warn('[liffService] Could not read the LINE profile.', err);
        return false;
      }
      return true;
    })();
  }
  return sessionPromise;
};

/**
 * The LINE userId captured by prepareLineSession(). Throws if it was never
 * obtained, which callers should treat as "not usable, fall back to the manual
 * flow" rather than as an error to surface.
 */
export const getLineUserId = async (): Promise<string> => {
  if (cachedLineUserId) return cachedLineUserId;
  await prepareLineSession();
  if (!cachedLineUserId) {
    throw new Error('No LINE user id available.');
  }
  return cachedLineUserId;
};

/**
 * True when we are in the LINE app with a usable login session — the guard the
 * auto-send pipeline checks before doing any work. Covers the case where the
 * bib pass page is cold-loaded directly without going through the lookup page.
 */
export const isLiffReady = async (): Promise<boolean> => {
  const inClient = await prepareLineSession();
  return inClient && !!cachedLineUserId;
};

/**
 * Closes the LIFF window. No-ops safely outside the LINE app, where there is no
 * window for LINE to close.
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
