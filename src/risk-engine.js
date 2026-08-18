// Risk scoring engine
// Score is 0-100 where HIGHER = RISKIER (inverse of reputation-engine.js's wallet score)
//
// Phase 1 checks (this build): mint authority, freeze authority, top holder concentration
// Phase 2 (later): LP lock/burn status, sniper/bundler clustering, deployer history
// LP lock is deferred because it requires discovering the AMM pool address first
// (Raydium/Orca/Meteora), which is a separate data-source problem from the mint checks.

const WEIGHTS = {
  mintAuthority: 35,
  freezeAuthority: 25,
  topHolderConcentration: 40,
};

function scoreMintAuthority(mintInfo) {
  const active = mintInfo.mintAuthority !== null;
  return {
    active,
    points: active ? WEIGHTS.mintAuthority : 0,
    label: active
      ? "Mint authority NOT renounced — supply can be inflated"
      : "Mint authority renounced",
  };
}

function scoreFreezeAuthority(mintInfo) {
  const active = mintInfo.freezeAuthority !== null;
  return {
    active,
    points: active ? WEIGHTS.freezeAuthority : 0,
    label: active
      ? "Freeze authority NOT renounced — accounts can be frozen"
      : "Freeze authority renounced",
  };
}

/**
 * Top holder concentration. The single largest holder is often the LP pool itself,
 * not a person, so it's flagged separately rather than folded into the risk score
 * until phase 2 can positively identify the LP address and exclude it properly.
 */
function scoreHolderConcentration(topHolders, totalSupply) {
  if (!topHolders || topHolders.length === 0 || !totalSupply || totalSupply === "0") {
    return {
      points: 0,
      label: "Holder data unavailable",
      top10Pct: null,
      largestHolderPct: null,
    };
  }

  const supply = BigInt(totalSupply);
  // NOTE: sort comparator must return a Number, not a BigInt — returning
  // `BigInt(b.amount) - BigInt(a.amount)` throws "Cannot convert a BigInt
  // value to a number" inside V8's sort implementation.
  const sorted = [...topHolders].sort((a, b) => {
    const diff = BigInt(b.amount) - BigInt(a.amount);
    return diff > 0n ? 1 : diff < 0n ? -1 : 0;
  });

  const largestHolderPct = supply > 0n
    ? Number((BigInt(sorted[0].amount) * 10000n) / supply) / 100
    : 0;

  // Sum top 10 (excluding index 0 if it's dramatically larger than #2 — likely the LP pool)
  const likelyLpPool = sorted.length > 1 && BigInt(sorted[0].amount) > BigInt(sorted[1].amount) * 3n;
  const holdersForConcentration = likelyLpPool ? sorted.slice(1, 11) : sorted.slice(0, 10);

  const top10Sum = holdersForConcentration.reduce((sum, h) => sum + BigInt(h.amount), 0n);
  const top10Pct = supply > 0n ? Number((top10Sum * 10000n) / supply) / 100 : 0;

  // Scale: 0% -> 0 points, 50%+ -> full weight
  const ratio = Math.min(top10Pct / 50, 1);
  const points = Math.round(ratio * WEIGHTS.topHolderConcentration);

  return {
    points,
    top10Pct,
    largestHolderPct,
    likelyLpPool,
    label: `Top 10 holders (excl. likely LP): ${top10Pct.toFixed(1)}%`,
  };
}

function tierForScore(score) {
  if (score >= 70) return { emoji: "🚨", label: "HIGH RISK" };
  if (score >= 40) return { emoji: "⚠️", label: "MODERATE RISK" };
  if (score >= 15) return { emoji: "🟡", label: "LOW-MODERATE RISK" };
  return { emoji: "✅", label: "LOW RISK" };
}

/**
 * Main scoring entry point.
 * mintInfo and topHolders come from the Helius fetch layer (see helius.js).
 */
function scoreToken({ mintInfo, topHolders, metadata }) {
  const mint = scoreMintAuthority(mintInfo);
  const freeze = scoreFreezeAuthority(mintInfo);
  const holders = scoreHolderConcentration(topHolders, mintInfo.supply);

  const totalScore = Math.min(mint.points + freeze.points + holders.points, 100);
  const tier = tierForScore(totalScore);

  return {
    mintAddress: mintInfo.mintAddress,
    symbol: metadata?.symbol || null,
    name: metadata?.name || null,
    score: totalScore,
    tier,
    checks: { mint, freeze, holders },
  };
}

export { scoreToken, tierForScore };
