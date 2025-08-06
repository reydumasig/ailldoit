import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Campaign, GeneratedContent, PublishingSettings } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Rocket, 
  Share, 
  Clock, 
  DollarSign, 
  Eye, 
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { 
  SiTiktok, 
  SiInstagram, 
  SiFacebook 
} from "react-icons/si";

export default function Publishing() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const campaignId = location.split("/")[2];
  const [scheduleType, setScheduleType] = useState<'now' | 'scheduled'>('now');
  const [publishingSettings, setPublishingSettings] = useState<PublishingSettings>({
    scheduleType: 'now',
    budget: 500,
    targetAudience: 'Teens 13-19 in Manila',
    duration: '7 days',
    connectedPlatforms: ['tiktok']
  });
  
  const { data: campaign, isLoading } = useQuery<Campaign>({
    queryKey: [`/api/campaigns/${campaignId}`],
    enabled: !!campaignId,
  });

  const publishCampaign = useMutation({
    mutationFn: async (settings: PublishingSettings) => {
      const scheduledDateTime = settings.scheduleType === 'scheduled' 
        ? `${settings.scheduledDate}T${settings.scheduledTime}:00`
        : undefined;

      const response = await apiRequest("POST", `/api/campaigns/${campaignId}/publish`, {
        platforms: settings.connectedPlatforms,
        scheduleType: settings.scheduleType,
        scheduledDateTime
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Content published successfully!",
        description: data.demoNote || "Your content is now live on selected platforms.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/simulations`] });
      setLocation(`/campaign/${campaignId}/results`);
    },
    onError: (error) => {
      toast({
        title: "Publishing failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handlePublish = () => {
    publishCampaign.mutate(publishingSettings);
  };

  const handleBackToReview = () => {
    setLocation(`/campaign/${campaignId}/generate`);
  };

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

  const content = campaign.generatedContent as GeneratedContent;

  return (
    <div className="flex-1 overflow-hidden">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={handleBackToReview}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Review
            </Button>
            <div>
              <h2 className="text-2xl font-bold text-ailldoit-black">Post Content</h2>
              <p className="text-ailldoit-muted">Schedule and post your content across social media platforms</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <Button 
              onClick={handlePublish}
              disabled={publishCampaign.isPending}
              className="bg-ailldoit-accent hover:bg-ailldoit-accent/90 text-white hover:shadow-lg"
            >
              {publishCampaign.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Posting...
                </>
              ) : (
                <>
                  <Share className="w-4 h-4 mr-2" />
                  Post Now
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-8 h-full overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Publishing Options */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Share className="w-5 h-5 mr-3 text-primary" />
                    Platform Selection
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-4 border-2 border-ailldoit-accent bg-ailldoit-accent/5 rounded-xl">
                    <div className="flex items-center space-x-3">
                      <SiTiktok className="text-2xl text-ailldoit-accent" />
                      <div>
                        <h4 className="font-medium text-ailldoit-black">TikTok</h4>
                        <p className="text-sm text-ailldoit-muted">Connected account: @{campaign.platform}_ph</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-success">Connected</span>
                      <CheckCircle className="w-4 h-4 text-success" />
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
                    <div className="flex items-center space-x-3">
                      <SiInstagram className="text-2xl text-muted-foreground" />
                      <div>
                        <h4 className="font-medium text-muted-foreground">Instagram</h4>
                        <p className="text-sm text-muted-foreground">Not connected</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      Connect
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
                    <div className="flex items-center space-x-3">
                      <SiFacebook className="text-2xl text-muted-foreground" />
                      <div>
                        <h4 className="font-medium text-muted-foreground">Facebook</h4>
                        <p className="text-sm text-muted-foreground">Not connected</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      Connect
                    </Button>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Clock className="w-5 h-5 mr-3 text-accent" />
                    Publishing Schedule
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center space-x-4">
                      <input 
                        type="radio" 
                        id="now" 
                        name="schedule" 
                        checked={scheduleType === 'now'}
                        onChange={() => setScheduleType('now')}
                        className="text-primary"
                      />
                      <Label htmlFor="now" className="text-foreground font-medium">Publish Now</Label>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <input 
                        type="radio" 
                        id="schedule" 
                        name="schedule" 
                        checked={scheduleType === 'scheduled'}
                        onChange={() => setScheduleType('scheduled')}
                        className="text-primary"
                      />
                      <Label htmlFor="schedule" className="text-foreground font-medium">Schedule for Later</Label>
                    </div>
                    
                    <div className="ml-6 grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="date" className="text-sm font-medium text-foreground">Date</Label>
                        <Input 
                          id="date"
                          type="date" 
                          disabled={scheduleType === 'now'}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="time" className="text-sm font-medium text-foreground">Time</Label>
                        <Input 
                          id="time"
                          type="time" 
                          disabled={scheduleType === 'now'}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Budget & Targeting Card - Hidden for organic posting focus */}
              {false && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <DollarSign className="w-5 h-5 mr-3 text-warning" />
                      Budget & Targeting
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="budget" className="text-sm font-medium text-foreground">Daily Budget</Label>
                      <div className="flex items-center mt-1">
                        <span className="text-foreground mr-2">₱</span>
                        <Input 
                          id="budget"
                          type="number" 
                          value={publishingSettings.budget}
                          onChange={(e) => setPublishingSettings({
                            ...publishingSettings,
                            budget: parseInt(e.target.value)
                          })}
                          className="flex-1"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <Label htmlFor="audience" className="text-sm font-medium text-foreground">Target Audience</Label>
                      <Select 
                        value={publishingSettings.targetAudience} 
                        onValueChange={(value) => setPublishingSettings({
                          ...publishingSettings,
                          targetAudience: value
                        })}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Teens 13-19 in Manila">Teens 13-19 in Manila</SelectItem>
                          <SelectItem value="Young Adults 18-25 in Metro Manila">Young Adults 18-25 in Metro Manila</SelectItem>
                          <SelectItem value="Students in NCR">Students in NCR</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label htmlFor="duration" className="text-sm font-medium text-foreground">Campaign Duration</Label>
                      <Select 
                        value={publishingSettings.duration} 
                        onValueChange={(value) => setPublishingSettings({
                          ...publishingSettings,
                          duration: value
                        })}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7 days">7 days</SelectItem>
                          <SelectItem value="14 days">14 days</SelectItem>
                          <SelectItem value="30 days">30 days</SelectItem>
                          <SelectItem value="Custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
            
            {/* Publishing Preview */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Eye className="w-5 h-5 mr-3 text-secondary" />
                    Final Preview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-black rounded-2xl p-4 max-w-sm mx-auto">
                    <div className="aspect-[9/16] bg-gradient-to-b from-yellow-200 to-orange-200 rounded-xl relative overflow-hidden">
                      {content?.videoAssets && content.videoAssets.length > 0 ? (
                        <video 
                          src={content.videoAssets[0]} 
                          controls
                          preload="metadata"
                          className="w-full h-full object-cover rounded-xl"
                          muted
                          loop
                          onError={(e) => {
                            console.error('Preview video failed to load:', content.videoAssets?.[0]);
                          }}
                        />
                      ) : content?.imageAssets && content.imageAssets.length > 0 ? (
                        <img 
                          src={content.imageAssets[0]} 
                          alt="Content preview" 
                          className="w-full h-full object-cover rounded-xl"
                          onError={(e) => {
                            console.error('Preview image failed to load:', content.imageAssets?.[0]);
                          }}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center p-4">
                            <Rocket className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">Final Preview</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Generated content will appear here
                            </p>
                          </div>
                        </div>
                      )}
                      
                      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
                        <div className="text-white text-sm">
                          <p className="font-medium mb-2">@{campaign.platform}_ph</p>
                          <p className="text-xs opacity-90">
                            {content?.hook} {content?.hashtags?.slice(0, 2).join(' ')}
                          </p>
                        </div>
                      </div>
                      
                      <div className="absolute top-4 right-4">
                        <Badge className="bg-red-500 text-white">
                          <div className="w-2 h-2 bg-white rounded-full mr-1" />
                          LIVE
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <CheckCircle className="w-5 h-5 mr-3 text-success" />
                    Publishing Checklist
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="w-4 h-4 text-success" />
                    <span className="text-sm text-foreground">Content generated</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="w-4 h-4 text-success" />
                    <span className="text-sm text-foreground">Platform connected</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="w-4 h-4 text-success" />
                    <span className="text-sm text-foreground">Publishing settings configured</span>
                  </div>
                  {/* Budget checklist item - Hidden for organic posting focus */}
                  {false && (
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="w-4 h-4 text-success" />
                      <span className="text-sm text-foreground">Budget configured</span>
                    </div>
                  )}
                  <div className="flex items-center space-x-3">
                    <Clock className="w-4 h-4 text-warning" />
                    <span className="text-sm text-foreground">Ready to post</span>
                  </div>
                  
                  <div className="mt-6 p-4 bg-green-50 rounded-xl">
                    <h4 className="font-medium text-success mb-2">
                      <Share className="w-4 h-4 inline mr-2" />
                      Ready to Post!
                    </h4>
                    <p className="text-sm text-success">
                      Your content will be posted organically to connected platforms within 5 minutes.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
