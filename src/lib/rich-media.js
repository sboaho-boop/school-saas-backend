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

// Detects the actual image MIME type from the first bytes so browsers render
// the picture correctly (Pollinations/DALL-E can return JPEG even when we
// request PNG). Falls back to png.
function mimeFromBuffer(buf) {
  if (!buf || buf.length < 4) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'webp';
  return 'png';
}

function dataUriFromBuffer(buf) {
  return 'data:image/' + mimeFromBuffer(buf) + ';base64,' + Buffer.from(buf).toString('base64');
}

// Clarity-focused builder: turns a short subject into a prompt tuned to produce
// a sharp, well-lit, easy-to-read image for a young learner. Applies to both
// auto lesson pictures and the draw-a-picture button.
function buildClearPrompt(subject) {
  const safe = String(subject || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400) || 'a friendly happy scene for kids learning';
  return (
    safe +
    '. Make the image crisp and easy to understand for a young student: sharp clean outlines, bright natural lighting, ' +
    'large clear main subject, simple uncluttered background, high detail, good contrast. Educational and wholesome, ' +
    'nothing scary, violent or inappropriate, no handwriting, no extra text or labels, no watermark.'
  );
}

// Generates an image from a short subject using the free Pollinations service.
// Retries a couple of times and fixes the MIME type so it always displays.
// Resolves to a data URI, or null if every attempt fails.
async function generateImage(subject, opts = {}) {
  const prompt = buildClearPrompt(subject);
  const width = opts.width || 1024;
  const height = opts.height || 1024;
  const query = new URLSearchParams({
    width: String(width),
    height: String(height),
    nologo: 'true',
    model: 'flux',
    enhance: 'true',
    private: 'true',
  });
  const base = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?' + query.toString();

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const imgRes = await fetch(base, { signal: AbortSignal.timeout(60000) });
      if (!imgRes.ok) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        continue;
      }
      const buf = Buffer.from(await imgRes.arrayBuffer());
      if (!buf || buf.length < 1000) continue;
      return dataUriFromBuffer(buf);
    } catch {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  return null;
}

// Short subject -> picture (used by rich lessons). Wraps generateImage with a
// landscape crop suited to inline illustrations.
async function fetchImage(keywords) {
  const subject = String(keywords || '').trim().slice(0, 200) || 'a friendly illustrated scene for kids';
  return generateImage(subject, { width: 768, height: 480 });
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

module.exports = { parseRichReply, resolveImages, stripImageData, generateImage, buildClearPrompt };
