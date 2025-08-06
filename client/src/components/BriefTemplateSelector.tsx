import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Sparkles, 
  TrendingUp, 
  User, 
  Star, 
  Wand2, 
  Search,
  Copy,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BriefTemplate {
  id: string;
  title: string;
  prompt: string;
  tags: string[];
  platforms: string[];
  tone: string;
  languagesSupported: string[];
  trendingTopic?: string;
  relevanceScore: number;
  category: string;
}

interface BriefTemplateSelectorProps {
  platform: string;
  language: string;
  onSelectTemplate: (prompt: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function BriefTemplateSelector({
  platform,
  language,
  onSelectTemplate,
  isOpen,
  onClose
}: BriefTemplateSelectorProps) {
  const [customTopic, setCustomTopic] = useState('');
  const [isGeneratingCustom, setIsGeneratingCustom] = useState(false);
  const { toast } = useToast();

  // Fetch template recommendations
  const { data: recommendations, isLoading, refetch } = useQuery({
    queryKey: ['/api/brief-templates/recommendations', platform, language],
    queryFn: async () => {
      const { apiRequest } = await import('@/lib/queryClient');
      const response = await apiRequest('GET', `/api/brief-templates/recommendations?platform=${platform}&language=${language}`);
      return response.json();
    },
    enabled: isOpen && !!platform && !!language,
  });

  const handleSelectTemplate = (template: BriefTemplate) => {
    onSelectTemplate(template.prompt);
    toast({
      title: "Template Applied",
      description: `"${template.title}" has been applied to your brief.`,
    });
    onClose();
  };

  const handleGenerateCustom = async () => {
    if (!customTopic.trim()) {
      toast({
        title: "Topic Required",
        description: "Please enter a topic to generate custom templates.",
        variant: "destructive"
      });
      return;
    }

    setIsGeneratingCustom(true);
    try {
      const { apiRequest } = await import('@/lib/queryClient');
      const response = await apiRequest('POST', '/api/brief-templates/generate', {
        topic: customTopic,
        platform,
        language
      });

      const data = await response.json();
      
      if (data.templates && data.templates.length > 0) {
        handleSelectTemplate(data.templates[0]);
      } else {
        toast({
          title: "No Templates Generated",
          description: "Try a different topic or use one of the recommended templates.",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Generation Failed",
        description: "Failed to generate custom templates. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingCustom(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Template copied to clipboard.",
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-ailldoit-black">AI Brief Templates</h2>
            <p className="text-sm text-ailldoit-muted">Choose from trending, personalized, or popular templates</p>
          </div>
          <Button variant="ghost" onClick={onClose}>✕</Button>
        </div>

        <div className="p-6">
          {/* Custom Topic Generator */}
          <Card className="mb-6 border-ailldoit-accent/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-ailldoit-black">
                <Wand2 className="w-5 h-5 text-ailldoit-accent" />
                Generate Custom Template
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label htmlFor="custom-topic" className="text-sm text-ailldoit-muted">
                    Enter a trending topic or theme
                  </Label>
                  <Input
                    id="custom-topic"
                    placeholder="e.g., AI productivity tools, sustainable fashion, quick recipes..."
                    value={customTopic}
                    onChange={(e) => setCustomTopic(e.target.value)}
                    className="mt-1"
                    onKeyPress={(e) => e.key === 'Enter' && handleGenerateCustom()}
                  />
                </div>
                <Button 
                  onClick={handleGenerateCustom}
                  disabled={isGeneratingCustom || !customTopic.trim()}
                  className="bg-ailldoit-accent hover:bg-ailldoit-accent/90 text-white mt-6"
                >
                  {isGeneratingCustom ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Generate
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Template Recommendations */}
          {isLoading ? (
            <div className="text-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-ailldoit-accent mx-auto mb-4" />
              <p className="text-ailldoit-muted">Loading personalized templates...</p>
            </div>
          ) : (
            <Tabs defaultValue="trending" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="trending" className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Trending ({recommendations?.trending?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="personalized" className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  For You ({recommendations?.personalized?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="popular" className="flex items-center gap-2">
                  <Star className="w-4 h-4" />
                  Popular ({recommendations?.popular?.length || 0})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="trending" className="mt-6">
                <div className="grid gap-4">
                  {recommendations?.trending?.map((template: BriefTemplate) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      onSelect={handleSelectTemplate}
                      onCopy={copyToClipboard}
                      variant="trending"
                    />
                  ))}
                  {(!recommendations?.trending || recommendations.trending.length === 0) && (
                    <div className="text-center py-8 text-ailldoit-muted">
                      <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No trending templates available right now.</p>
                      <p className="text-sm">Try generating a custom template above.</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="personalized" className="mt-6">
                <div className="grid gap-4">
                  {recommendations?.personalized?.map((template: BriefTemplate) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      onSelect={handleSelectTemplate}
                      onCopy={copyToClipboard}
                      variant="personalized"
                    />
                  ))}
                  {(!recommendations?.personalized || recommendations.personalized.length === 0) && (
                    <div className="text-center py-8 text-ailldoit-muted">
                      <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No personalized templates yet.</p>
                      <p className="text-sm">Create more campaigns to get personalized suggestions.</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="popular" className="mt-6">
                <div className="grid gap-4">
                  {recommendations?.popular?.map((template: BriefTemplate) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      onSelect={handleSelectTemplate}
                      onCopy={copyToClipboard}
                      variant="popular"
                    />
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}

interface TemplateCardProps {
  template: BriefTemplate;
  onSelect: (template: BriefTemplate) => void;
  onCopy: (text: string) => void;
  variant: 'trending' | 'personalized' | 'popular';
}

function TemplateCard({ template, onSelect, onCopy, variant }: TemplateCardProps) {
  const getVariantIcon = () => {
    switch (variant) {
      case 'trending': return <TrendingUp className="w-4 h-4" />;
      case 'personalized': return <User className="w-4 h-4" />;
      case 'popular': return <Star className="w-4 h-4" />;
    }
  };

  const getVariantColor = () => {
    switch (variant) {
      case 'trending': return 'bg-green-100 text-green-800 border-green-200';
      case 'personalized': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'popular': return 'bg-purple-100 text-purple-800 border-purple-200';
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer group">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <CardTitle className="text-base text-ailldoit-black flex items-center gap-2">
              {getVariantIcon()}
              {template.title}
              {template.trendingTopic && (
                <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                  {template.trendingTopic}
                </span>
              )}
            </CardTitle>
            <div className="flex flex-wrap gap-1 mt-2">
              <span className={`text-xs px-2 py-1 rounded-full ${getVariantColor()}`}>
                {template.category}
              </span>
              <span className="text-xs px-2 py-1 border border-gray-200 text-gray-600 rounded-full">
                {template.tone}
              </span>
              <span className="text-xs px-2 py-1 border border-gray-200 text-gray-600 rounded-full">
                Score: {Math.round(template.relevanceScore * 100)}%
              </span>
            </div>
          </div>
          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onCopy(template.prompt);
              }}
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-ailldoit-muted mb-4 line-clamp-3">
          {template.prompt}
        </p>
        <div className="flex flex-wrap gap-1 mb-4">
          {template.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
              {tag}
            </span>
          ))}
        </div>
        <div className="flex justify-between items-center">
          <div className="text-xs text-ailldoit-muted">
            {template.platforms.join(', ')} • {template.languagesSupported.join(', ')}
          </div>
          <Button
            onClick={() => onSelect(template)}
            className="bg-ailldoit-accent hover:bg-ailldoit-accent/90 text-white"
            size="sm"
          >
            Use Template
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}