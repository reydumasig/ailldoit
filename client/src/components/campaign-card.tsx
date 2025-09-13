import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Campaign } from "@shared/schema";
import { Link, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  Calendar,
  Globe,
  Edit,
  TrendingUp,
  Clock,
  CheckCircle,
  Play,
  Trash2
} from "lucide-react";
import { 
  SiTiktok, 
  SiInstagram, 
  SiFacebook 
} from "react-icons/si";

interface CampaignCardProps {
  campaign: Campaign;
}

const platformIcons = {
  tiktok: SiTiktok,
  instagram: SiInstagram,
  facebook: SiFacebook,
};

const statusConfig = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-800" },
  generating: { label: "Generating", color: "bg-warning/10 text-warning" },
  ready: { label: "Ready to Post", color: "bg-success/10 text-success" },
  published: { label: "Posted", color: "bg-ailldoit-accent/10 text-ailldoit-accent" },
  active: { label: "Active", color: "bg-ailldoit-accent/10 text-ailldoit-accent" },
};

export default function CampaignCard({ campaign }: CampaignCardProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const PlatformIcon = platformIcons[campaign.platform as keyof typeof platformIcons];
  const status = statusConfig[campaign.status as keyof typeof statusConfig];

  const deleteCampaign = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/campaigns/${campaign.id}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Campaign deleted",
        description: "Your campaign has been permanently deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting campaign",
        description: error.message || "Failed to delete campaign",
        variant: "destructive",
      });
    },
  });

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on buttons
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a')) {
      return;
    }
    
    // Navigate to the appropriate page based on status
    const targetPath = getNavigationPath();
    if (targetPath) {
      setLocation(targetPath);
    }
  };

  const getNavigationPath = () => {
    switch (campaign.status) {
      case 'draft':
        return `/campaign/${campaign.id}/generate`;
      case 'ready':
        return `/campaign/${campaign.id}/generate`;
      case 'published':
      case 'active':
        return `/campaign/${campaign.id}/publish`;
      default:
        return `/campaign/${campaign.id}/generate`;
    }
  };
  
  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  const getActionButton = () => {
    switch (campaign.status) {
      case 'draft':
        return (
          <Link href={`/campaign/${campaign.id}/generate`}>
            <Button size="sm">
              <Play className="w-4 h-4 mr-2" />
              Generate
            </Button>
          </Link>
        );
      case 'generating':
        return (
          <Button size="sm" disabled variant="secondary">
            <Clock className="w-4 h-4 mr-2 animate-spin" />
            Processing...
          </Button>
        );
      case 'ready':
        return (
          <Link href={`/campaign/${campaign.id}/generate`}>
            <Button size="sm">
              View Details
            </Button>
          </Link>
        );
      case 'published':
        return (
          <Link href={`/campaign/${campaign.id}/publish`}>
            <Button size="sm">
              View Details
            </Button>
          </Link>
        );
      case 'active':
        return (
          <Button size="sm" variant="secondary" className="bg-success hover:bg-success/90 text-white">
            <TrendingUp className="w-4 h-4 mr-2" />
            View Analytics
          </Button>
        );
      default:
        return (
          <Link href={`/campaign/${campaign.id}/generate`}>
            <Button size="sm" variant="outline">
              View Details
            </Button>
          </Link>
        );
    }
  };

  return (
    <Card 
      className="hover:shadow-md transition-all cursor-pointer border-gray-100 bg-gradient-to-r from-ailldoit-neutral/30 to-ailldoit-light/30"
      onClick={handleCardClick}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-3">
              <h3 className="text-lg font-semibold text-ailldoit-black">
                {campaign.name}
              </h3>
              <Badge className={status.color}>
                {status.label}
              </Badge>
            </div>
            <p className="text-ailldoit-muted text-sm mb-4">
              {campaign.description}
            </p>
            <div className="flex items-center space-x-6 text-sm">
              <div className="flex items-center space-x-2">
                <PlatformIcon className="w-4 h-4 text-ailldoit-black" />
                <span className="text-ailldoit-muted capitalize">
                  {campaign.platform}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Globe className="w-4 h-4 text-ailldoit-black" />
                <span className="text-ailldoit-muted capitalize">
                  {campaign.language}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-ailldoit-black" />
                <span className="text-ailldoit-muted">
                  Created {getTimeAgo(campaign.createdAt!)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Link href={`/campaign/new?edit=${campaign.id}`}>
              <Button 
                variant="ghost" 
                size="sm"
                className="hover:bg-ailldoit-accent/10 hover:text-ailldoit-accent"
                title="Edit campaign"
              >
                <Edit className="w-4 h-4" />
              </Button>
            </Link>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hover:bg-red-50 hover:text-red-600"
                  title="Delete campaign"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{campaign.name}"? This action cannot be undone and will permanently remove all campaign data and generated content.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteCampaign.mutate()}
                    disabled={deleteCampaign.isPending}
                    className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                  >
                    {deleteCampaign.isPending ? "Deleting..." : "Delete Campaign"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            
            {getActionButton()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
