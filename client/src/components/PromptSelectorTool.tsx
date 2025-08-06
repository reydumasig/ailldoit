import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { 
  Wand2, 
  Filter, 
  Shuffle,
  Star,
  Copy,
  Edit3,
  Lightbulb,
  Camera,
  Palette,
  Sparkles,
  RefreshCw,
  Heart,
  TrendingUp
} from 'lucide-react';

interface PromptTemplate {
  id: string;
  title: string;
  category: string;
  prompt: string;
  tags: string[];
  shotType: string;
  tone: string;
  subject: string;
  style: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  usageCount: number;
  rating: number;
}

interface PromptSelectorToolProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: string) => void;
  currentPrompt?: string;
}

export default function PromptSelectorTool({
  isOpen,
  onClose, 
  onSelectPrompt,
  currentPrompt
}: PromptSelectorToolProps) {
  const [activeTab, setActiveTab] = useState('categories');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [filters, setFilters] = useState({
    shotType: 'all',
    tone: 'all', 
    subject: 'all',
    difficulty: 'all'
  });
  const [customizations, setCustomizations] = useState<Record<string, string>>({});
  const [guidedOptions, setGuidedOptions] = useState({
    sceneType: '',
    subject: '',
    tone: '',
    cameraView: '',
    style: '',
    lighting: '',
    mood: ''
  });

  const { toast } = useToast();

  // Fetch prompt templates
  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ['/api/prompts/templates', selectedCategory, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        category: selectedCategory,
        ...filters
      });
      const response = await apiRequest('GET', `/api/prompts/templates?${params}`);
      return response.json();
    },
    enabled: isOpen && activeTab === 'categories'
  });

  // Fetch categories and filter options
  const { data: options } = useQuery({
    queryKey: ['/api/prompts/options'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/prompts/options');
      return response.json();
    },
    enabled: isOpen
  });

  // Fetch inspiration feed
  const { data: inspirationFeed } = useQuery({
    queryKey: ['/api/prompts/inspiration'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/prompts/inspiration');
      return response.json();
    },
    enabled: isOpen && activeTab === 'inspiration'
  });

  // Generate guided prompt
  const guidedPromptMutation = useMutation({
    mutationFn: async (options: any) => {
      const response = await apiRequest('POST', '/api/prompts/guided', options);
      return response.json();
    },
    onSuccess: (data) => {
      onSelectPrompt(data.prompt);
      toast({
        title: "Prompt Generated!",
        description: "Your guided prompt has been created and applied."
      });
    }
  });

  // Generate random prompts
  const randomPromptsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/prompts/random');
      return response.json();
    }
  });

  // Remix prompt
  const remixMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const response = await apiRequest('POST', '/api/prompts/remix', { prompt });
      return response.json();
    },
    onSuccess: (data) => {
      onSelectPrompt(data.remixedPrompt);
      toast({
        title: "Prompt Remixed!",
        description: "A creative variation has been generated."
      });
    }
  });

  const handleSelectTemplate = (template: PromptTemplate) => {
    onSelectPrompt(template.prompt);
    toast({
      title: "Prompt Selected!",
      description: `Applied: ${template.title}`
    });
  };

  const handleCustomizePrompt = (originalPrompt: string) => {
    if (Object.keys(customizations).length === 0) {
      onSelectPrompt(originalPrompt);
      return;
    }

    let customized = originalPrompt;
    Object.entries(customizations).forEach(([from, to]) => {
      const regex = new RegExp(from, 'gi');
      customized = customized.replace(regex, to);
    });

    onSelectPrompt(customized);
    toast({
      title: "Prompt Customized!",
      description: "Your customizations have been applied."
    });
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return 'bg-green-100 text-green-800';
      case 'intermediate': return 'bg-yellow-100 text-yellow-800';
      case 'advanced': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-ailldoit-accent" />
            Prompt Selector Tool
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="categories" className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Categories
            </TabsTrigger>
            <TabsTrigger value="inspiration" className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4" />
              Inspiration
            </TabsTrigger>
            <TabsTrigger value="guided" className="flex items-center gap-2">
              <Camera className="w-4 h-4" />
              Guided Builder
            </TabsTrigger>
            <TabsTrigger value="lucky" className="flex items-center gap-2">
              <Shuffle className="w-4 h-4" />
              Feeling Lucky
            </TabsTrigger>
          </TabsList>

          {/* Categories Tab */}
          <TabsContent value="categories" className="mt-4 space-y-4 overflow-y-auto max-h-[60vh]">
            {/* Filters */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <Label className="text-sm font-medium">Category</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {options?.categories?.map((cat: string) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium">Shot Type</Label>
                <Select value={filters.shotType} onValueChange={(val) => setFilters(prev => ({...prev, shotType: val}))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {options?.filterOptions?.shotTypes?.map((type: string) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium">Tone</Label>
                <Select value={filters.tone} onValueChange={(val) => setFilters(prev => ({...prev, tone: val}))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {options?.filterOptions?.tones?.map((tone: string) => (
                      <SelectItem key={tone} value={tone}>{tone}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium">Subject</Label>
                <Select value={filters.subject} onValueChange={(val) => setFilters(prev => ({...prev, subject: val}))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {options?.filterOptions?.subjects?.map((subject: string) => (
                      <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium">Difficulty</Label>
                <Select value={filters.difficulty} onValueChange={(val) => setFilters(prev => ({...prev, difficulty: val}))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Templates Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templatesLoading ? (
                <div className="col-span-2 text-center py-8">Loading templates...</div>
              ) : (
                templates?.map((template: PromptTemplate) => (
                  <Card key={template.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-base flex items-center gap-2">
                            {template.title}
                            <span className={`text-xs px-2 py-1 rounded-full ${getDifficultyColor(template.difficulty)}`}>
                              {template.difficulty}
                            </span>
                          </CardTitle>
                          <p className="text-sm text-gray-500 mt-1">{template.category}</p>
                        </div>
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Star className="w-4 h-4 text-yellow-500" />
                          {template.rating}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-700 mb-3 line-clamp-3">{template.prompt}</p>
                      
                      <div className="flex flex-wrap gap-1 mb-3">
                        {template.tags.slice(0, 4).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          onClick={() => handleSelectTemplate(template)}
                          className="flex-1"
                        >
                          <Copy className="w-4 h-4 mr-1" />
                          Use This
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setCustomizations({ [template.subject.toLowerCase()]: '' });
                          }}
                        >
                          <Edit3 className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Customization Panel */}
                      {Object.keys(customizations).length > 0 && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                          <Label className="text-sm font-medium">Customize:</Label>
                          {Object.keys(customizations).map((key) => (
                            <div key={key} className="flex gap-2 mt-2">
                              <Input
                                placeholder={`Replace "${key}" with...`}
                                value={customizations[key]}
                                onChange={(e) => setCustomizations(prev => ({
                                  ...prev,
                                  [key]: e.target.value
                                }))}
                                className="text-sm"
                              />
                            </div>
                          ))}
                          <Button 
                            size="sm" 
                            className="mt-2"
                            onClick={() => handleCustomizePrompt(template.prompt)}
                          >
                            Apply Custom
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Inspiration Tab */}
          <TabsContent value="inspiration" className="mt-4 space-y-4 overflow-y-auto max-h-[60vh]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {inspirationFeed?.map((item: any) => (
                <Card key={item.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Palette className="w-4 h-4" />
                        {item.category}
                      </span>
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <TrendingUp className="w-4 h-4" />
                        {item.remixCount} remixes
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-700 mb-3">{item.prompt}</p>
                    
                    <div className="flex flex-wrap gap-1 mb-3">
                      {item.tags.map((tag: string) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        onClick={() => onSelectPrompt(item.prompt)}
                        className="flex-1"
                      >
                        <Copy className="w-4 h-4 mr-1" />
                        Use Original
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => remixMutation.mutate(item.prompt)}
                        disabled={remixMutation.isPending}
                      >
                        <RefreshCw className="w-4 h-4" />
                        Remix
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Guided Builder Tab */}
          <TabsContent value="guided" className="mt-4 space-y-4 overflow-y-auto max-h-[60vh]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="w-5 h-5" />
                  Step-by-Step Prompt Builder
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Scene Type</Label>
                    <Select value={guidedOptions.sceneType} onValueChange={(val) => setGuidedOptions(prev => ({...prev, sceneType: val}))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose scene..." />
                      </SelectTrigger>
                      <SelectContent>
                        {options?.guidedOptions?.sceneTypes?.map((type: string) => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Subject</Label>
                    <Select value={guidedOptions.subject} onValueChange={(val) => setGuidedOptions(prev => ({...prev, subject: val}))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose subject..." />
                      </SelectTrigger>
                      <SelectContent>
                        {options?.guidedOptions?.subjects?.map((subject: string) => (
                          <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Tone</Label>
                    <Select value={guidedOptions.tone} onValueChange={(val) => setGuidedOptions(prev => ({...prev, tone: val}))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose tone..." />
                      </SelectTrigger>
                      <SelectContent>
                        {options?.guidedOptions?.tones?.map((tone: string) => (
                          <SelectItem key={tone} value={tone}>{tone}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Camera View</Label>
                    <Select value={guidedOptions.cameraView} onValueChange={(val) => setGuidedOptions(prev => ({...prev, cameraView: val}))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose view..." />
                      </SelectTrigger>
                      <SelectContent>
                        {options?.guidedOptions?.cameraViews?.map((view: string) => (
                          <SelectItem key={view} value={view}>{view}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Style</Label>
                    <Select value={guidedOptions.style} onValueChange={(val) => setGuidedOptions(prev => ({...prev, style: val}))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose style..." />
                      </SelectTrigger>
                      <SelectContent>
                        {options?.guidedOptions?.styles?.map((style: string) => (
                          <SelectItem key={style} value={style}>{style}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Lighting</Label>
                    <Select value={guidedOptions.lighting} onValueChange={(val) => setGuidedOptions(prev => ({...prev, lighting: val}))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose lighting..." />
                      </SelectTrigger>
                      <SelectContent>
                        {options?.guidedOptions?.lighting?.map((light: string) => (
                          <SelectItem key={light} value={light}>{light}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button 
                  onClick={() => guidedPromptMutation.mutate(guidedOptions)}
                  disabled={guidedPromptMutation.isPending || !guidedOptions.sceneType || !guidedOptions.subject}
                  className="w-full"
                  size="lg"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {guidedPromptMutation.isPending ? 'Generating...' : 'Generate Guided Prompt'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Feeling Lucky Tab */}
          <TabsContent value="lucky" className="mt-4 space-y-4 overflow-y-auto max-h-[60vh]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shuffle className="w-5 h-5" />
                  Feeling Lucky Generator
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center mb-6">
                  <Button
                    onClick={() => randomPromptsMutation.mutate()}
                    disabled={randomPromptsMutation.isPending}
                    size="lg"
                    className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                  >
                    <Shuffle className="w-5 h-5 mr-2" />
                    {randomPromptsMutation.isPending ? 'Generating Magic...' : 'Generate Random Prompts'}
                  </Button>
                </div>

                {randomPromptsMutation.data && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {randomPromptsMutation.data.prompts?.map((prompt: PromptTemplate) => (
                      <Card key={prompt.id} className="hover:shadow-md transition-shadow border-2 border-dashed border-purple-200">
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Heart className="w-4 h-4 text-red-500" />
                            {prompt.title}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-gray-700 mb-3">{prompt.prompt}</p>
                          
                          <div className="flex flex-wrap gap-1 mb-3">
                            {prompt.tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>

                          <Button 
                            onClick={() => handleSelectTemplate(prompt)}
                            className="w-full"
                            variant="outline"
                          >
                            <Copy className="w-4 h-4 mr-1" />
                            Use This Lucky Pick
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}