import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Instagram, 
  Facebook, 
  Youtube, 
  CheckCircle, 
  ExternalLink,
  X,
  Loader2
} from "lucide-react";
import { FaTiktok } from "react-icons/fa";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { facebookSDK, type FacebookUser, type FacebookPage, type FacebookLoginResponse } from "@/lib/facebook-sdk";
import FacebookLoginButton from "@/components/FacebookLoginButton";

interface ConnectionData {
  platform: string;
  isConnected: boolean;
  connectedAt?: string;
  user?: {
    name?: string;
    username?: string;
    profile_image_url?: string;
  };
  permissions?: string[];
}

export default function OAuthConnectionsEnhanced() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [fbUser, setFbUser] = useState<FacebookUser | null>(null);
  const [fbPages, setFbPages] = useState<FacebookPage[]>([]);
  const [fbLoading, setFbLoading] = useState(false);

  // Fetch user's connected platforms
  const { data: connections, isLoading } = useQuery({
    queryKey: ['/api/auth/connections'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/auth/connections');
      return (response as any).connections as ConnectionData[];
    },
  });

  // Check Facebook login status on component mount
  useEffect(() => {
    const checkFacebookStatus = async () => {
      try {
        const loginStatus = await facebookSDK.getLoginStatus();
        if (loginStatus.status === 'connected') {
          const user = await facebookSDK.getCurrentUser();
          const pages = await facebookSDK.getUserPages();
          setFbUser(user);
          setFbPages(pages);
        }
      } catch (error) {
        console.error('Facebook status check failed:', error);
      }
    };
    
    checkFacebookStatus();
  }, []);

  // Disconnect platform mutation
  const disconnectMutation = useMutation({
    mutationFn: async (platform: string) => {
      if (platform === 'meta' || platform === 'facebook') {
        await facebookSDK.logout();
        setFbUser(null);
        setFbPages([]);
      }
      
      await apiRequest('DELETE', `/api/auth/${platform}/disconnect`);
    },
    onSuccess: (_, platform) => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/connections'] });
      toast({
        title: "Disconnected",
        description: `Successfully disconnected ${platform}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to disconnect platform",
        variant: "destructive",
      });
    },
  });

  const platformConfig = {
    meta: {
      name: "Facebook & Instagram",
      icon: Facebook,
      color: "bg-blue-600",
      description: "Connect to publish on Facebook and Instagram",
      canUseSDK: true
    },
    tiktok: {
      name: "TikTok",
      icon: FaTiktok,
      color: "bg-black",
      description: "Connect to publish videos on TikTok",
      canUseSDK: false
    },
    youtube: {
      name: "YouTube",
      icon: Youtube,
      color: "bg-red-600",
      description: "Connect to publish YouTube Shorts",
      canUseSDK: false
    }
  };

  const handleConnect = async (platform: string, flowType: 'login' | 'publishing' = 'publishing') => {
    console.log(`🔗 Connecting to platform: ${platform} (${flowType} flow)`);
    try {
      // Get OAuth URL from authenticated API endpoint
      console.log(`📞 Making API call to: /api/auth/${platform}/connect`);
      const response = await apiRequest('POST', `/api/auth/${platform}/connect`, { flowType });
      const data = await response.json() as { success: boolean; oauthUrl: string; state: string; platform: string; flowType: string };
      console.log('📋 API Response:', data);
      
      if (data.success && data.oauthUrl) {
        console.log(`🚀 Redirecting to: ${data.oauthUrl} (${data.flowType} flow)`);
        console.log(`📍 Expected callback URI: https://${window.location.host}/auth/${platform}/callback`);
        // Redirect to OAuth URL
        window.location.href = data.oauthUrl;
      } else {
        console.error('❌ OAuth flow failed:', data);
        toast({
          title: "Connection Error",
          description: "Failed to initiate OAuth flow",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('❌ OAuth connect error:', error);
      toast({
        title: "Connection Error",
        description: "Failed to connect to platform",
        variant: "destructive",
      });
    }
  };

  const handleFacebookSDKLogin = async (response: FacebookLoginResponse) => {
    setFbLoading(true);
    try {
      if (response.status === 'connected') {
        const user = await facebookSDK.getCurrentUser();
        const pages = await facebookSDK.getUserPages();
        
        setFbUser(user);
        setFbPages(pages);
        
        toast({
          title: "Connected to Facebook",
          description: `Successfully connected as ${user?.name}`,
        });
        
        // Optionally sync with backend
        queryClient.invalidateQueries({ queryKey: ['/api/auth/connections'] });
      } else {
        toast({
          title: "Connection Failed",
          description: "Unable to connect to Facebook",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Connection Error",
        description: "Failed to connect to Facebook",
        variant: "destructive",
      });
    } finally {
      setFbLoading(false);
    }
  };

  const handleFacebookManualLogin = async () => {
    setFbLoading(true);
    try {
      const response = await facebookSDK.login();
      await handleFacebookSDKLogin(response);
    } catch (error) {
      toast({
        title: "Connection Error",
        description: "Failed to connect to Facebook",
        variant: "destructive",
      });
      setFbLoading(false);
    }
  };

  const handleFacebookLogout = () => {
    setFbUser(null);
    setFbPages([]);
    toast({
      title: "Disconnected",
      description: "Successfully disconnected from Facebook",
    });
  };

  const handleDisconnect = (platform: string) => {
    disconnectMutation.mutate(platform);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-8 bg-muted animate-pulse rounded"></div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Connected Accounts</h1>
        <p className="text-muted-foreground mt-2">
          Connect your social media accounts to publish your campaigns directly
        </p>
      </div>

      <div className="grid gap-4">
        {Object.entries(platformConfig).map(([platform, config]) => {
          const connection = connections?.find(c => c.platform === platform);
          const isConnected = connection?.isConnected || (platform === 'meta' && fbUser);
          const IconComponent = config.icon;

          return (
            <Card key={platform} className="border-2">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${config.color} text-white`}>
                      <IconComponent className="h-6 w-6" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{config.name}</CardTitle>
                      <CardDescription>{config.description}</CardDescription>
                    </div>
                  </div>
                  
                  {isConnected ? (
                    <Badge variant="default" className="bg-green-100 text-green-800">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="outline">Not Connected</Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                {isConnected ? (
                  <div className="space-y-4">
                    {/* Facebook SDK User Info */}
                    {platform === 'meta' && fbUser && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                          {fbUser.picture && (
                            <img 
                              src={fbUser.picture.data.url} 
                              alt="Profile" 
                              className="h-10 w-10 rounded-full object-cover"
                            />
                          )}
                          <div>
                            <p className="font-medium">{fbUser.name}</p>
                            <p className="text-sm text-muted-foreground">{fbUser.email}</p>
                          </div>
                        </div>
                        
                        {/* Facebook Pages */}
                        {fbPages.length > 0 && (
                          <div>
                            <p className="text-sm font-medium mb-2">Connected Pages ({fbPages.length}):</p>
                            <div className="space-y-2">
                              {fbPages.slice(0, 3).map(page => (
                                <div key={page.id} className="flex items-center gap-2 text-sm">
                                  <Badge variant="secondary">{page.category}</Badge>
                                  <span>{page.name}</span>
                                </div>
                              ))}
                              {fbPages.length > 3 && (
                                <p className="text-xs text-muted-foreground">
                                  +{fbPages.length - 3} more pages
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Regular OAuth Connection Info */}
                    {connection && connection.user && (
                      <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                        {connection.user.profile_image_url && (
                          <img 
                            src={connection.user.profile_image_url} 
                            alt="Profile" 
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        )}
                        <div>
                          <p className="font-medium">
                            {connection.user.name || connection.user.username || 'Connected Account'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Connected {new Date(connection.connectedAt!).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Permissions */}
                    {connection?.permissions && connection.permissions.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2">Permissions:</p>
                        <div className="flex flex-wrap gap-1">
                          {connection.permissions.map(permission => (
                            <Badge key={permission} variant="secondary" className="text-xs">
                              {permission}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <Separator />

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleConnect(platform, 'publishing')}
                        className="flex items-center gap-2"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Reconnect
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDisconnect(platform)}
                        disabled={disconnectMutation.isPending}
                        className="flex items-center gap-2 text-red-600 hover:text-red-700"
                      >
                        <X className="h-3 w-3" />
                        Disconnect
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Connect your {config.name} account to start publishing your campaigns.
                    </p>
                    
                    <div className="flex gap-2">
                      {/* Standard OAuth Flow */}
                      <Button 
                        onClick={() => handleConnect(platform, 'publishing')}
                        className="flex-1"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Connect via OAuth
                      </Button>
                      
                      {/* Facebook SDK Alternatives */}
                      {config.canUseSDK && (
                        <div className="flex flex-col gap-2">
                          {/* Official Facebook Login Button */}
                          <div className="w-full">
                            <FacebookLoginButton
                              onLogin={handleFacebookSDKLogin}
                              onLogout={handleFacebookLogout}
                              size="medium"
                              buttonType="continue_with"
                              className="w-full"
                            />
                          </div>
                          
                          {/* Manual SDK Login Button */}
                          <Button 
                            onClick={handleFacebookManualLogin}
                            disabled={fbLoading}
                            variant="outline"
                            size="sm"
                            className="w-full"
                          >
                            {fbLoading ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Facebook className="h-4 w-4 mr-2" />
                            )}
                            Manual SDK Login
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connection Methods</CardTitle>
          <CardDescription>
            Choose the best connection method for your needs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-medium">OAuth Flow:</p>
              <p className="text-muted-foreground">Standard secure authentication through platform's official OAuth system</p>
            </div>
            <div>
              <p className="font-medium">SDK Integration (Facebook only):</p>
              <p className="text-muted-foreground">Direct integration using Facebook JavaScript SDK for enhanced functionality</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}