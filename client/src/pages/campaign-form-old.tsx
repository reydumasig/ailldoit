import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { insertCampaignSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Wand2, Video, Image as ImageIcon, Lightbulb, Sparkles } from "lucide-react";
import BriefTemplateSelector from "@/components/BriefTemplateSelector";
import PromptSelectorTool from "@/components/PromptSelectorTool";
import { LinkedPromptSuggestions } from "@/components/LinkedPromptSuggestions";
import { 
  SiTiktok, 
  SiInstagram, 
  SiFacebook 
} from "react-icons/si";
import { cn } from "@/lib/utils";

const platforms = [
  { id: "tiktok", name: "TikTok", icon: SiTiktok },
  { id: "instagram", name: "Instagram", icon: SiInstagram },
  { id: "facebook", name: "Facebook", icon: SiFacebook },
];

const languages = [
  { id: "tagalog", name: "Tagalog (Philippines)" },
  { id: "indonesian", name: "Bahasa Indonesia (Indonesia)" },
  { id: "thai", name: "Thai (Thailand)" },
  { id: "vietnamese", name: "Vietnamese (Vietnam)" },
  { id: "malay", name: "Malay (Malaysia)" },
  { id: "english", name: "English (Global)" },
];

const campaignTypes = [
  { id: "video", name: "Video Content", icon: Video },
  { id: "image", name: "Image Content", icon: ImageIcon },
];

export default function CampaignForm() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPlatform, setSelectedPlatform] = useState("tiktok");
  const [selectedCampaignType, setSelectedCampaignType] = useState("video");
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showPromptSelector, setShowPromptSelector] = useState(false);

  const form = useForm({
    resolver: zodResolver(insertCampaignSchema.omit({ userId: true })),
    defaultValues: {
      name: "",
      description: "",
      platform: "tiktok",
      language: "tagalog",
      brief: "",
      campaignType: "video",
      status: "draft",
      generatedContent: null,
      variants: null,
      publishingSettings: null,
    },
  });

  const createCampaign = useMutation({
    mutationFn: async (data: any) => {
      console.log('📡 Making API request to create campaign...');
      try {
        const response = await apiRequest("POST", "/api/campaigns", data);
        console.log('✅ Campaign API response received:', response.status);
        return response.json();
      } catch (error) {
        console.error('❌ Campaign API error:', error);
        throw error;
      }
    },
    onSuccess: (campaign) => {
      console.log('🎉 Campaign created successfully:', campaign);
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "Campaign created successfully",
        description: "Your campaign has been created and is ready for content generation.",
      });
      setLocation(`/campaign/${campaign.id}/generate`);
    },
    onError: (error) => {
      console.error('❌ Campaign creation failed:', error);
      toast({
        title: "Error creating campaign",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handlePromptSelect = (prompt: string) => {
    form.setValue("brief", prompt);
    toast({
      title: "Visual Prompt Applied",
      description: "The selected prompt has been applied to your campaign brief.",
    });
  };

  const handleTemplateSelect = ({ brief }: { brief: string }) => {
    form.setValue("brief", brief);
    setShowTemplateSelector(false);
    toast({
      title: "Template Applied",
      description: "The selected template has been applied to your campaign.",
    });
  };

  const onSubmit = (data: any) => {
    console.log('🚀 Form submitted with data:', data);
    console.log('📊 Form validation errors:', form.formState.errors);
    
    const campaignData = {
      ...data,
      platform: selectedPlatform,
      campaignType: selectedCampaignType,
      name: data.name || `${selectedPlatform} Campaign`,
      description: data.description || `${data.brief} - ${selectedPlatform} campaign`,
    };
    
    console.log('📤 Sending campaign data:', campaignData);
    createCampaign.mutate(campaignData);
  };

  const generatePreview = () => {
    const brief = form.watch("brief");
    const platform = selectedPlatform;
    const language = form.watch("language");
    
    if (!brief || brief.trim().length < 10) {
      return {
        hook: "Start typing your product brief to see AI preview...",
        hashtags: "#YourProduct #AI #SocialMedia",
        concept: "AI will generate platform-specific content based on your brief"
      };
    }

    // Extract key product details from brief
    const briefLower = brief.toLowerCase();
    const productKeywords = [];
    const locationKeywords = [];
    
    // Common product types
    if (briefLower.includes('soap')) productKeywords.push('Soap');
    if (briefLower.includes('coffee')) productKeywords.push('Coffee');
    if (briefLower.includes('food')) productKeywords.push('Food');
    if (briefLower.includes('skincare')) productKeywords.push('Skincare');
    if (briefLower.includes('fashion')) productKeywords.push('Fashion');
    if (briefLower.includes('tech')) productKeywords.push('Tech');
    
    // SEA locations
    if (briefLower.includes('manila') || briefLower.includes('philippines')) locationKeywords.push('Manila', 'PH');
    if (briefLower.includes('jakarta') || briefLower.includes('indonesia')) locationKeywords.push('Jakarta', 'ID');
    if (briefLower.includes('bangkok') || briefLower.includes('thailand')) locationKeywords.push('Bangkok', 'TH');
    if (briefLower.includes('singapore')) locationKeywords.push('Singapore', 'SG');
    if (briefLower.includes('malaysia')) locationKeywords.push('Malaysia', 'MY');

    // Generate dynamic hashtags
    const baseHashtags = productKeywords.concat(locationKeywords);
    const platformHashtags = platform === 'tiktok' ? ['TikTokMadeMeBuyIt', 'FYP'] : 
                           platform === 'instagram' ? ['InstaGood', 'Explore'] : ['FacebookAds', 'Viral'];
    
    const hashtags = baseHashtags.concat(platformHashtags).slice(0, 6)
      .map(tag => `#${tag.replace(/\s+/g, '')}`).join(' ');

    // Generate platform-specific hook preview
    const platformHooks = {
      tiktok: language === 'tagalog' ? `Grabe! ${brief.split(' ').slice(0, 3).join(' ')} na 'to! ✨` :
              language === 'indonesian' ? `Wah! ${brief.split(' ').slice(0, 3).join(' ')} ini amazing! ✨` :
              `OMG! This ${brief.split(' ').slice(0, 3).join(' ')} is incredible! ✨`,
      instagram: `Ready to discover ${brief.split(' ').slice(0, 4).join(' ')}? 📸✨`,
      facebook: `Here's why everyone's talking about ${brief.split(' ').slice(0, 4).join(' ')}! 🔥`
    };

    const platformConcepts = {
      tiktok: `15-second vertical video showcasing ${brief.split(' ').slice(0, 3).join(' ')} with trending audio`,
      instagram: `Aesthetic carousel post featuring ${brief.split(' ').slice(0, 3).join(' ')} with lifestyle shots`,
      facebook: `Engaging video content highlighting ${brief.split(' ').slice(0, 3).join(' ')} benefits for your audience`
    };

    return {
      hook: platformHooks[platform as keyof typeof platformHooks] || platformHooks.tiktok,
      hashtags: hashtags || "#YourProduct #AI #Viral",
      concept: platformConcepts[platform as keyof typeof platformConcepts] || platformConcepts.tiktok
    };
  };

  const preview = generatePreview();



  return (
    <div className="flex-1 overflow-hidden">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => setLocation("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <div>
              <h2 className="text-2xl font-bold text-ailldoit-black">Create New Campaign</h2>
              <p className="text-ailldoit-muted">Turn your product brief into viral social media content</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-8 h-full overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column - Form */}
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Campaign Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Campaign Name</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Mango Soap TikTok Campaign" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="brief"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Product Brief</FormLabel>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setShowTemplateSelector(true)}
                                  className="text-ailldoit-accent border-ailldoit-accent hover:bg-ailldoit-accent/10"
                                >
                                  <Sparkles className="w-4 h-4 mr-1" />
                                  AI Templates
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setShowPromptSelector(true)}
                                  className="text-purple-600 border-purple-500 hover:bg-purple-50"
                                >
                                  <Wand2 className="w-4 h-4 mr-1" />
                                  Prompt Selector
                                </Button>
                              </div>
                            </div>
                            <FormControl>
                              <Textarea 
                                placeholder="Describe your product, target audience, and campaign goals... Or click 'AI Templates' for smart suggestions!"
                                className="h-32 resize-none"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Platform Selection</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-3">
                        {platforms.map((platform) => {
                          const Icon = platform.icon;
                          return (
                            <button
                              key={platform.id}
                              type="button"
                              onClick={() => setSelectedPlatform(platform.id)}
                              className={cn(
                                "flex flex-col items-center p-4 border-2 rounded-xl hover:bg-opacity-20 transition-all",
                                selectedPlatform === platform.id 
                                  ? "border-ailldoit-accent bg-ailldoit-accent/10 text-ailldoit-accent" 
                                  : "border-gray-200 text-ailldoit-muted hover:border-gray-300"
                              )}
                            >
                              <Icon className="text-2xl mb-2" />
                              <span className="text-sm font-medium">{platform.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Campaign Settings</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="language"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Language & Market</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select language..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {languages.map((lang) => (
                                  <SelectItem key={lang.id} value={lang.id}>
                                    {lang.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div>
                        <FormLabel>Campaign Type</FormLabel>
                        <div className="grid grid-cols-2 gap-3 mt-2">
                          {campaignTypes.map((type) => {
                            const Icon = type.icon;
                            return (
                              <button
                                key={type.id}
                                type="button"
                                onClick={() => setSelectedCampaignType(type.id)}
                                className={cn(
                                  "flex items-center p-4 border-2 rounded-xl hover:bg-opacity-20 transition-all",
                                  selectedCampaignType === type.id 
                                    ? "border-ailldoit-accent bg-ailldoit-accent/10 text-ailldoit-accent" 
                                    : "border-gray-200 text-ailldoit-muted hover:border-gray-300"
                                )}
                              >
                                <Icon className="w-5 h-5 mr-3" />
                                <span className="text-sm font-medium">{type.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Button 
                    type="submit" 
                    className="w-full bg-ailldoit-accent hover:bg-ailldoit-accent/90 text-white hover:shadow-lg"
                    disabled={createCampaign.isPending}
                    onClick={(e) => {
                      console.log('🖱️ Create Campaign button clicked');
                      console.log('📋 Form valid:', form.formState.isValid);
                      console.log('❌ Form errors:', form.formState.errors);
                      console.log('📝 Current form values:', form.getValues());
                    }}
                  >
                    {createCampaign.isPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Creating Campaign...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4 mr-2" />
                        Create Campaign
                      </>
                    )}
                  </Button>
                </div>

                {/* Right Column - Preview & Suggestions */}
                <div className="space-y-6">
                  {/* Linked Prompt Suggestions */}
                  <LinkedPromptSuggestions
                    brief={form.watch("brief")}
                    platform={selectedPlatform}
                    language={form.watch("language")}
                    onSelectPrompt={handlePromptSelect}
                    isVisible={!!form.watch("brief") && form.watch("brief").length > 20}
                  />

                  {/* AI Preview */}
                  <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
                      <Lightbulb className="w-5 h-5 mr-2" />
                      AI Preview
                    </h3>
                  
                  <div className="space-y-4">
                    {preview ? (
                      <>
                        <Card className="border-gray-200">
                          <CardContent className="p-4">
                            <div className="flex items-center space-x-2 mb-2">
                              <Wand2 className="w-4 h-4 text-primary" />
                              <span className="text-sm font-medium text-foreground">Generated Hook</span>
                            </div>
                            <p className="text-sm text-muted-foreground italic">"{preview.hook}"</p>
                          </CardContent>
                        </Card>
                        
                        <Card className="border-gray-200">
                          <CardContent className="p-4">
                            <div className="flex items-center space-x-2 mb-2">
                              <span className="text-sm font-medium text-foreground"># Hashtags</span>
                            </div>
                            <p className="text-sm text-muted-foreground">{preview.hashtags}</p>
                          </CardContent>
                        </Card>
                        
                        <Card className="border-gray-200">
                          <CardContent className="p-4">
                            <div className="flex items-center space-x-2 mb-2">
                              <Video className="w-4 h-4 text-success" />
                              <span className="text-sm font-medium text-foreground">Video Concept</span>
                            </div>
                            <p className="text-sm text-muted-foreground">{preview.concept}</p>
                          </CardContent>
                        </Card>
                      </>
                    ) : (
                      <div className="bg-gray-100 rounded-lg p-4 text-center">
                        <Lightbulb className="w-8 h-8 text-warning mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                          Fill in your product brief to see AI preview
                        </p>
                      </div>
                    )}
                  </div>  
                </div>
              </div>
            </form>
          </Form>
        </div>
      </main>

      {/* Brief Template Selector Modal */}
      <BriefTemplateSelector
        platform={selectedPlatform}
        language={form.watch("language")}
        onSelectTemplate={handleTemplateSelect}
        isOpen={showTemplateSelector}
        onClose={() => setShowTemplateSelector(false)}
      />

      {/* Prompt Selector Tool Modal */}
      <PromptSelectorTool
        isOpen={showPromptSelector}
        onClose={() => setShowPromptSelector(false)}
        onSelectPrompt={handlePromptSelect}
        currentPrompt={form.watch("brief")}
      />
    </div>
  );
}
