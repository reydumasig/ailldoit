import { GoogleGenAI } from '@google/genai';

// Lazy initialization of Gemini client to avoid startup failures
let geminiInstance: GoogleGenAI | null = null;

const getGeminiClient = (): GoogleGenAI => {
  if (!geminiInstance) {
    console.log('🔧 GEMINI CLIENT: Initializing shared Gemini client...');
    console.log('🔧 GEMINI CLIENT: GEMINI_API_KEY present:', !!process.env.GEMINI_API_KEY);
    
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    
    geminiInstance = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
    
    console.log('🔧 GEMINI CLIENT: Gemini client created successfully');
  }
  return geminiInstance;
};

// Export for compatibility - lazy getter
export const gemini = {
  getGenerativeModel: (options: any) => getGeminiClient().getGenerativeModel(options)
};

// Helper function to generate content using Google GenAI
export const generateGeminiContent = async (prompt: string, model: string = "gemini-1.5-pro") => {
  console.log('🔧 GEMINI CLIENT: Generating content with model:', model);
  console.log('🔧 GEMINI CLIENT: Prompt length:', prompt.length);
  
  try {
    // Get the generative model using lazy initialization
    const geminiClient = getGeminiClient();
    const generativeModel = geminiClient.getGenerativeModel({ model: model });
    
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
