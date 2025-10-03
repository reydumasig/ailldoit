import { GoogleGenAI } from '@google/genai';

// Debug logging for Gemini client initialization
console.log('🔧 GEMINI CLIENT: Initializing shared Gemini client...');
console.log('🔧 GEMINI CLIENT: GEMINI_API_KEY present:', !!process.env.GEMINI_API_KEY);
console.log('🔧 GEMINI CLIENT: GEMINI_API_KEY value:', process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET');

// Shared Gemini client instance to avoid bundling conflicts
export const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

console.log('🔧 GEMINI CLIENT: Gemini client created successfully');
console.log('🔧 GEMINI CLIENT: Gemini client methods:', Object.getOwnPropertyNames(gemini));
console.log('🔧 GEMINI CLIENT: getGenerativeModel available:', typeof gemini.getGenerativeModel);

export default gemini;
