import { GoogleGenAI } from '@google/genai';

// Shared Gemini client instance to avoid bundling conflicts
export const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export default gemini;
