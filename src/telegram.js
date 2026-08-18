// Telegram Bot API helper — sending messages and formatting the risk card

import { formatAge, formatUsd } from "./dexscreener.js";

async function sendMessage(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Telegram non-JSON response: ${raw.slice(0, 200)}`);
  }
}

function checkLine(label, active, activeText, inactiveText) {
  return `${label}: ${active ? "❌ " + activeText : "✅ " + inactiveText}`;
}

function formatRiskCard(scanResult, marketData) {
  const { mintAddress, symbol, name, score, tier, checks } = scanResult;
  const title = symbol ? `$${symbol}` : mintAddress.slice(0, 4) + "..." + mintAddress.slice(-4);
  const displayName = name ? ` (${name})` : "";

  const lines = [
    `${tier.emoji} <b>${title}${displayName} Risk Score: ${score}/100 — ${tier.label}</b>`,
    "",
  ];

  // Market data block — only shown if DexScreener has an indexed pair for this token.
  if (marketData) {
    lines.push("💰 <b>Market</b>");
    lines.push(`Price: ${marketData.priceUsd !== null ? "$" + marketData.priceUsd.toPrecision(4) : "N/A"}`);
    lines.push(`Market Cap: ${formatUsd(marketData.marketCapUsd)}`);
    lines.push(`Liquidity: ${formatUsd(marketData.liquidityUsd)}`);
    lines.push(`24h Volume: ${formatUsd(marketData.volume24hUsd)}`);
    if (marketData.priceChange24hPct !== null) {
      const changeEmoji = marketData.priceChange24hPct >= 0 ? "📈" : "📉";
      lines.push(`24h Change: ${changeEmoji} ${marketData.priceChange24hPct.toFixed(1)}%`);
    }
    lines.push(`Age: ${formatAge(marketData.ageMs)}${marketData.dexId ? " · " + marketData.dexId : ""}`);
    lines.push("");
  }

  lines.push("🔒 <b>Contract</b>");
  lines.push(checkLine("Mint Authority", checks.mint.active, "Not renounced", "Renounced"));
  lines.push(checkLine("Freeze Authority", checks.freeze.active, "Not renounced", "Renounced"));
  lines.push("");

  lines.push("👥 <b>Holders</b>");
  if (checks.holders.top10Pct !== null) {
    lines.push(`Top 10: ${checks.holders.top10Pct.toFixed(1)}%${checks.holders.likelyLpPool ? " (LP pool excluded)" : ""}`);
  } else {
    lines.push("Top 10: data unavailable");
  }
  lines.push("");

  lines.push("<i>LP lock status, sniper detection, and deployer history coming in a later update.</i>");
  lines.push(`<code>${mintAddress}</code>`);
  if (marketData?.pairUrl) {
    lines.push(`<a href="${marketData.pairUrl}">View chart</a>`);
  }

  return lines.join("\n");
}

export { sendMessage, formatRiskCard };
