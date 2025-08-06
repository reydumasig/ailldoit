import { useState, useEffect } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, X, Zap, Crown, Building } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { CLIENT_ENV } from '@/lib/environment';

if (!CLIENT_ENV.stripe.publicKey) {
  throw new Error(`Missing Stripe public key for ${CLIENT_ENV.domain}`);
}

const stripePromise = loadStripe(CLIENT_ENV.stripe.publicKey);

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  credits: number;
  features: string[];
}

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlan?: string;
  currentCredits?: number;
  onUpgrade?: () => void;
}

const CheckoutForm = ({ planId, onSuccess }: { planId: string; onSuccess: () => void }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin,
        },
      });

      if (error) {
        toast({
          title: "Payment Failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Payment Successful",
          description: "Your subscription has been activated!",
        });
        onSuccess();
      }
    } catch (error: any) {
      console.error('Payment processing error:', error);
      toast({
        title: "Payment Error",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <Button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full bg-ailldoit-accent hover:bg-ailldoit-accent/90"
      >
        {isProcessing ? 'Processing...' : 'Subscribe Now'}
      </Button>
    </form>
  );
};

export default function SubscriptionModal({
  isOpen,
  onClose,
  currentPlan = 'free',
  currentCredits = 0,
  onUpgrade
}: SubscriptionModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Load subscription plans
  const loadPlans = async () => {
    try {
      const response = await apiRequest('GET', '/api/subscription/plans');
      const plansData = await response.json();
      setPlans(plansData);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load subscription plans",
        variant: "destructive",
      });
    }
  };

  // Initialize plans when modal opens
  useEffect(() => {
    if (isOpen && plans.length === 0) {
      loadPlans();
    }
  }, [isOpen, plans.length]);

  const handlePlanSelect = async (planId: string) => {
    if (planId === 'enterprise') {
      toast({
        title: "Enterprise Plan",
        description: "Please contact our sales team for enterprise pricing",
      });
      return;
    }

    setIsLoading(true);
    setSelectedPlan(planId);

    try {
      // Get the corresponding Stripe Price ID based on environment
      const priceIds: Record<string, string> = {
        starter: CLIENT_ENV.stripe.starterPriceId || '',
        growth: CLIENT_ENV.stripe.growthPriceId || '',
      };

      const priceId = priceIds[planId];
      console.log('🔍 Plan selection debug:', {
        planId,
        priceId,
        allPriceIds: priceIds,
        environment: CLIENT_ENV.domain,
        stripeMode: CLIENT_ENV.domain.includes('ailldoit.com') ? 'LIVE' : 'TEST'
      });
      
      if (!priceId) {
        throw new Error('Price ID not configured for this plan');
      }
      
      if (priceId.startsWith('prod_')) {
        throw new Error('You provided a Product ID (prod_) but we need a Price ID (price_). Please check your Stripe dashboard under Products → [Your Product] → Pricing section.');
      }
      
      if (!priceId.startsWith('price_')) {
        throw new Error('Invalid Price ID format. Price IDs should start with "price_"');
      }

      const response = await apiRequest('POST', '/api/subscription/create', { priceId });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Subscription creation failed:', errorData);
        throw new Error(errorData.message || 'Failed to create subscription');
      }
      
      const data = await response.json();
      console.log('Subscription creation successful:', data);
      setClientSecret(data.clientSecret);
    } catch (error: any) {
      console.error('Subscription error details:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create subscription",
        variant: "destructive",
      });
      setSelectedPlan(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuccess = () => {
    setClientSecret(null);
    setSelectedPlan(null);
    onUpgrade?.();
    onClose();
  };

  const getPlanIcon = (planId: string) => {
    switch (planId) {
      case 'starter':
        return <Zap className="w-6 h-6 text-ailldoit-accent" />;
      case 'growth':
        return <Crown className="w-6 h-6 text-yellow-500" />;
      case 'enterprise':
        return <Building className="w-6 h-6 text-purple-500" />;
      default:
        return <Check className="w-6 h-6 text-green-500" />;
    }
  };

  const formatPrice = (price: number, planId: string) => {
    if (planId === 'enterprise') return 'Custom Pricing';
    return price === 0 ? 'Free' : `$${price.toFixed(2)}/month`;
  };

  if (clientSecret && selectedPlan) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Complete Your Subscription</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-muted-foreground">
                You're upgrading to the {plans.find(p => p.id === selectedPlan)?.name} plan
              </p>
            </div>
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <CheckoutForm planId={selectedPlan} onSuccess={handleSuccess} />
            </Elements>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl text-center">Choose Your Plan</DialogTitle>
          <p className="text-center text-muted-foreground">
            {currentCredits === 0 
              ? "You've reached your credit limit. Upgrade to continue creating amazing content!"
              : "Upgrade to unlock more credits and premium features"
            }
          </p>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          {plans.map((plan) => (
            <Card 
              key={plan.id}
              className={`relative cursor-pointer transition-all hover:shadow-lg ${
                currentPlan === plan.id 
                  ? 'ring-2 ring-ailldoit-accent bg-ailldoit-accent/5' 
                  : 'hover:shadow-md'
              }`}
            >
              {currentPlan === plan.id && (
                <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-ailldoit-accent">
                  Current Plan
                </Badge>
              )}
              
              <CardHeader className="text-center">
                <div className="flex justify-center mb-2">
                  {getPlanIcon(plan.id)}
                </div>
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <div className="text-3xl font-bold text-ailldoit-accent">
                  {formatPrice(plan.price, plan.id)}
                </div>
                <p className="text-muted-foreground">
                  {plan.credits.toLocaleString()} credits/month
                </p>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start space-x-2">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                {plan.id === 'free' ? (
                  currentPlan === 'free' ? (
                    <Button disabled className="w-full">
                      Current Plan
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => {
                        toast({
                          title: "Downgrade Notice",
                          description: "Contact support to downgrade your plan",
                        });
                      }}
                    >
                      Downgrade
                    </Button>
                  )
                ) : plan.id === 'enterprise' ? (
                  <Button 
                    className="w-full" 
                    variant="outline"
                    onClick={() => handlePlanSelect(plan.id)}
                  >
                    Contact Sales
                  </Button>
                ) : currentPlan === plan.id ? (
                  <Button disabled className="w-full">
                    Current Plan
                  </Button>
                ) : (
                  <Button 
                    className="w-full bg-ailldoit-accent hover:bg-ailldoit-accent/90"
                    disabled={isLoading}
                    onClick={() => handlePlanSelect(plan.id)}
                  >
                    {isLoading && selectedPlan === plan.id ? 'Processing...' : 'Upgrade Now'}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="text-center mt-6 text-sm text-muted-foreground">
          <p>All plans include our standard features and support</p>
          <p>Cancel anytime • Secure payments by Stripe</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}