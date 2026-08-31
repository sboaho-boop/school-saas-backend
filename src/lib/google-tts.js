// Google Cloud Text-to-Speech wrapper for Teacher Kofi (multi-language voice replies).
// Uses the Text-to-Speech v1 REST API. Reads GOOGLE_TTS_API_KEY first, then falls back to
// GEMINI_API_KEY (same Google AIza... key format; the TTS API must be enabled on the project).

const TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';

// Map Teacher Kofi language codes to Google TTS BCP-47 codes + a preferred voice name.
// Frontier: not every Ghanaian language has a Google TTS voice; best-effort mapping.
const VOICE_MAP = {
  en: { lang: 'en-US', name: 'en-US-Neural2-F' },
  fr: { lang: 'fr-FR', name: 'fr-FR-Neural2-F' },
  tw: { lang: 'ak-GH', name: 'ak-GH-Standard-A' },      // Akan / Twi
  fante: { lang: 'ak-GH', name: 'ak-GH-Standard-A' },
  ewe: { lang: 'ee-GH', name: 'ee-GH-Standard-A' },     // Ewe (may not exist on all projects)
  ha: { lang: 'ha-NG', name: 'ha-NG-Standard-F' },      // Hausa
  ga: { lang: 'en-GH', name: 'en-GH-Wavenet-A' },       // Ga: no TTS voice; use Ghanaian English
  dagbani: { lang: 'en-GH', name: 'en-GH-Wavenet-A' },
};

function ttsKey() {
  return process.env.GOOGLE_TTS_API_KEY || process.env.GEMINI_API_KEY || '';
}

function isTtsConfigured() {
  return Boolean(ttsKey());
}

function supportedLanguage(code) {
  const c = String(code || '').toLowerCase();
  return VOICE_MAP[c] ? c : null;
}

// Synthesize text to an MP3 Buffer. Returns null on any failure (caller falls back).
async function synthesize(text, code, speakingRate) {
  const langCode = supportedLanguage(code);
  if (!langCode) return null;
  const apiKey = ttsKey();
  if (!apiKey) return null;

  const cfg = VOICE_MAP[langCode];
  const body = {
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: speakingRate || 1.0,
      pitch: 2.0,
    },
    input: { text: String(text || '').slice(0, 4000) },
    voice: {
      languageCode: cfg.lang,
      name: cfg.name,
    },
  };

  try {
    const res = await fetch(`${TTS_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const b64 = data.audioContent;
    if (!b64) return null;
    return Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
}

module.exports = { synthesize, supportedLanguage, isTtsConfigured, VOICE_MAP };
