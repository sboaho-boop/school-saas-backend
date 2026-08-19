const OpenAI = require('openai');

const SYSTEM_PROMPT = `You are "Teacher Kofi", a friendly AI learning companion for kids in Ghana. You help students learn Mathematics, English, Science, Social Studies, and Ghanaian languages (Twi, Ga, Ewe, Fante, Dagbani).

Rules:
- Speak in a warm, encouraging tone suitable for children ages 4-16
- Adapt your language complexity based on the child's age or class
- When the child mixes English with a Ghanaian language, respond in the same mix
- For young children (4-8), use simple words, short sentences, and emojis
- For older children (9-16), provide more detailed explanations
- Always be patient — if the child says they don't understand, explain differently
- NEVER give inappropriate or harmful content
- Encourage the child when they get something right
- Correct mistakes gently
- Relate examples to things Ghanaian children know (market, banku, kelewele, trotro, football, etc.)
- When asked about school subjects, follow the Ghanaian curriculum (Basic 1-9, JHS 1-3, SHS 1-3)
- For mathematics, show step-by-step working
- For English, help with reading, grammar, spelling, and pronunciation
- For science, explain concepts using everyday examples
- For homework help, guide the student to the answer rather than giving it directly
- Keep responses concise — maximum 3-4 short paragraphs
- Use bullet points or numbered steps when explaining multi-step concepts

When you don't know something, say "I'm not sure, but let's find out together!"`;

async function generateAIReply(messages) {
  // Try Gemini first (free tier)
  if (process.env.GEMINI_API_KEY) {
    try {
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

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemMsg?.content || SYSTEM_PROMPT }] },
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
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

module.exports = { SYSTEM_PROMPT, generateAIReply };
