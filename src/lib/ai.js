const OpenAI = require('openai');
const prisma = require('./prisma');

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
    parts.push('\nThis is a voice lesson. Keep the reply short, clear, and natural to read aloud — at most 2 short paragraphs, no tables or heavy symbols.');
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

function geminiContents(messages) {
  const systemMsg = messages.find(m => m.role === 'system');
  const userMessages = messages.filter(m => m.role !== 'system');
  const lastUserMsg = userMessages[userMessages.length - 1]?.content || '';

  const contents = [];
  for (const msg of userMessages.slice(0, -1)) {
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    });
  }
  contents.push({ role: 'user', parts: [{ text: lastUserMsg }] });
  return { systemText: systemMsg?.content || SYSTEM_PROMPT, contents };
}

async function generateAIReply(messages, schoolId) {
  // Try Gemini first (free tier)
  if (process.env.GEMINI_API_KEY) {
    try {
      const { systemText, contents } = geminiContents(messages);

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
      const { systemText, contents } = geminiContents(messages);
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
        let emitted = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sep;
          while ((sep = buffer.indexOf('\n\n')) !== -1) {
            const event = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            for (const line of event.split('\n')) {
              if (!line.startsWith('data:')) continue;
              const payload = line.slice(5).trim();
              if (!payload) continue;
              try {
                const json = JSON.parse(payload);
                const part = json?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (part) {
                  emitted += part.length;
                  yield part;
                } else if (json?.error) {
                  console.error('Gemini stream error:', json.error.message);
                }
              } catch { /* partial line */ }
            }
          }
        }
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

module.exports = { SYSTEM_PROMPT, generateAIReply, streamAIReply, checkAILimit, detectLanguage, buildKofiSystem, LANGUAGE_NAMES };
