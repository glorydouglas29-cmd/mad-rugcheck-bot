// Telegram Bot API helper — sending messages, editing them, and formatting the risk card

import { formatAge, formatUsd } from "./dexscreener.js";

async function callTelegramApi(botToken, method, payload) {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Telegram non-JSON response: ${raw.slice(0, 200)}`);
  }
}

async function sendMessage(botToken, chatId, text, replyMarkup) {
  return callTelegramApi(botToken, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
}

async function editMessageText(botToken, chatId, messageId, text, replyMarkup) {
  return callTelegramApi(botToken, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
}

async function answerCallbackQuery(botToken, callbackQueryId, text) {
  return callTelegramApi(botToken, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  });
}

function checkLine(label, active, activeText, inactiveText) {
  return `${label}: ${active ? "❌ " + activeText : "✅ " + inactiveText}`;
}

// Visual meter: 10 segments, filled proportional to score, colored by tier.
function riskMeter(score) {
  const filled = Math.max(1, Math.round(score / 10));
  const fillEmoji = score >= 70 ? "🟥" : score >= 40 ? "🟧" : score >= 15 ? "🟨" : "🟩";
  return fillEmoji.repeat(filled) + "⬜".repeat(10 - filled);
}

function vibeLine(tier, score) {
  if (score >= 70) return "🚩 This one's got the smell. Tread heavy.";
  if (score >= 40) return "👀 A few flags up. Not a slam dunk either way.";
  if (score >= 15) return "🙂 Mostly clean, nothing screaming at us.";
  return "💎 Clean sheet — renounced, distributed, no red flags here.";
}

function formatRiskCard(scanResult, marketData) {
  const { mintAddress, symbol, name, score, tier, checks } = scanResult;
  const title = symbol ? `$${symbol}` : mintAddress.slice(0, 4) + "..." + mintAddress.slice(-4);
  const displayName = name ? ` ${name}` : "";

  const lines = [
    `${tier.emoji} <b>${title}</b>${displayName}`,
    "",
    `${riskMeter(score)}`,
    `<b>${score}/100 — ${tier.label}</b>`,
    `<i>${vibeLine(tier, score)}</i>`,
    "",
  ];

  if (marketData) {
    const changeEmoji = marketData.priceChange24hPct === null
      ? ""
      : marketData.priceChange24hPct >= 0 ? " 📈" : " 📉";
    lines.push("💰 <b>Market</b>");
    lines.push(`├ Price: ${marketData.priceUsd !== null ? "$" + marketData.priceUsd.toPrecision(4) : "N/A"}`);
    lines.push(`├ MCap: ${formatUsd(marketData.marketCapUsd)}  |  Liq: ${formatUsd(marketData.liquidityUsd)}`);
    lines.push(`├ Vol 24h: ${formatUsd(marketData.volume24hUsd)}${changeEmoji}${marketData.priceChange24hPct !== null ? " " + marketData.priceChange24hPct.toFixed(1) + "%" : ""}`);
    lines.push(`└ Age: ${formatAge(marketData.ageMs)}${marketData.dexId ? " · " + marketData.dexId : ""}`);
    lines.push("");
  }

  lines.push("🔒 <b>Contract</b>");
  lines.push(`├ ${checkLine("Mint", checks.mint.active, "Not renounced", "Renounced")}`);
  lines.push(`└ ${checkLine("Freeze", checks.freeze.active, "Not renounced", "Renounced")}`);
  lines.push("");

  lines.push("👥 <b>Holders</b>");
  if (checks.holders.top10Pct !== null) {
    const holderBarFilled = Math.max(1, Math.round(Math.min(checks.holders.top10Pct, 100) / 10));
    const holderBar = "🟥".repeat(holderBarFilled) + "⬜".repeat(10 - holderBarFilled);
    lines.push(`Top 10: ${checks.holders.top10Pct.toFixed(1)}% ${checks.holders.likelyLpPool ? "(LP excluded)" : ""}`);
    lines.push(holderBar);
  } else {
    lines.push("Top 10: data unavailable");
  }
  lines.push("");

  lines.push(`<code>${mintAddress}</code>  <i>(tap to copy)</i>`);
  lines.push("");
  lines.push("<i>LP lock, sniper detection, and deployer history coming soon.</i>");

  return lines.join("\n");
}

function buildKeyboard(mintAddress, marketData) {
  const row1 = [{ text: "🔄 Refresh", callback_data: `rescan:${mintAddress}` }];
  if (marketData?.pairUrl) {
    row1.push({ text: "📊 Chart", url: marketData.pairUrl });
  }
  const row2 = [
    { text: "📋 Copy CA", callback_data: `copyhint:${mintAddress}` },
  ];
  return { inline_keyboard: [row1, row2] };
}

export { sendMessage, editMessageText, answerCallbackQuery, formatRiskCard, buildKeyboard };

export { sendMessage, formatRiskCard };
