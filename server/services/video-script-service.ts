import { generateGeminiContent } from './gemini-client';

export interface VideoSegment {
  segmentNumber: number;
  duration: number; // in seconds
  prompt: string;
  subject: string;
  context: string;
  action: string;
  style: string;
  ambiance: string;
  cameraMotion: string;
  lighting: string;
  colorGrading: string;
  visualDescriptors: string[]; // Consistent visual elements across segments
}

export interface VideoScript {
  brief: string;
  totalDuration: number;
  segments: VideoSegment[];
  continuityBible: {
    characterAppearance?: string;
    consistentStyle: string;
    consistentLighting: string;
    consistentColorGrading: string;
    visualAnchors: string[];
  };
}

export class VideoScriptService {
  /**
   * Generate a structured video script using Gemini LLM
   * Creates a "Generative Continuity Bible" for consistent video generation
   */
  async generateStructuredScript(
    brief: string,
    targetDuration: number,
    platform: string = 'general'
  ): Promise<VideoScript> {
    console.log(`📝 VIDEO SCRIPT: Generating structured script for ${targetDuration}s video`);
    console.log(`📋 VIDEO SCRIPT: Brief: "${brief.substring(0, 100)}..."`);
    
    const segmentCount = Math.ceil(targetDuration / 8);
    
    const systemPrompt = `You are an expert video scriptwriter and cinematographer. Generate a detailed, structured video script for a ${targetDuration}-second social media video.

REQUIREMENTS:
1. Break the narrative into exactly ${segmentCount} segments, each 8 seconds long
2. For each segment, provide detailed cinematic specifications following Veo 3.1 prompt guidelines
3. Create a "Continuity Bible" with consistent visual descriptors that will be used across ALL segments
4. Ensure smooth narrative flow between segments
5. Platform: ${platform}

OUTPUT FORMAT (JSON):
{
  "segments": [
    {
      "segmentNumber": 1,
      "duration": 8,
      "prompt": "Full detailed prompt for Veo 3.1 generation",
      "subject": "Main subject/character description",
      "context": "Scene context and setting",
      "action": "Specific action happening in this segment",
      "style": "Cinematic style (e.g., 'shot on 35mm, cinematic realism')",
      "ambiance": "Mood and atmosphere",
      "cameraMotion": "Camera movement description",
      "lighting": "Lighting description (e.g., 'golden hour, deep shadows')",
      "colorGrading": "Color grading description"
    }
  ],
  "continuityBible": {
    "consistentStyle": "Style that applies to ALL segments",
    "consistentLighting": "Lighting that applies to ALL segments",
    "consistentColorGrading": "Color grading that applies to ALL segments",
    "visualAnchors": ["Key visual elements to maintain across all segments"]
  }
}

IMPORTANT:
- Use IDENTICAL lighting, style, and color grading descriptors in every segment prompt
- Ensure character appearance descriptions are consistent across segments
- Each segment prompt should flow logically from the previous one
- Include specific camera movements and visual details`;

    const userPrompt = `Create a ${targetDuration}-second video script based on this brief:

"${brief}"

Platform: ${platform}
Target audience: Southeast Asian social media users
Style: Modern, engaging, viral-worthy content`;

    try {
      const response = await generateGeminiContent(
        `${systemPrompt}\n\n${userPrompt}`,
        'gemini-2.5-pro' // Use Pro model for better structured output
      );

      const text = response.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      // Parse JSON from response (handle markdown code blocks)
      let scriptData: any;
      try {
        const cleaned = text
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();
        scriptData = JSON.parse(cleaned);
      } catch (parseError) {
        console.warn('⚠️ VIDEO SCRIPT: Failed to parse structured JSON, using fallback generation');
        return this.generateFallbackScript(brief, targetDuration, platform);
      }

      // Validate and structure the response
      const script: VideoScript = {
        brief,
        totalDuration: targetDuration,
        segments: scriptData.segments || [],
        continuityBible: scriptData.continuityBible || {
          consistentStyle: 'modern advertising, cinematic quality',
          consistentLighting: 'professional lighting, well-lit',
          consistentColorGrading: 'vibrant, modern color grading',
          visualAnchors: []
        }
      };

      console.log(`✅ VIDEO SCRIPT: Generated ${script.segments.length} segments with continuity bible`);
      return script;

    } catch (error) {
      console.error('❌ VIDEO SCRIPT: Script generation failed, using fallback:', error);
      return this.generateFallbackScript(brief, targetDuration, platform);
    }
  }

  /**
   * Fallback script generation if LLM generation fails
   */
  private generateFallbackScript(
    brief: string,
    targetDuration: number,
    platform: string
  ): VideoScript {
    const segmentCount = Math.ceil(targetDuration / 8);
    const segments: VideoSegment[] = [];

    for (let i = 0; i < segmentCount; i++) {
      const isFirst = i === 0;
      const isLast = i === segmentCount - 1;

      let prompt = brief;
      if (isFirst) {
        prompt = `Opening scene: ${brief}. Start with an engaging introduction.`;
      } else if (isLast) {
        prompt = `Final scene: ${brief}. Show conclusion and call to action.`;
      } else {
        prompt = `Middle scene ${i + 1}: ${brief}. Continue the narrative progression.`;
      }

      segments.push({
        segmentNumber: i + 1,
        duration: 8,
        prompt: `${prompt} Modern advertising style, professional cinematography, well-lit, vibrant colors.`,
        subject: 'Main subject',
        context: 'Social media advertisement',
        action: isFirst ? 'Introduction' : isLast ? 'Conclusion' : 'Progression',
        style: 'modern advertising, cinematic quality',
        ambiance: 'engaging, professional',
        cameraMotion: 'smooth, dynamic',
        lighting: 'professional lighting, well-lit',
        colorGrading: 'vibrant, modern color grading',
        visualDescriptors: []
      });
    }

    return {
      brief,
      totalDuration: targetDuration,
      segments,
      continuityBible: {
        consistentStyle: 'modern advertising, cinematic quality',
        consistentLighting: 'professional lighting, well-lit',
        consistentColorGrading: 'vibrant, modern color grading',
        visualAnchors: []
      }
    };
  }
}

export const videoScriptService = new VideoScriptService();

