import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
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
import { z } from "zod";
import { ArrowLeft, Wand2, Video, Image as ImageIcon, Lightbulb, Sparkles, Upload, X } from "lucide-react";
import BriefTemplateSelector from "@/components/BriefTemplateSelector";
import PromptSelectorTool from "@/components/PromptSelectorTool";
import { LinkedPromptSuggestions } from "@/components/LinkedPromptSuggestions";
import { ObjectUploader } from "@/components/ObjectUploader";
import type { UploadResult } from "@uppy/core";
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
  const [referenceImage, setReferenceImage] = useState<{ url: string; name: string } | null>(null);
  const [uploadingReference, setUploadingReference] = useState(false);

  // Get edit campaign ID from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const editCampaignId = urlParams.get('edit');
  const isEditing = !!editCampaignId;

  // Fetch existing campaign data if editing
  const { data: existingCampaign } = useQuery({
    queryKey: ["/api/campaigns", editCampaignId],
    enabled: isEditing && !!editCampaignId,
  });

  const form = useForm({
    resolver: zodResolver(insertCampaignSchema.omit({ userId: true }).extend({
      description: z.string().optional(), // Make description optional in form validation
    })),
    defaultValues: {
      name: "",
      brief: "",
      description: "",
      language: "english",
      platform: "tiktok",
      campaignType: "video",
      status: "draft",
      referenceImageUrl: "",
      generatedContent: null,
      variants: null,
      publishingSettings: null,
    },
  });

  // Update form when existing campaign data loads
  useEffect(() => {
    if (existingCampaign && isEditing) {
      console.log('📝 Loading existing campaign for editing:', existingCampaign);
      // Only load essential fields to prevent large payload issues
      form.reset({
        name: (existingCampaign as any).name || "",
        brief: (existingCampaign as any).brief || "",
        description: (existingCampaign as any).description || "",
        language: (existingCampaign as any).language || "english",
        platform: (existingCampaign as any).platform || "tiktok",
        campaignType: (existingCampaign as any).campaignType || "video",
        status: (existingCampaign as any).status || "draft",
        referenceImageUrl: (existingCampaign as any).referenceImageUrl || "",
        // Don't load large fields that cause payload issues
        generatedContent: null,
        variants: null,
        publishingSettings: null,
      });
      setSelectedPlatform((existingCampaign as any).platform || "tiktok");
      setSelectedCampaignType((existingCampaign as any).campaignType || "video");
    }
  }, [existingCampaign, isEditing, form]);

  const createCampaign = useMutation({
    mutationFn: async (data: any) => {
      if (isEditing && editCampaignId) {
        console.log('📡 Making API request to update campaign...', editCampaignId);
        const response = await apiRequest("PATCH", `/api/campaigns/${editCampaignId}`, data);
        const responseData = await response.json();
        console.log('📦 Campaign update response data:', responseData);
        return responseData;
      } else {
        console.log('📡 Making API request to create campaign...');
        const response = await apiRequest("POST", "/api/campaigns", data);
        const responseData = await response.json();
        console.log('📦 Campaign response data:', responseData);
        return responseData;
      }
    },
    onSuccess: (campaign) => {
      console.log(`🎉 Campaign ${isEditing ? 'updated' : 'created'} successfully:`, campaign);
      console.log('🆔 Campaign ID:', campaign.id);
      
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      if (isEditing) {
        queryClient.invalidateQueries({ queryKey: ["/api/campaigns", editCampaignId] });
      }
      
      toast({
        title: `Campaign ${isEditing ? 'updated' : 'created'} successfully`,
        description: `Your campaign has been ${isEditing ? 'updated' : 'created'} and is ready for content generation.`,
      });
      
      // Navigate to generation page with the campaign ID
      const campaignId = isEditing ? editCampaignId : campaign.id;
      if (campaignId) {
        const targetUrl = `/campaign/${campaignId}/generate`;
        console.log('🧭 Navigating to:', targetUrl);
        setLocation(targetUrl);
      } else {
        console.error('❌ No valid campaign ID available');
        setLocation('/');
      }
    },
    onError: (error: any) => {
      console.error(`❌ Campaign ${isEditing ? 'update' : 'creation'} failed:`, error);
      toast({
        title: `Error ${isEditing ? 'updating' : 'creating'} campaign`,
        description: error.message || `Failed to ${isEditing ? 'update' : 'create'} campaign`,
        variant: "destructive",
      });
    },
  });

  const handlePromptSelect = (prompt: string) => {
    console.log('🎨 Visual prompt selected:', prompt);
    form.setValue("brief", prompt);
    toast({
      title: "Visual Prompt Applied",
      description: "The selected prompt has been applied to your campaign brief.",
    });
    // IMPORTANT: Only update form field, do NOT trigger navigation
    console.log('✅ Form field updated, waiting for user to click Create Campaign');
  };

  const handleTemplateSelect = (prompt: string) => {
    form.setValue("brief", prompt);
    setShowTemplateSelector(false);
    toast({
      title: "Template Applied",
      description: "The selected template has been applied to your campaign.",
    });
  };

  const handleGetUploadParameters = async () => {
    const response = await apiRequest("POST", "/api/objects/upload");
    const data = await response.json();
    return {
      method: "PUT" as const,
      url: data.uploadURL,
    };
  };

  const handleUploadComplete = async (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    if (result.successful && result.successful[0]) {
      setUploadingReference(true);
      const uploadedFile = result.successful[0];
      const uploadURL = uploadedFile.uploadURL as string;
      const fileName = uploadedFile.name;

      try {
        // If this is an edit, update the existing campaign with reference image
        if (isEditing && editCampaignId) {
          const response = await apiRequest("PUT", `/api/campaigns/${editCampaignId}/reference-image`, {
            referenceImageURL: uploadURL,
          });
          const data = await response.json();
          
          setReferenceImage({
            url: data.objectPath,
            name: fileName,
          });
          
          toast({
            title: "Reference Image Uploaded",
            description: "Your reference image has been uploaded and linked to this campaign.",
          });
        } else {
          // For new campaigns, store the reference and set form value
          setReferenceImage({
            url: uploadURL,
            name: fileName,
          });
          
          // Set the form value to include in campaign submission
          form.setValue("referenceImageUrl", uploadURL);
          
          toast({
            title: "Reference Image Ready",
            description: "Your reference image will be linked when the campaign is created.",
          });
        }
      } catch (error) {
        console.error("Error setting reference image:", error);
        toast({
          title: "Upload Error",
          description: "Failed to link reference image to campaign.",
          variant: "destructive",
        });
      } finally {
        setUploadingReference(false);
      }
    }
  };

  const removeReferenceImage = () => {
    setReferenceImage(null);
    form.setValue("referenceImageUrl", "");
    toast({
      title: "Reference Image Removed", 
      description: "The reference image has been removed from this campaign.",
    });
  };

  const onSubmit = (data: any) => {
    console.log('🚀 Form submitted with data:', data);
    console.log('📊 Form state:', form.formState);
    console.log('🚨 Form errors:', form.formState.errors);
    
    // Clean up the data to avoid large payloads - only send essential fields
    const campaignData = {
      name: data.name || `${selectedPlatform} Campaign`,
      brief: data.brief,
      description: data.description || `${data.name || selectedPlatform + ' Campaign'} - ${selectedPlatform} campaign`,
      language: data.language || "english",
      platform: selectedPlatform,
      campaignType: selectedCampaignType,
      status: data.status || "draft",
      referenceImageUrl: data.referenceImageUrl || null,
      // Don't send heavy data like generatedContent, variants, etc. in updates
    };
    
    console.log('📤 Sending optimized campaign data:', campaignData);
    console.log('📊 Payload size estimate:', JSON.stringify(campaignData).length, 'characters');
    createCampaign.mutate(campaignData);
  };

  const handleSubmitClick = (e: React.MouseEvent) => {
    console.log('🖱️ CREATE CAMPAIGN BUTTON CLICKED - This should be the ONLY trigger for campaign creation');
    e.preventDefault();
    
    // Check form validity
    const formData = form.getValues();
    console.log('📋 Current form values:', formData);
    console.log('🔍 Form errors:', form.formState.errors);
    
    // Only proceed if we have a valid brief
    if (!formData.brief || formData.brief.trim().length < 10) {
      toast({
        title: "Brief Required",
        description: "Please enter a product brief of at least 10 characters",
        variant: "destructive",
      });
      return;
    }
    
    console.log('🚀 Form validation passed, triggering campaign creation...');
    // Manually trigger form submission
    form.handleSubmit(onSubmit)(e);
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

    // Generate platform-specific preview
    const platformHooks = {
      tiktok: language === 'tagalog' ? `Grabe! ${brief.split(' ').slice(0, 3).join(' ')} na 'to! ✨` :
              language === 'indonesian' ? `Wah! ${brief.split(' ').slice(0, 3).join(' ')} ini amazing! ✨` :
              `OMG! This ${brief.split(' ').slice(0, 3).join(' ')} is incredible! ✨`,
      instagram: `Ready to discover ${brief.split(' ').slice(0, 4).join(' ')}? 📸✨`,
      facebook: `Here's why everyone's talking about ${brief.split(' ').slice(0, 4).join(' ')}! 🔥`
    };

    return {
      hook: platformHooks[platform as keyof typeof platformHooks] || platformHooks.tiktok,
      hashtags: "#Product #Viral #SEA #SocialMedia",
      concept: `${platform} content showcasing your product with engaging visuals`
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
              <h2 className="text-2xl font-bold text-ailldoit-black">
                {isEditing ? "Edit Campaign" : "Create New Campaign"}
              </h2>
              <p className="text-ailldoit-muted">
                {isEditing ? "Update your campaign brief and regenerate content" : "Turn your product brief into viral social media content"}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-8 h-full overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <Form {...form}>
            <form onSubmit={(e) => {
              console.log('🛑 Form submit event triggered - preventing default!');
              e.preventDefault();
              e.stopPropagation();
              return false;
            }} className="space-y-8">
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
                              <Input 
                                placeholder="e.g., Mango Soap TikTok Campaign" 
                                {...field}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    console.log('⌨️ Enter key pressed in name field - preventing form submission');
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }
                                }}
                              />
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
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                    console.log('⌨️ Ctrl+Enter detected - NOT submitting form automatically');
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Campaign Description (Optional)</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Brief campaign description..."
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

                  {/* Reference Image Upload - Optional */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Upload className="w-5 h-5 mr-2" />
                        Reference Materials (Optional)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-ailldoit-muted mb-4">
                        Upload logos, Canva templates, or brand assets to guide AI content generation
                      </p>
                      
                      {referenceImage ? (
                        <div className="border-2 border-dashed border-ailldoit-accent/30 rounded-xl p-4 bg-ailldoit-accent/5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="w-12 h-12 bg-ailldoit-accent/10 rounded-lg flex items-center justify-center">
                                <ImageIcon className="w-6 h-6 text-ailldoit-accent" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground" data-testid="text-reference-name">
                                  {referenceImage.name}
                                </p>
                                <p className="text-xs text-ailldoit-muted">
                                  Reference image uploaded
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={removeReferenceImage}
                              className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
                              data-testid="button-remove-reference"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <ObjectUploader
                          maxNumberOfFiles={1}
                          maxFileSize={10485760} // 10MB
                          onGetUploadParameters={handleGetUploadParameters}
                          onComplete={handleUploadComplete}
                          buttonClassName="w-full border-2 border-dashed border-gray-300 hover:border-ailldoit-accent/50 bg-gray-50 hover:bg-ailldoit-accent/5 text-ailldoit-muted hover:text-ailldoit-accent transition-all"
                        >
                          <div className="flex flex-col items-center py-6">
                            <Upload className="w-8 h-8 mb-2" />
                            <span className="text-sm font-medium">Upload Reference Image</span>
                            <span className="text-xs mt-1">PNG, JPG, PDF, SVG, EPS up to 10MB</span>
                          </div>
                        </ObjectUploader>
                      )}
                      
                      {uploadingReference && (
                        <div className="mt-3 flex items-center justify-center text-sm text-ailldoit-muted">
                          <div className="w-4 h-4 border-2 border-ailldoit-accent border-t-transparent rounded-full animate-spin mr-2" />
                          Processing reference image...
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Button 
                    onClick={handleSubmitClick}
                    className="w-full bg-ailldoit-accent hover:bg-ailldoit-accent/90 text-white hover:shadow-lg"
                    disabled={createCampaign.isPending}
                  >
                    {createCampaign.isPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        {isEditing ? "Updating Campaign..." : "Creating Campaign..."}
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4 mr-2" />
                        {isEditing ? "Update Campaign" : "Create Campaign"}
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
                      {preview && preview.hook !== "Start typing your product brief to see AI preview..." ? (
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