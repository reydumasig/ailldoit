import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wand2, Sparkles, RefreshCw, Camera, Eye } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface PromptSuggestion {
  id: string;
  title: string;
  prompt: string;
  description: string;
  tags: {
    industry: string[];
    audience: string[];
    platform: string[];
    tone: string[];
    motionType: string[];
    visualVibe: string[];
  };
}

interface LinkedSuggestions {
  analysis: {
    category: string;
    audience: string;
    platform: string;
    tone: string;
    style: string;
    keywords: string[];
  };
  suggestions: {
    matched: PromptSuggestion[];
    custom: PromptSuggestion;
  };
}

interface LinkedPromptSuggestionsProps {
  brief: string;
  platform: string;
  language: string;
  onSelectPrompt: (prompt: string) => void;
  isVisible: boolean;
}

export function LinkedPromptSuggestions({ 
  brief, 
  platform, 
  language, 
  onSelectPrompt, 
  isVisible 
}: LinkedPromptSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<LinkedSuggestions | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null);
  const { toast } = useToast();

  // Debounced suggestion loading
  useEffect(() => {
    if (isVisible && brief.trim().length > 20) {
      const timeoutId = setTimeout(() => {
        loadSuggestions();
      }, 1500); // Wait 1.5 seconds after user stops typing

      return () => clearTimeout(timeoutId);
    }
  }, [brief, platform, language, isVisible]);

  const loadSuggestions = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/prompts/link-suggestions', {
        brief,
        platform,
        language
      });
      
      // Parse the response - handle both parsed JSON and Response objects
      let data;
      if (response instanceof Response) {
        data = await response.json();
      } else if (typeof response === 'string') {
        data = JSON.parse(response);
      } else {
        data = response;
      }
      
      console.log('🔗 LinkedPromptSuggestions received data:', data);
      
      // Ensure data structure matches our interface
      if (data && data.analysis && data.suggestions) {
        setSuggestions(data);
        console.log('✅ Suggestions set successfully:', data.suggestions);
      } else {
        console.error('❌ Invalid data structure received:', data);
        toast({
          title: "Error",
          description: "Invalid response format from server",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Error loading linked suggestions:', error);
      toast({
        title: "Error",
        description: "Failed to load visual prompt suggestions",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPrompt = (suggestion: PromptSuggestion) => {
    setSelectedSuggestion(suggestion.id);
    onSelectPrompt(suggestion.prompt);
    toast({
      title: "Visual Prompt Applied",
      description: `"${suggestion.title}" has been applied to your campaign`,
    });
  };

  if (!isVisible || !brief.trim()) {
    return null;
  }

  return (
    <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-purple-700">
          <Wand2 className="w-5 h-5" />
          Visual Prompt Suggestions
          <Badge variant="outline" className="text-xs border-purple-300 text-purple-600">
            Auto-Generated
          </Badge>
        </CardTitle>
        <p className="text-sm text-purple-600">
          AI-matched creative prompts based on your campaign brief
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2 text-purple-600">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-sm">Analyzing brief and matching prompts...</span>
            </div>
          </div>
        ) : suggestions ? (
          <>
            {/* Debug Info */}
            {console.log('🎨 Rendering suggestions:', suggestions)}
            
            {/* Analysis Summary */}
            {suggestions.analysis && (
              <div className="bg-purple-100 rounded-lg p-3 text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-4 h-4 text-purple-600" />
                  <span className="font-medium text-purple-700">Analysis</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary" className="text-xs bg-purple-200 text-purple-700">
                    {suggestions.analysis.category}
                  </Badge>
                  <Badge variant="secondary" className="text-xs bg-purple-200 text-purple-700">
                    {suggestions.analysis.audience}
                  </Badge>
                  <Badge variant="secondary" className="text-xs bg-purple-200 text-purple-700">
                    {suggestions.analysis.tone}
                  </Badge>
                  <Badge variant="secondary" className="text-xs bg-purple-200 text-purple-700">
                    {suggestions.analysis.style}
                  </Badge>
                </div>
              </div>
            )}

            {/* AI Custom Prompt */}
            {suggestions.suggestions?.custom && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-purple-700 flex items-center gap-1">
                  <Sparkles className="w-4 h-4" />
                  AI Custom Prompt
                </h4>
                <Card className={`cursor-pointer transition-all border-2 ${
                  selectedSuggestion === suggestions.suggestions.custom.id 
                    ? 'border-purple-400 bg-purple-50' 
                    : 'border-purple-200 hover:border-purple-300'
                }`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h5 className="font-medium text-sm text-purple-700">
                        {suggestions.suggestions.custom.title}
                      </h5>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSelectPrompt(suggestions.suggestions.custom)}
                        className="text-purple-600 border-purple-300 hover:bg-purple-50"
                      >
                        <Camera className="w-3 h-3 mr-1" />
                        Use
                      </Button>
                    </div>
                    <p className="text-xs text-purple-600 mb-2">
                      {suggestions.suggestions.custom.description}
                    </p>
                    <p className="text-xs text-gray-600 line-clamp-2">
                      {suggestions.suggestions.custom.prompt}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Matched Prompt Templates */}
            {suggestions.suggestions?.matched && suggestions.suggestions.matched.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-purple-700">
                  Matched Templates ({suggestions.suggestions.matched.length})
                </h4>
                <div className="grid gap-2">
                  {suggestions.suggestions.matched.map((suggestion) => (
                    <Card 
                      key={suggestion.id}
                      className={`cursor-pointer transition-all border-2 ${
                        selectedSuggestion === suggestion.id 
                          ? 'border-purple-400 bg-purple-50' 
                          : 'border-purple-200 hover:border-purple-300'
                      }`}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between mb-2">
                          <h5 className="font-medium text-sm text-purple-700">
                            {suggestion.title}
                          </h5>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSelectPrompt(suggestion)}
                            className="text-purple-600 border-purple-300 hover:bg-purple-50"
                          >
                            <Camera className="w-3 h-3 mr-1" />
                            Use
                          </Button>
                        </div>
                        <p className="text-xs text-purple-600 mb-2">
                          {suggestion.description}
                        </p>
                        <p className="text-xs text-gray-600 line-clamp-2">
                          {suggestion.prompt}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {suggestion.tags.visualVibe.map((vibe) => (
                            <Badge key={vibe} variant="outline" className="text-xs border-purple-200 text-purple-500">
                              {vibe}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Refresh Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={loadSuggestions}
              disabled={isLoading}
              className="w-full text-purple-600 border-purple-300 hover:bg-purple-50"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh Suggestions
            </Button>
          </>
        ) : (
          <div className="text-center py-4 text-sm text-purple-600">
            <Wand2 className="w-8 h-8 mx-auto mb-2 text-purple-400" />
            <p>Enter a detailed product brief to see visual prompt suggestions</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}