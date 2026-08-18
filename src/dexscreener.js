// DexScreener public API — no key required, rate limit is generous for this use case.
// Gives us the market-data layer that Helius doesn't cover: price, market cap,
// liquidity, 24h volume/change, and pair age (how long it's been trading).

const DEXSCREENER_BASE = "https://api.dexscreener.com/latest/dex/tokens";

/**
 * Fetch the top trading pair for a token mint. A token can have multiple pairs
 * (different DEXs/pools) — we pick the one with the highest liquidity since
 * that's the most representative price/activity.
 * Returns null if the token has no indexed trading pair (e.g. brand new, or not on Solana).
 */
async function getMarketData(mintAddress) {
  const res = await fetch(`${DEXSCREENER_BASE}/${mintAddress}`);
  const raw = await res.text();

  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`DexScreener non-JSON response (status ${res.status}): ${raw.slice(0, 200)}`);
  }

  const pairs = (json.pairs || []).filter((p) => p.chainId === "solana");
  if (pairs.length === 0) return null;

  const topPair = pairs.reduce((best, p) => {
    const liq = p.liquidity?.usd || 0;
    const bestLiq = best.liquidity?.usd || 0;
    return liq > bestLiq ? p : best;
  }, pairs[0]);

  const ageMs = topPair.pairCreatedAt ? Date.now() - topPair.pairCreatedAt : null;

  return {
    priceUsd: topPair.priceUsd ? parseFloat(topPair.priceUsd) : null,
    marketCapUsd: topPair.marketCap || topPair.fdv || null,
    liquidityUsd: topPair.liquidity?.usd || null,
    volume24hUsd: topPair.volume?.h24 || null,
    priceChange24hPct: topPair.priceChange?.h24 || null,
    dexId: topPair.dexId || null,
    pairUrl: topPair.url || null,
    ageMs,
  };
}

function formatAge(ageMs) {
  if (ageMs === null) return "unknown";
  const hours = ageMs / (1000 * 60 * 60);
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function formatUsd(value) {
  if (value === null || value === undefined) return "N/A";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

export { getMarketData, formatAge, formatUsd };
