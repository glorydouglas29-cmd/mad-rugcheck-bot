import { getMintInfo, getTopHolders, getTokenMetadata } from "./helius.js";
import { scoreToken } from "./risk-engine.js";
import { getCachedScan, setCachedScan } from "./kv-cache.js";
import { sendMessage, editMessageText, answerCallbackQuery, formatRiskCard, buildKeyboard } from "./telegram.js";
import { getMarketData } from "./dexscreener.js";

// Base58 Solana address, 32-44 chars
const CA_REGEX = /[1-9A-HJ-NP-Za-km-z]{32,44}/;

/**
 * Runs the full scan pipeline for a mint address. Shared by the message handler
 * (new scan) and the callback handler (refresh button) so both stay in sync.
 * @param {boolean} forceFresh - bypass the cached risk score (used by the refresh button)
 */
async function runScan(env, mintAddress, forceFresh) {
  const cached = forceFresh ? null : await getCachedScan(env.RUGCHECK_KV, mintAddress);
  let scanResult = cached;

  if (!scanResult) {
    const [mintInfo, topHolders, metadata] = await Promise.all([
      getMintInfo(env.HELIUS_API_KEY, mintAddress),
      getTopHolders(env.HELIUS_API_KEY, mintAddress),
      getTokenMetadata(env.HELIUS_API_KEY, mintAddress),
    ]);

    if (!mintInfo) return { notFound: true };

    scanResult = scoreToken({ mintInfo, topHolders, metadata });
    await setCachedScan(env.RUGCHECK_KV, mintAddress, scanResult);
  }

  let marketData = null;
  try {
    marketData = await getMarketData(mintAddress);
  } catch (err) {
    console.error("DexScreener error:", err.message);
  }

  return {
    notFound: false,
    text: formatRiskCard(scanResult, marketData),
    keyboard: buildKeyboard(mintAddress, marketData),
  };
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secretHeader !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    // Refresh button tap
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message.chat.id;
      const messageId = cq.message.message_id;
      const data = cq.data || "";

      if (data.startsWith("rescan:")) {
        const mintAddress = data.slice("rescan:".length);
        try {
          await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, cq.id, "Rescanning...");
          const result = await runScan(env, mintAddress, true);
          if (result.notFound) {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, cq.id, "Token not found");
          } else {
            await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, result.text, result.keyboard);
          }
        } catch (err) {
          console.error("Rescan error:", err.message);
          await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, cq.id, "Rescan failed, try again");
        }
        return new Response("OK", { status: 200 });
      }

      if (data.startsWith("copyhint:")) {
        await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, cq.id, "Tap the address text above to copy it");
        return new Response("OK", { status: 200 });
      }

      await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, cq.id, "");
      return new Response("OK", { status: 200 });
    }

    const message = update.message;
    if (!message || !message.text) {
      return new Response("OK", { status: 200 });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();

    if (text === "/start") {
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        "👋 Paste a Solana token contract address and I'll scan it for rug risk."
      );
      return new Response("OK", { status: 200 });
    }

    const match = text.match(CA_REGEX);
    if (!match) {
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        "Send me a Solana token contract address to scan."
      );
      return new Response("OK", { status: 200 });
    }

    const mintAddress = match[0];

    try {
      const result = await runScan(env, mintAddress, false);
      if (result.notFound) {
        await sendMessage(
          env.TELEGRAM_BOT_TOKEN,
          chatId,
          "Couldn't find a token mint at that address. Double check the CA."
        );
        return new Response("OK", { status: 200 });
      }
      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, result.text, result.keyboard);
    } catch (err) {
      console.error("Scan error:", err.message);
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        "Scan failed — Helius may be rate limited or the address may be invalid. Try again in a moment."
      );
    }

    return new Response("OK", { status: 200 });
  },
};
