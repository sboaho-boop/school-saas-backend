process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';
const { test } = require('node:test');
const assert = require('node:assert');
const ai = require('../src/lib/ai');

test('detectLanguage falls back to English', () => {
  assert.strictEqual(ai.detectLanguage('What is two plus two?'), 'en');
});

test('detectLanguage detects Twi', () => {
  assert.strictEqual(ai.detectLanguage('Wo ho te sεn, me din de Kofi'), 'tw');
});

test('detectLanguage detects Hausa', () => {
  assert.strictEqual(ai.detectLanguage('Sannu, ina kwana?', 'ha') || ai.detectLanguage('Sannu, ina kwana?'), 'ha');
});

test('buildKofiSystem injects the student name', () => {
  const sys = ai.buildKofiSystem({ name: 'Ama', languageCode: 'en', voice: false });
  assert.ok(sys.includes('Ama'));
});

test('buildKofiSystem adds a full-language instruction for non-English', () => {
  const sys = ai.buildKofiSystem({ name: 'Ama', languageCode: 'tw', voice: false });
  assert.ok(sys.includes('Respond fully in Twi'));
});

test('buildKofiSystem adds a speech note for voice lessons', () => {
  const sys = ai.buildKofiSystem({ name: 'Ama', languageCode: 'en', voice: true });
  assert.ok(sys.includes('voice lesson'));
});

test('LANGUAGE_NAMES covers all supported languages', () => {
  for (const code of ['en', 'fr', 'tw', 'ha', 'ga', 'ewe', 'fante', 'dagbani']) {
    assert.ok(ai.LANGUAGE_NAMES[code], `missing LANGUAGE_NAMES entry for ${code}`);
  }
});

test('jwt secret must not be a public fallback', () => {
  const secret = process.env.JWT_SECRET || 'fallback-secret';
  assert.ok(secret.length >= 24, 'JWT_SECRET too short (production requires a strong secret)');
  assert.notStrictEqual(secret, 'fallback-secret');
  assert.notStrictEqual(secret, 'teacher-kofi-secret');
});