// utils/hashing.ts
/**
 * Hashing National ID using SHA-256 for security and privacy.
 */
export async function hashNationalId(nationalId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(nationalId);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash search input for logging purposes
 * For name search: hash of "firstName|lastName" (normalized)
 * For ID card search: same hash as used in runners table
 */
export async function hashSearchInput(input: string): Promise<string> {
  const encoder = new TextEncoder();
  // Normalize: trim and convert to lowercase for consistent hashing
  const normalized = input.trim().toLowerCase();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}