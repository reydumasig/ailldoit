import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Campaign, GeneratedContent, CampaignVariant } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import SubscriptionModal from "@/components/subscription-modal";
import { 
  ArrowLeft, 
  Rocket, 
  Edit3, 
  Image as ImageIcon, 
  TrendingUp, 
  ThumbsUp, 
  TestTubeDiagonal,
  Heart,
  MessageCircle,
  Share,
  Eye,
  Target,
  BarChart3,
  Play,
  Download,
  Copy,
  Package,
  CheckCircle,
  RefreshCw
} from "lucide-react";
import { SiTiktok } from "react-icons/si";

export default function AIGenerator() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [videoError, setVideoError] = useState(false);
  
  const campaignId = location.split("/")[2];
  console.log('🧭 AI Generator - Campaign ID from URL:', campaignId);
  
  // Validate campaign ID
  const isValidCampaignId = campaignId && !isNaN(Number(campaignId)) && campaignId !== 'undefined';
  
  const { data: campaign, isLoading, error } = useQuery<Campaign>({
    queryKey: [`/api/campaigns/${campaignId}`],
    enabled: !!isValidCampaignId,
  });

  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
  const generateContent = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/campaigns/${id}/generate`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Generation failed');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "AI generation started",
        description: "Your campaign content is being generated...",
      });
      // Refetch campaign data periodically to check for updates
      const interval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}`] });
      }, 1000);
      
      // Clear interval after 5 seconds
      setTimeout(() => clearInterval(interval), 5000);
    },
    onError: (error: any) => {
      // Handle insufficient credits specially
      if (error.message.includes('Insufficient credits')) {
        toast({
          title: "Insufficient Credits",
          description: "You need more credits to generate content. Please upgrade your plan.",
          variant: "destructive",
        });
        // Optionally trigger subscription modal
        setShowUpgradeModal(true);
      } else {
        toast({
          title: "Generation failed",
          description: error.message,
          variant: "destructive",
        });
      }
    },
  });

  // Video regeneration mutation
  const regenerateVideo = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/campaigns/${id}/regenerate-video`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Video regeneration failed');
      }
      return response.json();
    },
    onSuccess: () => {
      // Reset video error state when regeneration starts
      setVideoError(false);
      toast({
        title: "Video regeneration started",
        description: "A fresh video is being generated for your campaign...",
      });
      // Refetch campaign data periodically to check for updates
      const interval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}`] });
      }, 2000);
      
      // Clear interval after 10 seconds
      setTimeout(() => clearInterval(interval), 10000);
    },
    onError: (error: any) => {
      if (error.message.includes('Insufficient credits')) {
        toast({
          title: "Insufficient Credits",
          description: "You need more credits to regenerate video. Please upgrade your plan.",
          variant: "destructive",
        });
        setShowUpgradeModal(true);
      } else {
        toast({
          title: "Video regeneration failed",
          description: error.message,
          variant: "destructive",
        });
      }
    },
  });

  // Variant testing functions
  const selectVariant = useMutation({
    mutationFn: async (variantId: string) => {
      const response = await apiRequest("PATCH", `/api/campaigns/${campaignId}/variants`, {
        selectedVariantId: variantId
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Variant selected",
        description: "This variant will be used for your campaign",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}`] });
    },
    onError: (error) => {
      toast({
        title: "Selection failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  console.log('📊 Campaign query result:', { campaign, isLoading, error, isValidCampaignId });
  
  // Handle invalid campaign ID
  if (!isValidCampaignId) {
    console.error('❌ Invalid campaign ID detected:', campaignId);
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">Campaign Not Found</h1>
          <p className="text-gray-600">The campaign ID is invalid or missing.</p>
          <Button onClick={() => setLocation('/')} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }
  
  // Handle campaign not found error
  if (error || (!isLoading && !campaign)) {
    console.error('❌ Campaign not found or error:', error);
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">Campaign Not Found</h1>
          <p className="text-gray-600">This campaign doesn't exist or you don't have access to it.</p>
          <Button onClick={() => setLocation('/')} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const content = campaign?.generatedContent as GeneratedContent;

  // Copy content to clipboard
  const copyToClipboard = async (content: string, type: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast({
        title: "Copied to clipboard",
        description: `${type} has been copied to your clipboard`,
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Unable to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  // Download content as text file
  const downloadAsText = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Download individual asset
  const downloadAsset = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Export entire campaign as ZIP
  const exportCampaign = () => {
    if (campaign) {
      const exportUrl = `/api/campaigns/${campaign.id}/export`;
      window.open(exportUrl, '_blank');
      toast({
        title: "Export started",
        description: "Your campaign assets are being packaged for download",
      });
    }
  };

  // Variant testing functions (moved to top with other hooks)

  const startABTest = () => {
    toast({
      title: "A/B Test Started",
      description: "Your variants are now being tested. Results will be available in 24-48 hours.",
    });
  };

  const editVariant = (variantId: string) => {
    toast({
      title: "Edit Variant",
      description: "Variant editing will open in a modal. Feature coming soon!",
    });
  };

  // Helper function to render video with proper error handling
  const renderVideo = (videoUrl: string, className: string, controls: boolean = true) => {
    console.log('Rendering video with URL:', videoUrl);
    
    // Reset video error when a new video is loaded
    if (videoError) {
      setVideoError(false);
    }
    
    return (
      <video 
        key={videoUrl} // Force re-render when URL changes
        src={videoUrl} 
        controls={controls}
        className={className}
        preload="metadata"
        onError={(e) => {
          console.error('Video failed to load:', videoUrl);
          setVideoError(true);
        }}
        onCanPlay={() => {
          console.log('Video can play:', videoUrl);
          setVideoError(false);
        }}
      />
    );
  };

  // Video expired error component
  const VideoExpiredError = () => (
    <div className="bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-200 rounded-xl flex items-center justify-center h-full">
      <div className="text-center p-4">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <RefreshCw className="w-6 h-6 text-red-600" />
        </div>
        <p className="text-sm text-red-600 font-medium mb-2">Video Expired</p>
        <p className="text-xs text-muted-foreground mb-4">
          The video link has expired and needs to be regenerated
        </p>
        <Button
          data-testid="button-regenerate-video"
          size="sm"
          onClick={() => regenerateVideo.mutate(campaignId)}
          disabled={regenerateVideo.isPending}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          {regenerateVideo.isPending ? (
            <>
              <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin mr-2" />
              Regenerating...
            </>
          ) : (
            <>
              <RefreshCw className="w-3 h-3 mr-2" />
              Regenerate Video
            </>
          )}
        </Button>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading campaign...</p>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Campaign not found</p>
          <Button onClick={() => setLocation("/")} className="mt-4">
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const handleGenerate = () => {
    generateContent.mutate(campaignId);
  };

  const handlePublish = () => {
    setLocation(`/campaign/${campaignId}/publish`);
  };


  const variants = campaign?.variants as CampaignVariant[] || [];

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
              <h2 className="text-2xl font-bold text-ailldoit-black">AI Ad Generator</h2>
              <p className="text-ailldoit-muted">
                {campaign.status === "ready" 
                  ? "Your campaign is ready! Review and customize before publishing."
                  : "Generate AI-powered content for your campaign."}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {campaign.status === "ready" && (
              <>
                <Button 
                  onClick={handleGenerate}
                  disabled={generateContent.isPending}
                  variant="outline"
                  className="border-ailldoit-accent text-ailldoit-accent hover:bg-ailldoit-accent hover:text-white"
                >
                  {generateContent.isPending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-ailldoit-accent border-t-transparent rounded-full animate-spin mr-2" />
                      Regenerating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Regenerate Content
                    </>
                  )}
                </Button>
                <Button 
                  onClick={handlePublish}
                  className="bg-ailldoit-accent hover:bg-ailldoit-accent/90 text-white hover:shadow-lg"
                >
                  <Rocket className="w-4 h-4 mr-2" />
                  Publish Campaign
                </Button>
              </>
            )}
            {campaign.status === "draft" && (
              <Button 
                onClick={handleGenerate}
                disabled={generateContent.isPending}
                className="bg-ailldoit-accent hover:bg-ailldoit-accent/90 text-white hover:shadow-lg"
              >
                {generateContent.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Edit3 className="w-4 h-4 mr-2" />
                    Generate Content
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-8 h-full overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          {campaign.status === "draft" ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Edit3 className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Ready to Generate</h3>
              <p className="text-muted-foreground mb-6">
                Click the button above to start generating AI-powered content for your campaign
              </p>
              <div className="bg-gray-50 rounded-lg p-6 max-w-md mx-auto">
                <p className="text-sm text-muted-foreground mb-2">Campaign Brief:</p>
                <p className="text-foreground font-medium">{campaign.brief}</p>
              </div>
            </div>
          ) : campaign.status === "generating" ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-warning/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <div className="w-8 h-8 border-2 border-warning border-t-transparent rounded-full animate-spin" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Generating Content</h3>
              <p className="text-muted-foreground mb-6">
                AI is creating your campaign content. This usually takes 2-3 minutes...
              </p>
              <div className="bg-gray-50 rounded-lg p-6 max-w-md mx-auto">
                <p className="text-sm text-muted-foreground">
                  • Analyzing your brief<br/>
                  • Generating captions & hooks<br/>
                  • Creating visual concepts<br/>
                  • Optimizing for {campaign.platform}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-6">
                {/* Ad Content */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Edit3 className="w-5 h-5 mr-3 text-primary" />
                        Ad Copy & Caption
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => content?.hook && copyToClipboard(content.hook, "Hook")}
                          disabled={!content?.hook}
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copy Hook
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => content?.caption && downloadAsText(content.caption, "caption.txt")}
                          disabled={!content?.caption}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-foreground">Primary Hook</h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => content?.hook && copyToClipboard(content.hook, "Hook")}
                          disabled={!content?.hook}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="text-foreground text-lg font-medium">{content?.hook}</p>
                    </div>
                    
                    <div className="bg-gray-50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-foreground">Full Caption</h4>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => content?.caption && copyToClipboard(content.caption, "Caption")}
                            disabled={!content?.caption}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => content?.hashtags && copyToClipboard(content.hashtags.join(' '), "Hashtags")}
                            disabled={!content?.hashtags}
                          >
                            <Copy className="w-3 h-3 mr-1" />
                            Tags
                          </Button>
                        </div>
                      </div>
                      <p className="text-foreground leading-relaxed whitespace-pre-line">
                        {content?.caption}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {content?.hashtags?.map((tag, index) => (
                          <Badge key={index} variant="secondary">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Visual Content */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center">
                        <ImageIcon className="w-5 h-5 mr-3 text-accent" />
                        Visual Assets
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => content?.imageAssets && content.imageAssets[0] && downloadAsset(content.imageAssets[0], "image.png")}
                          disabled={!content?.imageAssets || !content.imageAssets[0]}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Image
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => content?.videoAssets?.[0] && downloadAsset(content.videoAssets[0], "video.mp4")}
                          disabled={!content?.videoAssets?.[0]}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Video
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Video Asset */}
                      <div className="aspect-[9/16] bg-gradient-to-b from-yellow-200 to-orange-200 rounded-xl flex items-center justify-center relative overflow-hidden">
                        {videoError && content?.videoAssets && content.videoAssets.length > 0 ? (
                          <VideoExpiredError />
                        ) : content?.videoAssets && content.videoAssets.length > 0 ? 
                          renderVideo(content.videoAssets[0], "w-full h-full object-cover rounded-xl")
                        : campaign.campaignType === 'video' ? (
                          <div className="text-center p-4">
                            <Play className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">AI Video</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Click "Generate Content" to create AI video
                            </p>
                          </div>
                        ) : (
                          <img 
                            src="https://images.unsplash.com/photo-1616391182219-e080b4d1043a?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=600" 
                            alt="Campaign video preview" 
                            className="w-full h-full object-cover rounded-xl"
                          />
                        )}
                        {content?.videoAssets && content.videoAssets.length > 0 && !videoError && (
                          <>
                            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
                            <div className="absolute bottom-4 left-4 right-4 pointer-events-none">
                              <div className="flex items-center space-x-2 text-white">
                                <SiTiktok className="text-2xl" />
                                <span className="font-medium">Generated Video</span>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      
                      <div className="aspect-square bg-gradient-to-br from-green-100 to-yellow-100 rounded-xl flex items-center justify-center relative overflow-hidden">
                        {content?.imageAssets && content.imageAssets.length > 0 ? (
                          <img 
                            src={content.imageAssets[0]} 
                            alt="AI Generated Product Shot" 
                            className="w-full h-full object-cover rounded-xl"
                            onError={(e) => {
                              console.error('Image failed to load:', content.imageAssets?.[0]);
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="text-center">
                            <ImageIcon className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">Product Shot</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Click "Generate Content" to create AI images
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {content?.videoScript && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-xl">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-foreground">Video Script</h4>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const scriptText = content.videoScript?.map((s: any) => `${s.timeframe}: ${s.action}`).join('\n\n');
                                scriptText && copyToClipboard(scriptText, "Video Script");
                              }}
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const scriptText = content.videoScript?.map((s: any) => `${s.timeframe}: ${s.action}`).join('\n\n');
                                scriptText && downloadAsText(scriptText, "video_script.txt");
                              }}
                            >
                              <Download className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          {content.videoScript.map((scene, index) => (
                            <p key={index}>
                              <span className="font-medium">{scene.timeframe}:</span> {scene.action}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Export Actions */}
                {content && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Package className="w-5 h-5 mr-3 text-green-600" />
                        Export & Download
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Button 
                        onClick={exportCampaign}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        <Package className="w-4 h-4 mr-2" />
                        Export All Assets (ZIP)
                      </Button>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const allText = `Hook: ${content.hook}\n\nCaption: ${content.caption}\n\nHashtags: ${content.hashtags?.join(' ')}\n\nScript: ${content.videoScript?.map((s: any) => `${s.timeframe}: ${s.action}`).join('\n\n')}`;
                            copyToClipboard(allText, "All content");
                          }}
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copy All
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => content?.videoAssets && content.videoAssets[0] && downloadAsset(content.videoAssets[0], "campaign_video.mp4")}
                          disabled={!content?.videoAssets || !content.videoAssets[0]}
                        >
                          <Download className="w-3 h-3 mr-1" />
                          Video
                        </Button>
                      </div>
                      
                      <div className="text-xs text-muted-foreground bg-blue-50 p-3 rounded">
                        <p className="font-medium mb-1">📦 ZIP includes:</p>
                        <p>• Text files (hook.txt, caption.txt, hashtags.txt)</p>
                        <p>• Video file (.mp4)</p>
                        <p>• Image files (.png)</p>
                        <p>• Campaign info & script</p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Mobile Preview */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <SiTiktok className="w-5 h-5 mr-3" />
                      TikTok Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-black rounded-2xl p-4 max-w-sm mx-auto">
                      <div className="aspect-[9/16] bg-gradient-to-b from-yellow-200 to-orange-200 rounded-xl relative overflow-hidden">
                        {content?.videoAssets && content.videoAssets.length > 0 ? 
                          renderVideo(content.videoAssets[0], "w-full h-full object-cover rounded-xl")
                        : content?.imageAssets && content.imageAssets.length > 0 ? (
                          <img 
                            src={content.imageAssets[0]} 
                            alt="TikTok preview" 
                            className="w-full h-full object-cover rounded-xl"
                            onError={(e) => {
                              console.error('Preview image failed to load:', content.imageAssets?.[0]);
                            }}
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <div className="text-center p-4">
                              <Play className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                              <p className="text-sm text-muted-foreground">Preview</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Generated content will appear here
                              </p>
                            </div>
                          </div>
                        )}
                        
                        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
                          <div className="text-white text-sm">
                            <p className="font-medium mb-2">@{campaign.platform}_ph</p>
                            <p className="text-xs opacity-90">{content?.hook}</p>
                          </div>
                        </div>
                        
                        <div className="absolute right-4 bottom-20 flex flex-col items-center space-y-4 text-white">
                          <div className="flex flex-col items-center">
                            <Heart className="w-6 h-6 mb-1" />
                            <span className="text-xs">12.3K</span>
                          </div>
                          <div className="flex flex-col items-center">
                            <MessageCircle className="w-6 h-6 mb-1" />
                            <span className="text-xs">892</span>
                          </div>
                          <div className="flex flex-col items-center">
                            <Share className="w-6 h-6 mb-1" />
                            <span className="text-xs">245</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Performance Prediction */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <BarChart3 className="w-5 h-5 mr-3 text-success" />
                      Performance Prediction
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">Estimated Reach</span>
                      <span className="text-sm font-bold text-foreground">85K - 120K</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">Engagement Rate</span>
                      <span className="text-sm font-bold text-success">4.2% - 6.8%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">Expected CTR</span>
                      <span className="text-sm font-bold text-primary">2.1% - 3.5%</span>
                    </div>
                    
                    <div className="mt-4 p-3 bg-green-50 rounded-lg">
                      <p className="text-sm text-success font-medium">
                        <ThumbsUp className="w-4 h-4 inline mr-2" />
                        High potential for viral content
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Variant Testing */}
                {variants && variants.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center">
                          <TestTubeDiagonal className="w-5 h-5 mr-3 text-secondary" />
                          A/B Test Variants
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            // Regenerate variants functionality
                            toast({
                              title: "Regenerating variants",
                              description: "Creating new A/B test variations...",
                            });
                          }}
                        >
                          Regenerate
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Variant Comparison Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {variants.map((variant, index) => (
                          <div 
                            key={variant.id}
                            className={`border-2 rounded-xl p-4 transition-all duration-200 ${
                              variant.selected 
                                ? 'border-green-500 bg-green-50 shadow-md' 
                                : 'border-gray-200 hover:border-gray-300 hover:shadow-sm cursor-pointer'
                            }`}
                            onClick={() => selectVariant.mutate(variant.id)}
                          >
                            {/* Variant Header */}
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center space-x-2">
                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                                  variant.selected 
                                    ? 'bg-green-500 border-green-500' 
                                    : 'border-gray-300'
                                }`}>
                                  {variant.selected && (
                                    <CheckCircle className="w-4 h-4 text-white" />
                                  )}
                                </div>
                                <span className={`font-medium ${
                                  variant.selected ? 'text-green-700' : 'text-foreground'
                                }`}>
                                  {variant.name}
                                </span>
                              </div>
                              <Badge variant={variant.selected ? "default" : "secondary"} className="text-xs">
                                {variant.selected ? 'Selected' : 'Test'}
                              </Badge>
                            </div>

                            {/* Hook Preview */}
                            <div className="mb-3">
                              <h4 className="text-xs font-medium text-muted-foreground mb-1">Hook</h4>
                              <p className="text-sm font-medium text-foreground leading-tight">
                                "{variant.hook}"
                              </p>
                            </div>

                            {/* Caption Preview */}
                            <div className="mb-3">
                              <h4 className="text-xs font-medium text-muted-foreground mb-1">Caption</h4>
                              <p className="text-xs text-muted-foreground line-clamp-3">
                                {variant.caption}
                              </p>
                            </div>

                            {/* Performance Metrics Placeholder */}
                            <div className="border-t pt-3 mt-3">
                              <div className="grid grid-cols-3 gap-2 text-center">
                                <div>
                                  <p className="text-xs font-medium text-green-600">
                                    {variant.selected ? '4.2%' : '--'}
                                  </p>
                                  <p className="text-xs text-muted-foreground">CTR</p>
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-blue-600">
                                    {variant.selected ? '8.7%' : '--'}
                                  </p>
                                  <p className="text-xs text-muted-foreground">Engagement</p>
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-purple-600">
                                    {variant.selected ? '95%' : '--'}
                                  </p>
                                  <p className="text-xs text-muted-foreground">Confidence</p>
                                </div>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2 mt-3">
                              <Button
                                variant={variant.selected ? "default" : "outline"}
                                size="sm"
                                className="flex-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectVariant.mutate(variant.id);
                                }}
                              >
                                {variant.selected ? 'Selected' : 'Choose This'}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  editVariant(variant.id);
                                }}
                              >
                                Edit
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Test Controls */}
                      <div className="border-t pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium text-foreground">A/B Test Status</h4>
                            <p className="text-sm text-muted-foreground">
                              {variants.find(v => v.selected) ? 'Variant selected' : 'Choose variant to test'}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-green-600 border-green-200">
                            Ready to Test
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={startABTest}
                            disabled={!variants || !variants.some(v => v.selected)}
                          >
                            <TrendingUp className="w-4 h-4 mr-2" />
                            Start A/B Test
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              toast({
                                title: "Test analysis",
                                description: "Performance metrics will be available after 48 hours of testing",
                              });
                            }}
                          >
                            <BarChart3 className="w-4 h-4 mr-2" />
                            View Results
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <SubscriptionModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        currentCredits={0}
        onUpgrade={() => {
          setShowUpgradeModal(false);
          queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}`] });
        }}
      />
    </div>
  );
}
