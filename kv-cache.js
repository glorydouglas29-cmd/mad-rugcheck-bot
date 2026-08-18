// KV cache for scan results
// TTL is short (10 min) because mint/freeze authority can be renounced mid-session
// and top holder distribution shifts fast on new tokens. This is NOT like wallet age
// in reputation-engine.js's kv-cache — nothing here is permanent.

const SCAN_TTL_SECONDS = 600; // 10 minutes
const SCAN_KEY_PREFIX = "scan:";

async function getCachedScan(kv, mintAddress) {
  const raw = await kv.get(SCAN_KEY_PREFIX + mintAddress);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setCachedScan(kv, mintAddress, scanResult) {
  await kv.put(SCAN_KEY_PREFIX + mintAddress, JSON.stringify(scanResult), {
    expirationTtl: SCAN_TTL_SECONDS,
  });
}

export { getCachedScan, setCachedScan };
