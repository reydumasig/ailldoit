import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Brain, TrendingUp, Zap, BarChart3 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

export default function TestLearning() {
  const [isRecording, setIsRecording] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const { toast } = useToast();

  // Sample performance data for testing
  const [performanceData, setPerformanceData] = useState({
    campaignId: '4', // Use existing campaign
    contentType: 'hook',
    contentText: 'POV: Your fitness app just called you out for skipping leg day 😅',
    metrics: {
      views: 150000,
      likes: 12000,
      comments: 850,
      shares: 1200,
      clickThroughRate: 8.5,
      engagementRate: 9.2,
      conversionRate: 4.1
    }
  });

  const handleRecordPerformance = async () => {
    setIsRecording(true);
    try {
      await apiRequest(`/api/campaigns/${performanceData.campaignId}/performance`, {
        method: 'POST',
        body: JSON.stringify({
          contentType: performanceData.contentType,
          contentText: performanceData.contentText,
          metrics: performanceData.metrics
        })
      });

      toast({
        title: "Performance Recorded",
        description: "Content performance data has been added to the learning system",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to record performance data",
        variant: "destructive",
      });
    }
    setIsRecording(false);
  };

  const handleLoadAnalytics = async () => {
    setIsLoadingAnalytics(true);
    try {
      const data = await apiRequest('/api/analytics/performance');
      setAnalytics(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load analytics",
        variant: "destructive",
      });
    }
    setIsLoadingAnalytics(false);
  };

  const calculatePerformanceScore = (metrics: any) => {
    const engagementScore = metrics.views > 0 
      ? Math.min(100, ((metrics.likes + metrics.comments + metrics.shares) / metrics.views) * 100)
      : 0;
    const ctrScore = Math.min(100, metrics.clickThroughRate);
    const conversionScore = Math.min(100, metrics.conversionRate);
    
    return Math.round(engagementScore * 0.4 + ctrScore * 0.3 + conversionScore * 0.3);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2">
          <Brain className="w-8 h-8 text-orange-500" />
          <h1 className="text-3xl font-bold text-gray-900">AI Learning System Test</h1>
        </div>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Test how the AI learning system improves content generation by feeding it high-performing content data
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Performance Data Input */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Record Performance Data
            </CardTitle>
            <CardDescription>
              Simulate high-performing content to train the AI system
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="campaign">Campaign ID</Label>
              <Input
                id="campaign"
                value={performanceData.campaignId}
                onChange={(e) => setPerformanceData({ ...performanceData, campaignId: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contentType">Content Type</Label>
              <Select
                value={performanceData.contentType}
                onValueChange={(value) => setPerformanceData({ ...performanceData, contentType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hook">Hook</SelectItem>
                  <SelectItem value="caption">Caption</SelectItem>
                  <SelectItem value="hashtags">Hashtags</SelectItem>
                  <SelectItem value="video_script">Video Script</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Content Text</Label>
              <Textarea
                id="content"
                value={performanceData.contentText}
                onChange={(e) => setPerformanceData({ ...performanceData, contentText: e.target.value })}
                placeholder="Enter the content that performed well..."
                rows={3}
              />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="views">Views</Label>
                <Input
                  id="views"
                  type="number"
                  value={performanceData.metrics.views}
                  onChange={(e) => setPerformanceData({
                    ...performanceData,
                    metrics: { ...performanceData.metrics, views: parseInt(e.target.value) }
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="likes">Likes</Label>
                <Input
                  id="likes"
                  type="number"
                  value={performanceData.metrics.likes}
                  onChange={(e) => setPerformanceData({
                    ...performanceData,
                    metrics: { ...performanceData.metrics, likes: parseInt(e.target.value) }
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="comments">Comments</Label>
                <Input
                  id="comments"
                  type="number"
                  value={performanceData.metrics.comments}
                  onChange={(e) => setPerformanceData({
                    ...performanceData,
                    metrics: { ...performanceData.metrics, comments: parseInt(e.target.value) }
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shares">Shares</Label>
                <Input
                  id="shares"
                  type="number"
                  value={performanceData.metrics.shares}
                  onChange={(e) => setPerformanceData({
                    ...performanceData,
                    metrics: { ...performanceData.metrics, shares: parseInt(e.target.value) }
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ctr">CTR (%)</Label>
                <Input
                  id="ctr"
                  type="number"
                  step="0.1"
                  value={performanceData.metrics.clickThroughRate}
                  onChange={(e) => setPerformanceData({
                    ...performanceData,
                    metrics: { ...performanceData.metrics, clickThroughRate: parseFloat(e.target.value) }
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="engagement">Engagement (%)</Label>
                <Input
                  id="engagement"
                  type="number"
                  step="0.1"
                  value={performanceData.metrics.engagementRate}
                  onChange={(e) => setPerformanceData({
                    ...performanceData,
                    metrics: { ...performanceData.metrics, engagementRate: parseFloat(e.target.value) }
                  })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              <Badge variant="secondary" className="text-lg">
                Score: {calculatePerformanceScore(performanceData.metrics)}/100
              </Badge>
              <Button onClick={handleRecordPerformance} disabled={isRecording}>
                {isRecording ? 'Recording...' : 'Record Performance'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Analytics Display */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Learning Analytics
            </CardTitle>
            <CardDescription>
              View how the AI system is learning from performance data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleLoadAnalytics} disabled={isLoadingAnalytics} className="w-full">
              {isLoadingAnalytics ? 'Loading...' : 'Load Analytics'}
            </Button>

            {analytics && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">{analytics.totalContent}</div>
                    <div className="text-sm text-gray-600">Content Analyzed</div>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">{analytics.avgPerformanceScore}/100</div>
                    <div className="text-sm text-gray-600">Avg Performance</div>
                  </div>
                </div>

                {analytics.topPerformingPlatforms && analytics.topPerformingPlatforms.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Top Performing Platforms</h4>
                    <div className="space-y-2">
                      {analytics.topPerformingPlatforms.map((platform: any, index: number) => (
                        <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                          <span className="capitalize">{platform.platform}</span>
                          <Badge>{platform.avgScore}/100</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analytics.recentPerformance && analytics.recentPerformance.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Recent Performance Data</h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {analytics.recentPerformance.slice(0, 3).map((item: any, index: number) => (
                        <div key={index} className="text-sm p-2 bg-gray-50 rounded">
                          <div className="font-medium">{item.contentType}: {item.performanceScore}/100</div>
                          <div className="text-gray-600 truncate">{item.contentText}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card className="border-orange-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-orange-500" />
            How to Test the Learning System
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <h4 className="font-semibold">1. Record Performance</h4>
              <p className="text-sm text-gray-600">
                Add high-performing content data (score 70+) to train the AI system
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">2. Create Campaign</h4>
              <p className="text-sm text-gray-600">
                Generate new content and see how AI uses learned patterns
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">3. Compare Results</h4>
              <p className="text-sm text-gray-600">
                Enhanced content should reflect successful patterns from training data
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}