import { getMintInfo, getTopHolders, getTokenMetadata } from "./helius.js";
import { scoreToken } from "./risk-engine.js";
import { getCachedScan, setCachedScan } from "./kv-cache.js";
import { sendMessage, formatRiskCard } from "./telegram.js";

// Base58 Solana address, 32-44 chars
const CA_REGEX = /[1-9A-HJ-NP-Za-km-z]{32,44}/;

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    // Verify the request actually came from Telegram, not a random POST to this URL.
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
        "Paste a Solana token contract address and I'll scan it for rug risk."
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
      const cached = await getCachedScan(env.RUGCHECK_KV, mintAddress);
      let scanResult = cached;

      if (!scanResult) {
        const [mintInfo, topHolders, metadata] = await Promise.all([
          getMintInfo(env.HELIUS_API_KEY, mintAddress),
          getTopHolders(env.HELIUS_API_KEY, mintAddress),
          getTokenMetadata(env.HELIUS_API_KEY, mintAddress),
        ]);

        if (!mintInfo) {
          await sendMessage(
            env.TELEGRAM_BOT_TOKEN,
            chatId,
            `Couldn't find a token mint at that address. Double check the CA.`
          );
          return new Response("OK", { status: 200 });
        }

        scanResult = scoreToken({ mintInfo, topHolders, metadata });
        await setCachedScan(env.RUGCHECK_KV, mintAddress, scanResult);
      }

      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, formatRiskCard(scanResult));
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
