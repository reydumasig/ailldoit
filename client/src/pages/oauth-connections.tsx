import { useState } from "react";
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
  X
} from "lucide-react";
import { FaTiktok } from "react-icons/fa";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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

export default function OAuthConnections() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch user's connected platforms
  const { data: connections, isLoading } = useQuery({
    queryKey: ['/auth/connections'],
    queryFn: () => apiRequest('/auth/connections').then(res => res.connections as ConnectionData[]),
  });

  // Disconnect platform mutation
  const disconnectMutation = useMutation({
    mutationFn: async (platform: string) => {
      await apiRequest(`/auth/${platform}/disconnect`, {
        method: 'DELETE',
      });
    },
    onSuccess: (_, platform) => {
      queryClient.invalidateQueries({ queryKey: ['/auth/connections'] });
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
      description: "Connect to publish on Facebook and Instagram"
    },
    tiktok: {
      name: "TikTok",
      icon: FaTiktok,
      color: "bg-black",
      description: "Connect to publish videos on TikTok"
    },
    youtube: {
      name: "YouTube",
      icon: Youtube,
      color: "bg-red-600",
      description: "Connect to publish YouTube Shorts"
    }
  };

  const handleConnect = (platform: string) => {
    // Redirect to OAuth flow
    window.location.href = `/auth/${platform}/connect`;
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
          const isConnected = connection?.isConnected || false;
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
                {isConnected && connection ? (
                  <div className="space-y-4">
                    {/* User Info */}
                    {connection.user && (
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
                    {connection.permissions && connection.permissions.length > 0 && (
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
                        onClick={() => handleConnect(platform)}
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
                    <Button 
                      onClick={() => handleConnect(platform)}
                      className="w-full"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Connect {config.name}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Need Help?</CardTitle>
          <CardDescription>
            Learn more about connecting your social media accounts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>• Each platform requires specific permissions for publishing</p>
            <p>• You can disconnect and reconnect accounts at any time</p>
            <p>• Your login credentials are never stored by Ailldoit</p>
            <p>• You maintain full control over your connected accounts</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}