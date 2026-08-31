const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const prisma = require('./prisma');

const UPLOAD_DIR = process.env.UPLOAD_DIR || (process.env.RAILWAY_VOLUME_MOUNT ? path.join(process.env.RAILWAY_VOLUME_MOUNT, 'uploads') : path.join(__dirname, '..', '..', 'uploads'));

const MIME_BY_EXT = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.heic': 'image/heic', '.avif': 'image/avif', '.bmp': 'image/bmp',
};

const WHISPER_LANG = { en: 'en', fr: 'fr', tw: 'ak', ha: 'ha', ga: 'en', ewe: 'ee', fante: 'ak', dagbani: 'dag' };

const AUDIO_FILENAME_BY_MIME = {
  'audio/wav': 'voice.wav', 'audio/x-wav': 'voice.wav', 'audio/wave': 'voice.wav',
  'audio/mpeg': 'voice.mp3', 'audio/mp3': 'voice.mp3',
  'audio/ogg': 'voice.ogg', 'audio/webm': 'voice.webm', 'audio/mp4': 'voice.m4a',
};

const SYSTEM_PROMPT = `You are "Teacher Kofi", a warm, world-class AI tutor for students in Ghana (ages 4-16). Your job is to make learning joyful, clear, and personal.

PERSONALITY
- Warm, encouraging, and playful but professional — Ghanaian warmth: greet, praise, celebrate small wins.
- Use the student's name (from context) occasionally.
- Be patient: if the student says they don't understand, explain it a different way.
- If you don't know the student's age or class, ask once, then adapt.

LEARNING STYLE
- Adapt complexity: ages 4-8 → short sentences, emojis, playful analogies; 9-12 → clear step-by-step; 13-16 → detailed explanations with worked examples.
- Relate everything to things Ghanaian kids know: market arithmetic, banku & okro, kelewele, trotro fares, chops bars, Black Stars football, homowo, damba, durbar, etc.
- Follow the Ghanaian curriculum: KG, Basic 1-9, JHS 1-3, SHS 1-3 (core subjects: English, Mathematics, Integrated Science, Social Studies, ICT, Ghanaian Language).
- Mathematics: show step-by-step working, numbered steps.
- English: help with reading, grammar, spelling, vocabulary, and pronunciation; correct mistakes gently.
- Science: explain concepts with everyday examples and safe home experiments.
- Social Studies: connect to Ghanaian history, culture, geography, and civic life.
- Ghanaian languages (Twi, Ga, Ewe, Fante, Hausa, Dagbani): teach words, phrases, and grammar; mirror the student's code-switching.

HOMEWORK POLICY
- Never give the final answer directly. Guide with hints, simpler questions, and worked examples of the same idea. Ask the student to try, then confirm and celebrate.

STRUCTURE
- Keep replies concise: at most 3 short paragraphs (for voice/audio replies: at most 2).
- Use numbered steps or bullet points for multi-step ideas.
- End with ONE short question or mini-challenge to check understanding and keep them engaged.

QUIZ MODE
- When asked for a quiz, test, or practice: give 3-5 questions at the student's level, number the options (A/B/C/D), wait for answers, then grade each, explain corrections kindly, and suggest a next topic.

SAFETY
- Never share harmful, scary, or age-inappropriate content.
- If the student asks something off-topic, unsafe, or inappropriate, do not comply; gently redirect to learning with something like "That's not something I can help with — but did you know...?"
- Stick to widely accepted facts; do not invent information about people, places, or events.
- If a student seems distressed, encourage them to talk to a trusted adult.

LANGUAGE
- Mirror the language the student uses. If they write in Twi, answer in Twi. If they mix, mix back naturally.
- If you are unsure what the student means, ask a short clarifying question.

When you genuinely don't know something, say: "I'm not sure, but let's find out together! 🎒"`;

const GH_LANGUAGE_MARKERS = {
  tw: ['wo ho te sεn', 'ete sεn', 'me din', 'medin', 'akwaaba', 'da yie', 'yε', 'kyew', 'mepε', 'asεm', 'sika', 'kɔ'],
  ha: ['ina kwana', 'ya ya', 'sannu', 'na me gani', 'don ', 'ba mu', 'ka na', 'shi ke', 'muni', 'wadanda'],
  ga: ['te o', 'gbɛkɛ', 'akwaaba', 'wo suo', 'odumfe', 'nuumɔ', 'meŋyɛ', 'tswaa', 'sane', 'kwraa'],
  ewe: ['woezor', 'efɔa', 'akwaaba', 'mado', 'nye ', 'wò ', 'wo nya', '₠', 'evelia'],
};

const LANGUAGE_NAMES = {
  en: 'English', fr: 'French', tw: 'Twi', ha: 'Hausa',
  ga: 'Ga', ewe: 'Ewe', fante: 'Fante', dagbani: 'Dagbani',
};

function detectLanguage(text) {
  const hay = (text || '').toLowerCase();
  let best = 'en';
  let bestScore = 0;
  for (const [code, words] of Object.entries(GH_LANGUAGE_MARKERS)) {
    const score = words.filter(w => hay.includes(w.toLowerCase())).length;
    if (score > bestScore) {
      best = code;
      bestScore = score;
    }
  }
  return best;
}

function buildKofiSystem({ name, languageCode, voice }) {
  const parts = [SYSTEM_PROMPT];
  parts.push('\n\nSTUDENT: ' + (name || 'a student').trim());
  const langName = LANGUAGE_NAMES[languageCode];
  if (langName && langName !== 'English') {
    parts.push('\nThe student is speaking in ' + langName + '. Respond fully in ' + langName + '.');
  }
  if (voice) {
    parts.push('\nThis is a voice lesson. Keep the reply short, clear, and natural to read aloud — at most 2 short paragraphs, no tables, lists, heavy symbols, or media blocks.');
  } else {
    parts.push(`\nENRICH YOUR LESSON (when it genuinely helps the learner understand):
1. More examples — include 1-3 short everyday examples the child can relate to (market, food, football, family).
2. A picture to make it visual. When an image would help, add at the END of your reply:

===MEDIA===
IMAGE: <short child-friendly keywords describing the picture, e.g. "fractions of a banku and okro meal divided into halves">
===END===

3. A short video or lesson link for curious learners. Only when a real, trustworthy one matches the topic. Add any video AFTER the image block, like:

VIDEO: https://www.youtube.com/watch?v=xxxxxxxx

Rules: NEVER invent links. Only use real links you are certain exist on YouTube, Khan Academy, or BBC Bitesize. If you are not sure a link is real, omit it. Do NOT add a media block to trivial chitchat, greetings, or short answers — only to real teaching lessons. Keep the main teaching text clear and complete on its own, even if the image/video can't load.`);
  }
  return parts.join('\n');
}

const AI_LIMITS = {
  free: 5,
  pro: 100,
  enterprise: -1, // unlimited
};

async function checkAILimit(schoolId) {
  try {
    const sub = await prisma.subscription.findUnique({ where: { schoolId } });
    const plan = sub?.plan || 'free';
    const limit = AI_LIMITS[plan] ?? AI_LIMITS.free;
    if (limit === -1) return { allowed: true, plan, remaining: -1 };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const count = await prisma.aIConversation.count({
      where: { schoolId, createdAt: { gte: today } },
    });
    return { allowed: count < limit, plan, remaining: Math.max(0, limit - count), used: count, limit };
  } catch {
    return { allowed: true, plan: 'free', remaining: AI_LIMITS.free };
  }
}

async function toInlineData(loc) {
  if (!loc) return null;
  try {
    if (typeof loc === 'string' && loc.startsWith('data:')) {
      const m = loc.match(/^data:([^;,]+);base64,(.*)$/s);
      if (m) return { mime_type: m[1] || 'image/png', data: m[2] };
      return null;
    }
    let buf;
    let mime = 'image/jpeg';
    if (/^https?:\/\//i.test(loc)) {
      const r = await fetch(loc);
      if (!r.ok) return null;
      buf = Buffer.from(await r.arrayBuffer());
      mime = r.headers.get('content-type') || mime;
    } else {
      const clean = String(loc).replace(/^\//, '').replace(/^uploads\//, '');
      buf = fs.readFileSync(path.join(UPLOAD_DIR, clean));
      mime = MIME_BY_EXT[path.extname(clean).toLowerCase()] || mime;
    }
    return { mime_type: mime, data: buf.toString('base64') };
  } catch (err) {
    console.error('Image resolve error:', err.message);
    return null;
  }
}

async function geminiContents(messages) {
  const systemMsg = messages.find(m => m.role === 'system');
  const userMessages = messages.filter(m => m.role !== 'system');
  const last = userMessages[userMessages.length - 1] || {};
  let hasImage = false;

  const contents = [];
  for (const msg of userMessages.slice(0, -1)) {
    const parts = [];
    if (msg.content) parts.push({ text: msg.content });
    if (msg.image) {
      const part = await toInlineData(msg.image);
      if (part) { parts.push({ inline_data: part }); hasImage = true; }
    }
    contents.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts: parts.length ? parts : [{ text: '' }] });
  }

  const lastParts = [];
  if (last.content) lastParts.push({ text: last.content });
  if (last.image) {
    const part = await toInlineData(last.image);
    if (part) { lastParts.push({ inline_data: part }); hasImage = true; }
  }
  contents.push({ role: 'user', parts: lastParts.length ? lastParts : [{ text: '' }] });

  let systemText = systemMsg?.content || SYSTEM_PROMPT;
  if (hasImage) {
    systemText += '\n\nThe student has attached a real photo or picture. Look at it closely: describe it kindly, help with their question about it, or teach from it. Keep it short, friendly, and appropriate.';
  }
  return { systemText, contents };
}

async function transcribeAudio(buffer, mimeType, lang) {
  const mime = String(mimeType || '').toLowerCase();

  // Gemini first (free tier, no separate billing)
  if (process.env.GEMINI_API_KEY && (mime.startsWith('audio/wav') || mime === 'audio/webm' || mime === 'audio/ogg' || mime === 'audio/mpeg' || mime.startsWith('audio/mp4'))) {
    try {
      const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
      const langName = LANGUAGE_NAMES[lang];
      const hint = langName && langName !== 'English' ? ' The speaker is speaking in ' + langName + '.' : '';
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: 'Transcribe everything the speaker says in this audio exactly as spoken. Output ONLY the transcribed words, no commentary, no quotation marks.' + hint },
                  { inline_data: { mime_type: mime, data: buffer.toString('base64') } },
                ],
              },
            ],
            generationConfig: { temperature: 0.1, maxOutputTokens: 400 },
          }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    } catch (err) {
      console.error('[transcribe] Gemini error:', err.message);
    }
  }

  // Whisper fallback
  if (process.env.OPENAI_API_KEY) {
    try {
      const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const filename = AUDIO_FILENAME_BY_MIME[mime] || 'voice.webm';
      const audioFile = new File([buffer], filename, { type: mime || 'audio/webm' });
      const transcription = await ai.audio.transcriptions.create({
        model: 'whisper-1',
        file: audioFile,
        language: WHISPER_LANG[lang] || 'en',
      });
      return (transcription.text || '').trim();
    } catch (err) {
      console.error('[transcribe] Whisper error:', err.message);
    }
  }

  return null;
}

async function generateAIReply(messages, schoolId) {
  // Try Gemini first (free tier)
  if (process.env.GEMINI_API_KEY) {
    try {
      const { systemText, contents } = await geminiContents(messages);

      const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemText }] },
            contents,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 900,
              topP: 0.9,
            },
          }),
        }
      );

      const data = await res.json();
      if (data.error) {
        console.error('Gemini API error:', data.error.message);
      } else {
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply) return reply;
      }
    } catch (err) {
      console.error('Gemini error:', err.message);
    }
  }

  // Fallback to OpenAI
  if (process.env.OPENAI_API_KEY) {
    try {
      const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await ai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 1024,
        temperature: 0.7,
      });
      return completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
    } catch (err) {
      console.error('OpenAI error:', err.message);
    }
  }

  return null;
}

async function* streamAIReply(messages) {
  // Try Gemini first (streaming SSE)
  if (process.env.GEMINI_API_KEY) {
    try {
      const { systemText, contents } = await geminiContents(messages);
      const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemText }] },
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 900, topP: 0.9 },
          }),
        }
      );

      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let pending = [];
        let emitted = 0;
        const flushEvent = () => {
          if (pending.length === 0) return;
          const payload = pending.join('\n');
          pending = [];
          if (!payload.trim()) return;
          try {
            const json = JSON.parse(payload);
            const part = json?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (part) {
              emitted += part.length;
              return part;
            }
            if (json?.error) console.error('Gemini stream error:', json.error.message);
          } catch { /* partial data */ }
          return null;
        };

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          let idx;
          while ((idx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 1);
            if (line === '') {
              const text = flushEvent();
              if (text) yield text;
            } else if (line.startsWith('data:')) {
              pending.push(line.slice(5).trim());
            }
          }
        }
        const tail = flushEvent();
        if (tail) yield tail;
        if (emitted > 0) return;
      } else {
        const text = await res.text();
        console.error('Gemini stream HTTP error:', res.status, text.slice(0, 200));
      }
    } catch (err) {
      console.error('Gemini stream error:', err.message);
    }
  }

  // Fallback: OpenAI streaming
  if (process.env.OPENAI_API_KEY) {
    try {
      const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const stream = await ai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 900,
        temperature: 0.7,
        stream: true,
      });
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      }
    } catch (err) {
      console.error('OpenAI stream error:', err.message);
    }
  }
}

module.exports = { SYSTEM_PROMPT, generateAIReply, streamAIReply, checkAILimit, detectLanguage, buildKofiSystem, transcribeAudio, LANGUAGE_NAMES };
