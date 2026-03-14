// ============================================================
//  SUPERBOT v2 — Multi-Platform Media Downloader
//  Supports: Instagram, YouTube, Twitter/X, Reddit, Threads
//  TikTok, Facebook, Pinterest + more via yt-dlp
// ============================================================

const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const TOKEN = process.env.BOT_TOKEN || 'PASTE_YOUR_TOKEN_HERE';
const COOKIES_PATH = path.join(__dirname, 'cookies.txt');
const HAS_COOKIES = fs.existsSync(COOKIES_PATH);

const execAsync = promisify(exec);
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const bot = new TelegramBot(TOKEN, { polling: true });

// ─── Platform detection ───────────────────────────────────────────────────────
const PLATFORMS = [
  { name: 'Instagram',  emoji: '📸', pattern: /https?:\/\/(www\.)?instagram\.com\/(reel|p|tv|stories|share)\/[^\s]+/i },
  { name: 'YouTube',    emoji: '▶️',  pattern: /https?:\/\/(www\.)?(youtube\.com\/(watch|shorts)|youtu\.be)\/[^\s]+/i },
  { name: 'Twitter/X',  emoji: '🐦', pattern: /https?:\/\/(www\.)?(twitter\.com|x\.com)\/[^\s]+\/status\/[^\s]+/i },
  { name: 'Reddit',     emoji: '🤖', pattern: /https?:\/\/(www\.)?reddit\.com\/r\/[^\s]+/i },
  { name: 'Threads',    emoji: '🧵', pattern: /https?:\/\/(www\.)?threads\.net\/[^\s]+/i },
  { name: 'TikTok',     emoji: '🎵', pattern: /https?:\/\/(www\.)?tiktok\.com\/[^\s]+/i },
  { name: 'Facebook',   emoji: '👤', pattern: /https?:\/\/(www\.)?facebook\.com\/[^\s]+/i },
  { name: 'Pinterest',  emoji: '📌', pattern: /https?:\/\/(www\.)?pinterest\.(com|co\.uk)\/[^\s]+/i },
];

function detectPlatform(text) {
  for (const p of PLATFORMS) {
    const match = (text || '').match(p.pattern);
    if (match) return { platform: p, url: match[0] };
  }
  return null;
}

// ─── /start ───────────────────────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const name = msg.from.first_name || 'there';
  bot.sendMessage(msg.chat.id,
    `👋 Hey ${name}! Welcome to *SuperBot* 🤖\n\n` +
    `I can download from:\n\n` +
    `📸 Instagram — Reels, Posts, Stories\n` +
    `▶️ YouTube — Videos, Shorts\n` +
    `🐦 Twitter/X — Videos, GIFs\n` +
    `🤖 Reddit — Videos, GIFs\n` +
    `🧵 Threads — Videos, Images\n` +
    `🎵 TikTok — Videos\n` +
    `👤 Facebook — Videos\n` +
    `📌 Pinterest — Videos, Images\n\n` +
    `*Just paste any link and I'll handle the rest!* 🚀\n\n` +
    `_High quality • With audio • Fast_`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `🛠 *SuperBot Commands*\n\n` +
    `/start — Welcome & features\n` +
    `/help — This menu\n\n` +
    `Just paste any social media link to download it!`,
    { parse_mode: 'Markdown' }
  );
});

// ─── Main message handler ─────────────────────────────────────────────────────
bot.on('message', async (msg) => {
  if (!msg.text) return;
  if (msg.text.startsWith('/')) return;

  const text = msg.text.trim();
  const chatId = msg.chat.id;
  const user = msg.from.username || msg.from.first_name || 'unknown';

  console.log(`📩 [${new Date().toLocaleTimeString()}] ${user}: ${text.slice(0, 100)}`);

  const detected = detectPlatform(text);
  if (detected) {
    await handleDownload(chatId, detected.url, detected.platform);
    return;
  }

  bot.sendMessage(chatId,
    `🤖 Send me a link from:\nInstagram, YouTube, Twitter/X, Reddit, Threads, TikTok, Facebook or Pinterest!\n\nType /start to see all features.`
  );
});

// ─── Universal downloader ─────────────────────────────────────────────────────
async function handleDownload(chatId, url, platform) {
  let ackMsg;
  try {
    ackMsg = await bot.sendMessage(chatId,
      `${platform.emoji} Downloading from *${platform.name}*...\n\n⏳ _Please wait ~10–20 seconds_`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) { return; }

  const uid = Date.now();
  const outTemplate = path.join(TEMP_DIR, `dl_${uid}_%(id)s.%(ext)s`);

  // Build yt-dlp command — add cookies if available
  const cookiesArg = HAS_COOKIES ? `--cookies "${COOKIES_PATH}"` : '';

  const cmd = [
    'yt-dlp',
    cookiesArg,
    `"${url}"`,
    '-o', `"${outTemplate}"`,
    '--no-playlist',
    '--max-filesize', '50m',
    '--merge-output-format', 'mp4',
    '--format', '"bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best"',
    '--write-thumbnail',
    '--convert-thumbnails', 'jpg',
    '--no-warnings',
    '--socket-timeout', '30',
  ].filter(Boolean).join(' ');

  console.log(`⬇️  Downloading: ${url}`);
  if (HAS_COOKIES) console.log('🍪 Using cookies');

  try {
    await execAsync(cmd, { timeout: 120000 });
  } catch (err) {
    const e = String(err?.stderr || err?.message || '');
    console.error(`❌ Download error:`, e.slice(0, 300));

    let errMsg = `❌ Download failed from ${platform.name}.`;
    if (/login required|cookies/i.test(e))  errMsg = `🔒 This content requires login. Add cookies to enable.`;
    if (/private/i.test(e))                 errMsg = `🔒 This content is *private*. Only public posts work.`;
    if (/not available/i.test(e))           errMsg = `❌ Content not available or has been removed.`;
    if (/filesize/i.test(e))                errMsg = `⚠️ File too large for Telegram (50MB limit).`;
    if (/404|not found/i.test(e))           errMsg = `❌ Content not found. It may have been deleted.`;
    if (/ffmpeg/i.test(e))                  errMsg = `❌ ffmpeg not installed on server.`;
    if (/unsupported url/i.test(e))         errMsg = `❌ This link type isn't supported yet.`;
    if (/rate.limit/i.test(e))              errMsg = `⏳ Rate limited by ${platform.name}. Try again in a few minutes.`;

    await bot.editMessageText(errMsg, {
      chat_id: chatId, message_id: ackMsg.message_id, parse_mode: 'Markdown'
    }).catch(() => bot.sendMessage(chatId, errMsg));
    return;
  }

  const files = fs.readdirSync(TEMP_DIR)
    .filter(f => f.startsWith(`dl_${uid}_`))
    .map(f => path.join(TEMP_DIR, f));

  if (!files.length) {
    await bot.editMessageText(`😕 Nothing downloaded. The link might be private or expired.`,
      { chat_id: chatId, message_id: ackMsg.message_id }
    );
    return;
  }

  const videos = files.filter(f => /\.(mp4|mkv|webm|mov)$/i.test(f));
  const images = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  const toSend = videos.length ? videos : images;

  await bot.deleteMessage(chatId, ackMsg.message_id).catch(() => {});

  let sent = 0;
  for (const filePath of toSend) {
    if (!fs.existsSync(filePath)) continue;
    const mb = fs.statSync(filePath).size / (1024 * 1024);
    if (mb > 50) {
      await bot.sendMessage(chatId, `⚠️ File is ${mb.toFixed(1)}MB — exceeds Telegram's 50MB limit.`);
      continue;
    }
    const caption = `${platform.emoji} *${platform.name}*\n_Downloaded by SuperBot_ ✨`;
    try {
      if (/\.(mp4|mkv|webm|mov)$/i.test(filePath)) {
        await bot.sendVideo(chatId, filePath, { caption, parse_mode: 'Markdown', supports_streaming: true });
      } else {
        await bot.sendPhoto(chatId, filePath, { caption, parse_mode: 'Markdown' });
      }
      sent++;
      console.log(`✅ Sent ${path.basename(filePath)} (${mb.toFixed(1)}MB)`);
    } catch (e) { console.error('Send error:', e.message); }
  }

  if (!sent) await bot.sendMessage(chatId, `😕 Could not send the file. Please try another link.`);
  for (const f of files) { try { fs.unlinkSync(f); } catch {} }
}

// ─── Error handling ───────────────────────────────────────────────────────────
bot.on('polling_error', (err) => {
  // 409 = another instance running, 404 = bad token
  if (err.code === 'ETELEGRAM') {
    const msg = err.message || '';
    if (msg.includes('409')) console.error('⚠️  Conflict: another bot instance is running! Stop the one on your PC.');
    else if (msg.includes('404')) console.error('❌ Invalid BOT_TOKEN — check your Railway variable.');
    else console.error('Telegram error:', msg.slice(0, 100));
  } else {
    console.error('Polling error:', err.message);
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

// ─── Start ────────────────────────────────────────────────────────────────────
console.log('🚀 SuperBot is LIVE!');
console.log('📸 Instagram  ✅');
console.log('▶️  YouTube    ✅');
console.log('🐦 Twitter/X  ✅');
console.log('🤖 Reddit     ✅');
console.log('🧵 Threads    ✅');
console.log('🎵 TikTok     ✅');
console.log('👤 Facebook   ✅');
console.log('📌 Pinterest  ✅');
console.log(HAS_COOKIES ? '🍪 Cookies loaded — Instagram fully unlocked!' : '⚠️  No cookies.txt found — some Instagram content may fail');
console.log('\nWaiting for links...\n');
