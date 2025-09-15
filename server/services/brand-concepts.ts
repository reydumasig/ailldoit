import { GeneratedContent } from '@shared/schema';

export interface BrandConcept {
  name: string;
  displayName: string;
  positivePrompt: string;
  negativePrompt: string;
  description: string;
  usageTypes: string[];
}

export interface PromptAugmentation {
  positive: string;
  negative: string;
  aspectRatio?: string;
}

export interface AugmentImagePromptParams {
  description: string;
  style: string;
  referenceImageUrl?: string;
  conceptType?: string;
  conceptUsage?: string;
}

// Brand concepts configuration
export const brandConcepts: Record<string, BrandConcept> = {
  nanoBanana: {
    name: 'nanoBanana',
    displayName: 'Nano Banana',
    positivePrompt: 'include subtle nano banana micro-motifs, tiny banana-shaped accents, banana yellow highlights, modern commercial style',
    negativePrompt: 'no large cartoon bananas, no fruit puns, no readable text, no logos, no watermarks, no clutter',
    description: 'Adds subtle banana-themed visual elements as micro-motifs and accent colors',
    usageTypes: ['mascot', 'pattern', 'garnish', 'tech']
  }
};

// Usage-specific prompt variations
const conceptUsagePrompts: Record<string, Record<string, string>> = {
  nanoBanana: {
    mascot: 'tiny banana character as a subtle accent or pin-like element',
    pattern: 'repeating mini-banana pattern in backgrounds or packaging elements', 
    garnish: 'small banana chips or banana-colored dust implied in product presentation',
    tech: 'nano-scale precision visuals with banana yellow highlighting premium details'
  }
};

/**
 * Augments image generation prompts with brand concept directives
 */
export function augmentImagePrompt(params: AugmentImagePromptParams): PromptAugmentation {
  const { description, style, referenceImageUrl, conceptType, conceptUsage } = params;
  
  let positiveAddition = '';
  let negativeAddition = '';
  
  // Add concept-specific prompt additions
  if (conceptType && brandConcepts[conceptType]) {
    const concept = brandConcepts[conceptType];
    positiveAddition += `, ${concept.positivePrompt}`;
    negativeAddition += `, ${concept.negativePrompt}`;
    
    // Add usage-specific variations
    if (conceptUsage && conceptUsagePrompts[conceptType]?.[conceptUsage]) {
      positiveAddition += `, ${conceptUsagePrompts[conceptType][conceptUsage]}`;
    }
  }
  
  // Build enhanced positive prompt
  let enhancedPositive = `${description}, ${style} style, high quality, professional advertising photo, clean background, well-lit, commercial photography, product showcase, social media ready`;
  
  if (referenceImageUrl) {
    enhancedPositive += `, take visual inspiration from the provided reference material for color scheme and branding elements`;
  }
  
  enhancedPositive += positiveAddition;
  
  // Build negative prompt
  let enhancedNegative = `avoid blurry or low quality images, no text, no watermarks`;
  enhancedNegative += negativeAddition;
  
  return {
    positive: enhancedPositive,
    negative: enhancedNegative,
    aspectRatio: '1:1' // Default aspect ratio
  };
}

/**
 * Augments content generation prompts with brand concept context
 */
export function augmentContentPrompt(brief: string, conceptType?: string, conceptUsage?: string): string {
  if (!conceptType || !brandConcepts[conceptType]) {
    return brief;
  }
  
  const concept = brandConcepts[conceptType];
  let augmentedBrief = brief;
  
  // Add concept context to the brief
  augmentedBrief += `\n\nBRAND CONCEPT: Incorporate ${concept.displayName} visual elements in the creative direction.`;
  
  if (conceptUsage && conceptUsagePrompts[conceptType]?.[conceptUsage]) {
    augmentedBrief += ` Focus on ${conceptUsagePrompts[conceptType][conceptUsage]}.`;
  }
  
  augmentedBrief += ` Ensure the ${concept.displayName} elements are subtle and enhance rather than dominate the overall design.`;
  
  return augmentedBrief;
}