import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';

async function main() {
  console.log('Testing Gemini API client...');
  console.log('Model configured:', env.GEMINI_MODEL);
  if (!env.GEMINI_API_KEY) {
    console.log('No GEMINI_API_KEY detected.');
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const res = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: 'Respond with the word "CONFIRMED" only.',
    });
    console.log('Live Gemini Smoke Test Result:', res.text?.trim());
  } catch (err: any) {
    console.log('Live Gemini Smoke Test Error:', err.message);
  }
}

main();
