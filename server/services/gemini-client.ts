import { GoogleGenAI } from '@google/genai';

// Debug logging for Gemini client initialization
console.log('🔧 GEMINI CLIENT: Initializing shared Gemini client...');
console.log('🔧 GEMINI CLIENT: GEMINI_API_KEY present:', !!process.env.GEMINI_API_KEY);

// Shared Gemini client instance to avoid bundling conflicts
export const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

console.log('🔧 GEMINI CLIENT: Gemini client created successfully');

// Helper function to generate content using Google GenAI
export const generateGeminiContent = async (prompt: string, model: string = "gemini-1.5-pro") => {
  console.log('🔧 GEMINI CLIENT: Generating content with model:', model);
  console.log('🔧 GEMINI CLIENT: Prompt length:', prompt.length);
  
  try {
    // Get the generative model
    const generativeModel = gemini.getGenerativeModel({ model: model });
    
    // Generate content
    const result = await generativeModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log('🔧 GEMINI CLIENT: Content generated successfully');
    
    // Return a response object that matches our expected structure
    return {
      response: {
        candidates: [{
          content: {
            parts: [{
              text: text
            }]
          }
        }]
      }
    };
  } catch (error) {
    console.error('🔧 GEMINI CLIENT: Content generation failed:', error);
    throw error;
  }
};

export default gemini;
