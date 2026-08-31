// Rich-media support for Teacher Kofi's replies.
//
// The model is told to (optionally) append a delimited block:
//
//   ===MEDIA===
//   IMAGE|IMAGES: <short, child-friendly subject keywords for the picture>
//   VIDEO|LESSON: <url>
//   VIDEO|LESSON: <url>
//
// We parse this, validate any URLs against a strict whitelist of trustworthy
// educational domains, and generate the requested picture via Pollinations
// (free, no key — already used elsewhere in the app). Anything not on the
// whitelist is dropped. The voice path must NOT include rich media, so callers
// strip it for spoken replies.

const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'm.youtube.com',
  'www.khanacademy.org',
  'khanacademy.org',
  'www.bbc.co.uk',
  'bbc.co.uk',
  'www.natgeokids.com',
  'natgeokids.com',
  'kids.nationalgeographic.com',
  'spaceplace.nasa.gov',
  'www.dkfindout.com',
  'dkfindout.com',
  'www.duolingo.com',
  'duolingo.com',
  'headspace.com',
  'www.timeforkids.com',
  'timeforkids.com',
]);

const MEDIA_RE = /===MEDIA===[\s\S]*?===END===/i;
const MAX_MEDIA = 3;

function hostOf(raw) {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function allowedUrl(raw) {
  const host = hostOf(raw);
  if (!host) return null;
  if (!ALLOWED_HOSTS.has(host)) return null;
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) return null;
  return url.href;
}

async function fetchImage(keywords) {
  const prompt = String(keywords || '')
    .replace(/\s+/g, ' ').trim().slice(0, 300) || 'a friendly illustrated scene for kids';
  const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?width=768&height=480&nologo=true';
  try {
    const imgRes = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!imgRes.ok) return null;
    return 'data:image/png;base64,' + Buffer.from(await imgRes.arrayBuffer()).toString('base64');
  } catch {
    return null;
  }
}

// Parses a reply that may contain a ===MEDIA===...===END=== block.
// Returns a safe media array. Does NOT generate images; use generateMedia().
function parseRichReply(text) {
  const out = { text, media: [] };
  if (!text || typeof text !== 'string' || !MEDIA_RE.test(text)) return out;

  const raw = text;
  out.text = raw.replace(MEDIA_RE, '').replace(/\n{3,}/g, '\n\n').trim();

  const block = (raw.match(MEDIA_RE) || [''])[0];
  for (const line of block.split('\n')) {
    const parts = line.split(':');
    const key = (parts.shift() || '').trim().toUpperCase();
    const value = (parts.join(':') || '').trim();
    if (!value) continue;
    if ((key === 'IMAGE' || key === 'IMAGES') && out.media.length < MAX_MEDIA) {
      out.media.push({ type: 'image', keywords: value.slice(0, 200), label: '' });
    } else if ((key === 'VIDEO' || key === 'LESSON') && out.media.length < MAX_MEDIA) {
      const link = allowedUrl(value);
      if (link) out.media.push({ type: 'link', url: link, label: value.slice(0, 120) });
    }
  }

  return out;
}

// Resolves image keywords into actual image data (async). Mutates media in
// place, filling image blocks with `data`. Returns count of images resolved.
async function resolveImages(media) {
  let count = 0;
  for (const m of media || []) {
    if (m.type === 'image') {
      const data = await fetchImage(m.keywords);
      if (data) {
        m.data = data;
        count += 1;
      }
    }
  }
  return count;
}

// Removes image data from media (for lightweight history storage) and marks
// which blocks had an image so the frontend can still indicate one.
function stripImageData(media) {
  return (media || []).map((m) => {
    if (m.type === 'image') return { type: 'image', keywords: m.keywords, hasImage: true };
    return m;
  });
}

module.exports = { parseRichReply, resolveImages, stripImageData };
