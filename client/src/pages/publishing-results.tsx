import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Eye, 
  Heart, 
  MessageCircle, 
  Share2, 
  TrendingUp,
  ExternalLink,
  RefreshCw,
  CheckCircle,
  Clock
} from "lucide-react";
import { 
  SiTiktok, 
  SiInstagram, 
  SiFacebook, 
  SiYoutube 
} from "react-icons/si";

const platformIcons = {
  tiktok: SiTiktok,
  instagram: SiInstagram,
  facebook: SiFacebook,
  youtube: SiYoutube,
};

const platformColors = {
  tiktok: "bg-black text-white",
  instagram: "bg-gradient-to-r from-purple-500 to-pink-500 text-white",
  facebook: "bg-blue-600 text-white",
  youtube: "bg-red-600 text-white",
};

export default function PublishingResults() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  const campaignId = location.split("/")[2];

  const { data: simulations, isLoading, refetch } = useQuery({
    queryKey: [`/api/campaigns/${campaignId}/simulations`],
    enabled: !!campaignId,
    refetchInterval: autoRefresh ? 10000 : false, // Auto-refresh every 10 seconds
  });

  const refreshMetrics = useMutation({
    mutationFn: async (simulationId: number) => {
      const response = await apiRequest("POST", `/api/simulations/${simulationId}/update-metrics`);
      return response.json();
    },
    onSuccess: () => {
      refetch();
      toast({
        title: "Metrics updated",
        description: "Engagement metrics have been refreshed",
      });
    },
  });

  useEffect(() => {
    // Auto-disable refresh after 2 minutes to simulate real behavior
    const timer = setTimeout(() => {
      setAutoRefresh(false);
    }, 120000);

    return () => clearTimeout(timer);
  }, []);

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getEngagementRate = (metrics: any): string => {
    if (!metrics) return "0%";
    const total = metrics.views || 1;
    const engagement = (metrics.likes || 0) + (metrics.comments || 0) + (metrics.shares || 0);
    return `${((engagement / total) * 100).toFixed(1)}%`;
  };

  const getPlatformIcon = (platform: string) => {
    const IconComponent = platformIcons[platform as keyof typeof platformIcons];
    return IconComponent ? <IconComponent className="w-5 h-5" /> : null;
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading publishing results...</p>
        </div>
      </div>
    );
  }

  if (!simulations?.length) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">No publishing data found</p>
          <Button onClick={() => setLocation("/")} className="mt-4">
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => setLocation("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <div>
              <h2 className="text-2xl font-bold text-ailldoit-black">Publishing Results</h2>
              <p className="text-ailldoit-muted">Live performance metrics for your campaign</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <Badge variant={autoRefresh ? "default" : "secondary"} className="flex items-center space-x-1">
              {autoRefresh && <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />}
              <span>{autoRefresh ? "Live" : "Static"}</span>
            </Badge>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <div className="p-8 space-y-6">
        {/* Demo Notice */}
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
                <Eye className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-orange-800">MVP Demo Mode</h3>
                <p className="text-sm text-orange-700">
                  This is a simulation for demonstration purposes. Real publishing requires platform API approval from Meta, TikTok, and YouTube.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overall Performance Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5" />
              <span>Overall Performance</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-ailldoit-accent">
                  {formatNumber(simulations.reduce((sum: number, s: any) => sum + (s.metrics?.views || 0), 0))}
                </div>
                <div className="text-sm text-muted-foreground">Total Views</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-ailldoit-accent">
                  {formatNumber(simulations.reduce((sum: number, s: any) => sum + (s.metrics?.likes || 0), 0))}
                </div>
                <div className="text-sm text-muted-foreground">Total Likes</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-ailldoit-accent">
                  {formatNumber(simulations.reduce((sum: number, s: any) => sum + (s.metrics?.shares || 0), 0))}
                </div>
                <div className="text-sm text-muted-foreground">Total Shares</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-ailldoit-accent">
                  {simulations.length}
                </div>
                <div className="text-sm text-muted-foreground">Platforms</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Platform-specific Results */}
        <div className="grid gap-6">
          {simulations.map((simulation: any) => (
            <Card key={simulation.id} className="overflow-hidden">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${platformColors[simulation.platform as keyof typeof platformColors]}`}>
                      {getPlatformIcon(simulation.platform)}
                    </div>
                    <div>
                      <h3 className="font-semibold capitalize">{simulation.platform}</h3>
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <Badge variant={simulation.status === 'published' ? 'default' : 'secondary'} className="text-xs">
                          {simulation.status === 'published' ? (
                            <>
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Published
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3 mr-1" />
                              Scheduled
                            </>
                          )}
                        </Badge>
                        {simulation.publishedAt && (
                          <span>
                            {new Date(simulation.publishedAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refreshMetrics.mutate(simulation.id)}
                      disabled={refreshMetrics.isPending || simulation.status !== 'published'}
                    >
                      <RefreshCw className={`w-4 h-4 mr-1 ${refreshMetrics.isPending ? 'animate-spin' : ''}`} />
                      Update
                    </Button>
                    {simulation.simulationData?.permalink && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={simulation.simulationData.permalink} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-4 h-4 mr-1" />
                          View
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              {simulation.status === 'published' && simulation.metrics && (
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                      <Eye className="w-5 h-5 text-blue-500" />
                      <div>
                        <div className="font-semibold">{formatNumber(simulation.metrics.views)}</div>
                        <div className="text-xs text-muted-foreground">Views</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                      <Heart className="w-5 h-5 text-red-500" />
                      <div>
                        <div className="font-semibold">{formatNumber(simulation.metrics.likes)}</div>
                        <div className="text-xs text-muted-foreground">Likes</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                      <MessageCircle className="w-5 h-5 text-green-500" />
                      <div>
                        <div className="font-semibold">{formatNumber(simulation.metrics.comments)}</div>
                        <div className="text-xs text-muted-foreground">Comments</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                      <Share2 className="w-5 h-5 text-purple-500" />
                      <div>
                        <div className="font-semibold">{formatNumber(simulation.metrics.shares)}</div>
                        <div className="text-xs text-muted-foreground">Shares</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Engagement Rate</span>
                      <span className="font-semibold">{getEngagementRate(simulation.metrics)}</span>
                    </div>
                    <Progress 
                      value={parseFloat(getEngagementRate(simulation.metrics))} 
                      className="h-2"
                    />
                  </div>

                  {/* Platform-specific metrics */}
                  {simulation.platform === 'tiktok' && simulation.metrics.completion_rate && (
                    <div className="mt-4 p-3 bg-black/5 rounded-lg">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Completion Rate</span>
                        <span className="font-semibold">{(parseFloat(simulation.metrics.completion_rate) * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  )}

                  {simulation.platform === 'youtube' && simulation.metrics.averageViewDuration && (
                    <div className="mt-4 p-3 bg-red-50 rounded-lg">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Avg. View Duration</span>
                        <span className="font-semibold">{Math.floor(simulation.metrics.averageViewDuration / 60)}:{(simulation.metrics.averageViewDuration % 60).toString().padStart(2, '0')}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              )}

              {simulation.status === 'scheduled' && (
                <CardContent className="pt-0">
                  <div className="p-4 bg-blue-50 rounded-lg text-center">
                    <Clock className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                    <p className="text-sm text-blue-700">
                      Scheduled for {new Date(simulation.scheduledFor).toLocaleString()}
                    </p>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}