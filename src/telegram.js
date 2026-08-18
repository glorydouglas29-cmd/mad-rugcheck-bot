// Telegram Bot API helper — sending messages and formatting the risk card

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

function formatRiskCard(scanResult) {
  const { mintAddress, symbol, name, score, tier, checks } = scanResult;
  const title = symbol ? `$${symbol}` : mintAddress.slice(0, 4) + "..." + mintAddress.slice(-4);
  const displayName = name ? ` (${name})` : "";

  const lines = [
    `${tier.emoji} <b>${title}${displayName} Risk Score: ${score}/100 — ${tier.label}</b>`,
    "",
    checkLine("Mint Authority", checks.mint.active, "Not renounced", "Renounced"),
    checkLine("Freeze Authority", checks.freeze.active, "Not renounced", "Renounced"),
    "",
  ];

  if (checks.holders.top10Pct !== null) {
    lines.push(`Top 10 Holders: ${checks.holders.top10Pct.toFixed(1)}%${checks.holders.likelyLpPool ? " (LP pool excluded)" : ""}`);
  } else {
    lines.push("Top 10 Holders: data unavailable");
  }

  lines.push("");
  lines.push("<i>LP lock status and sniper detection coming in a later update.</i>");
  lines.push(`<code>${mintAddress}</code>`);

  return lines.join("\n");
}

export { sendMessage, formatRiskCard };
