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
console.log('🔧 GEMINI CLIENT: Models available:', Object.getOwnPropertyNames(gemini.models));
console.log('🔧 GEMINI CLIENT: generateContent available:', typeof gemini.models.generateContent);

// Helper function to generate content using the new API
export const generateGeminiContent = async (prompt: string, model: string = "gemini-1.5-flash") => {
  console.log('🔧 GEMINI CLIENT: Generating content with model:', model);
  console.log('🔧 GEMINI CLIENT: Prompt length:', prompt.length);
  
  try {
    const result = await gemini.models.generateContent({
      model: model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    
    console.log('🔧 GEMINI CLIENT: Content generated successfully');
    return result;
  } catch (error) {
    console.error('🔧 GEMINI CLIENT: Content generation failed:', error);
    throw error;
  }
};

export default gemini;
