import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap, Crown, Building, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import SubscriptionModal from './subscription-modal';

interface CreditsDisplayProps {
  className?: string;
  showUpgradePrompt?: boolean;
}

interface UserSubscription {
  plan: {
    id: string;
    name: string;
    price: number;
    credits: number;
    features: string[];
  };
  creditsUsed: number;
  creditsRemaining: number;
  creditsLimit: number;
  subscriptionStatus: string;
  subscriptionEndDate?: string;
}

export default function CreditsDisplay({ className = '', showUpgradePrompt = false }: CreditsDisplayProps) {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const loadSubscription = async () => {
    try {
      setIsLoading(true);
      const response = await apiRequest('GET', '/api/subscription/current');
      const data = await response.json();
      setSubscription(data);
    } catch (error) {
      console.error('Failed to load subscription:', error);
      toast({
        title: "Error",
        description: "Failed to load subscription information",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSubscription();
  }, []);

  useEffect(() => {
    if (showUpgradePrompt && subscription?.creditsRemaining === 0) {
      setIsModalOpen(true);
    }
  }, [showUpgradePrompt, subscription?.creditsRemaining]);

  const getPlanIcon = (planId: string) => {
    switch (planId) {
      case 'starter':
        return <Zap className="w-4 h-4 text-ailldoit-accent" />;
      case 'growth':
        return <Crown className="w-4 h-4 text-yellow-500" />;
      case 'enterprise':
        return <Building className="w-4 h-4 text-purple-500" />;
      default:
        return <Zap className="w-4 h-4 text-gray-500" />;
    }
  };

  const getPlanColor = (planId: string) => {
    switch (planId) {
      case 'starter':
        return 'bg-ailldoit-accent text-white';
      case 'growth':
        return 'bg-yellow-500 text-white';
      case 'enterprise':
        return 'bg-purple-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const getProgressColor = (remaining: number, total: number) => {
    const percentage = (remaining / total) * 100;
    if (percentage <= 10) return 'bg-red-500';
    if (percentage <= 25) return 'bg-yellow-500';
    return 'bg-ailldoit-accent';
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-20 bg-gray-200 rounded-lg"></div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <Card className={className}>
        <CardContent className="p-4">
          <p className="text-center text-muted-foreground">Unable to load subscription info</p>
        </CardContent>
      </Card>
    );
  }

  const { plan, creditsUsed, creditsRemaining, creditsLimit } = subscription;
  const progressPercentage = ((creditsLimit - creditsRemaining) / creditsLimit) * 100;
  const isLowCredits = creditsRemaining <= creditsLimit * 0.1;
  const isOutOfCredits = creditsRemaining === 0;

  return (
    <>
      <Card className={className}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Credits</CardTitle>
            <Badge className={getPlanColor(plan.id)}>
              <div className="flex items-center space-x-1">
                {getPlanIcon(plan.id)}
                <span>{plan.name}</span>
              </div>
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Remaining</span>
              <span className="font-medium">
                {creditsRemaining.toLocaleString()} / {creditsLimit.toLocaleString()}
              </span>
            </div>
            <Progress 
              value={progressPercentage} 
              className="h-2"
              // Custom progress color based on remaining credits
            />
          </div>

          {isOutOfCredits && (
            <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">Out of Credits</p>
                <p className="text-xs text-red-600">Upgrade to continue creating content</p>
              </div>
            </div>
          )}

          {isLowCredits && !isOutOfCredits && (
            <div className="flex items-center space-x-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-800">Low Credits</p>
                <p className="text-xs text-yellow-600">Consider upgrading soon</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Button
              onClick={() => setIsModalOpen(true)}
              variant={isOutOfCredits ? "default" : "outline"}
              size="sm"
              className={`w-full ${isOutOfCredits ? 'bg-ailldoit-accent hover:bg-ailldoit-accent/90' : ''}`}
            >
              {plan.id === 'free' ? 'Upgrade Plan' : 'Manage Subscription'}
            </Button>
            
            {subscription.subscriptionEndDate && (
              <p className="text-xs text-center text-muted-foreground">
                {subscription.subscriptionStatus === 'active' 
                  ? `Renews ${formatDate(subscription.subscriptionEndDate)}`
                  : `Expires ${formatDate(subscription.subscriptionEndDate)}`
                }
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <SubscriptionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currentPlan={plan.id}
        currentCredits={creditsRemaining}
        onUpgrade={loadSubscription}
      />
    </>
  );
}