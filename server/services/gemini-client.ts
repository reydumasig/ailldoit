import { VertexAI } from '@google-cloud/vertexai';

// Debug logging for Vertex AI client initialization
console.log('🔧 VERTEX AI CLIENT: Initializing shared Vertex AI client...');
console.log('🔧 VERTEX AI CLIENT: GEMINI_API_KEY present:', !!process.env.GEMINI_API_KEY);
console.log('🔧 VERTEX AI CLIENT: VERTEX_API_KEY present:', !!process.env.VERTEX_API_KEY);
console.log('🔧 VERTEX AI CLIENT: GOOGLE_APPLICATION_CREDENTIALS present:', !!process.env.GOOGLE_APPLICATION_CREDENTIALS);

// Shared Vertex AI client instance
export const vertexAI = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT || 'ailldoit-6d0e0',
  location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
});

console.log('🔧 VERTEX AI CLIENT: Vertex AI client created successfully');
console.log('🔧 VERTEX AI CLIENT: Project:', process.env.GOOGLE_CLOUD_PROJECT || 'ailldoit-6d0e0');
console.log('🔧 VERTEX AI CLIENT: Location:', process.env.GOOGLE_CLOUD_LOCATION || 'us-central1');

// Helper function to generate content using Vertex AI
export const generateGeminiContent = async (prompt: string, model: string = "gemini-1.5-flash") => {
  console.log('🔧 VERTEX AI CLIENT: Generating content with model:', model);
  console.log('🔧 VERTEX AI CLIENT: Prompt length:', prompt.length);
  
  try {
    // Get the generative model
    const generativeModel = vertexAI.getGenerativeModel({
      model: model,
    });
    
    // Generate content
    const result = await generativeModel.generateContent(prompt);
    
    console.log('🔧 VERTEX AI CLIENT: Content generated successfully');
    
    // Return a response object that matches our expected structure
    return {
      response: {
        candidates: [{
          content: {
            parts: [{
              text: result.response.text()
            }]
          }
        }]
      }
    };
  } catch (error) {
    console.error('🔧 VERTEX AI CLIENT: Content generation failed:', error);
    throw error;
  }
};

// Legacy export for compatibility
export const gemini = vertexAI;
export default vertexAI;
