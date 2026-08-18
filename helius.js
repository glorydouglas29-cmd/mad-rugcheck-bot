// Helius RPC client
// Uses jsonParsed getAccountInfo to read SPL Token Mint fields directly
// (mintAuthority, freezeAuthority, supply, decimals) with no manual buffer parsing.

const HELIUS_RPC_BASE = "https://mainnet.helius-rpc.com";

async function heliusRpc(apiKey, method, params) {
  const url = `${HELIUS_RPC_BASE}/?api-key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      method,
      params,
    }),
  });

  const raw = await res.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    // Helius returns plain-text bodies like "max usage reached" on limit errors.
    // Never let JSON.parse throw uncaught here.
    throw new Error(`Helius non-JSON response (status ${res.status}): ${raw.slice(0, 200)}`);
  }

  if (json.error) {
    throw new Error(`Helius RPC error: ${json.error.message || JSON.stringify(json.error)}`);
  }

  return json.result;
}

/**
 * Fetch the parsed SPL Token Mint account.
 * Returns null if the address is not a valid mint (wrong owner program, not found, etc).
 */
async function getMintInfo(apiKey, mintAddress) {
  const result = await heliusRpc(apiKey, "getAccountInfo", [
    mintAddress,
    { encoding: "jsonParsed" },
  ]);

  if (!result || !result.value) return null;

  const parsed = result.value.data?.parsed;
  if (!parsed || parsed.type !== "mint") return null;

  const info = parsed.info;
  return {
    mintAddress,
    mintAuthority: info.mintAuthority || null, // null = renounced
    freezeAuthority: info.freezeAuthority || null, // null = renounced
    supply: info.supply,
    decimals: info.decimals,
    isInitialized: info.isInitialized,
  };
}

/**
 * Fetch the largest token holders for a mint (top 20 max, Solana RPC limit).
 * Used for top-holder concentration scoring.
 */
async function getTopHolders(apiKey, mintAddress) {
  const result = await heliusRpc(apiKey, "getTokenLargestAccounts", [mintAddress]);
  if (!result || !result.value) return [];
  return result.value.map((acc) => ({
    address: acc.address,
    amount: acc.amount,
    uiAmount: acc.uiAmount,
  }));
}

/**
 * Fetch DAS asset metadata (name, symbol, image) for display purposes.
 */
async function getTokenMetadata(apiKey, mintAddress) {
  try {
    const result = await heliusRpc(apiKey, "getAsset", { id: mintAddress });
    if (!result) return null;
    return {
      name: result.content?.metadata?.name || null,
      symbol: result.content?.metadata?.symbol || null,
    };
  } catch {
    // Metadata is nice-to-have, not critical — never let this break a scan.
    return null;
  }
}

export { getMintInfo, getTopHolders, getTokenMetadata };
