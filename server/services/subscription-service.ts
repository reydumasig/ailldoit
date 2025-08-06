import Stripe from 'stripe';
import { storage } from '../storage';
import { ENV } from '../config/environment';

const stripe = new Stripe(ENV.stripe.secretKey, {
  apiVersion: '2025-06-30.basil',
});

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  credits: number;
  priceId?: string; // Stripe Price ID
  features: string[];
}

export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlan> = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    credits: 100,
    features: [
      '100 AI generation credits',
      'Basic content templates',
      'Single language support',
      'Standard export options'
    ]
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 19.99,
    credits: 1000,
    features: [
      '1,000 AI generation credits',
      'All content templates',
      'Multi-language support',
      'Priority generation',
      'Advanced export options',
      'Email support'
    ]
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    price: 49.99,
    credits: 5000,
    features: [
      '5,000 AI generation credits',
      'Everything in Starter',
      'A/B testing analytics',
      'Custom templates',
      'Priority support',
      'API access'
    ]
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 0, // Contact for pricing
    credits: 10000,
    features: [
      '10,000+ AI generation credits',
      'Everything in Growth',
      'Custom integrations',
      'Dedicated support',
      'Custom training',
      'White-label options'
    ]
  }
};

class SubscriptionService {
  async createOrRetrieveCustomer(userId: string, email: string): Promise<string> {
    const user = await storage.getUser(userId);
    
    if (user?.stripeCustomerId) {
      try {
        // Verify the customer exists in Stripe
        await stripe.customers.retrieve(user.stripeCustomerId);
        return user.stripeCustomerId;
      } catch (error: any) {
        console.log('🔄 Customer not found in Stripe, creating new one:', user.stripeCustomerId);
        // Clear invalid customer ID from database
        await storage.updateUser(userId, { stripeCustomerId: null });
      }
    }

    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email,
      metadata: { userId }
    });

    // Update user with Stripe customer ID
    await storage.updateUser(userId, {
      stripeCustomerId: customer.id
    });

    return customer.id;
  }

  async createSubscription(userId: string, priceId: string): Promise<{ clientSecret: string; subscriptionId: string }> {
    console.log('🔄 Starting subscription creation for userId:', userId, 'priceId:', priceId);
    
    const user = await storage.getUser(userId);
    if (!user?.email) {
      console.error('❌ User not found or missing email:', userId);
      throw new Error('User email not found');
    }
    
    console.log('✅ User found:', user.email);

    try {
      const customerId = await this.createOrRetrieveCustomer(userId, user.email);
      console.log('✅ Customer ID obtained:', customerId);

      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
      });
      
      console.log('✅ Stripe subscription created:', subscription.id);
      console.log('🔍 Subscription object:', JSON.stringify(subscription, null, 2));

      const invoice = subscription.latest_invoice as Stripe.Invoice;
      console.log('🔍 Latest invoice:', invoice?.id, 'status:', invoice?.status);
      
      if (!invoice) {
        throw new Error('No invoice found on subscription');
      }

      // If no payment intent exists, create one manually for the invoice
      let paymentIntent = (invoice as any).payment_intent as Stripe.PaymentIntent;
      
      if (!paymentIntent && invoice.status === 'open') {
        console.log('🔄 Creating payment intent for invoice:', invoice.id);
        paymentIntent = await stripe.paymentIntents.create({
          amount: invoice.amount_due,
          currency: invoice.currency,
          customer: customerId,
          setup_future_usage: 'off_session',
          metadata: {
            invoice_id: invoice.id || '',
            subscription_id: subscription.id,
          },
        });
        
        console.log('✅ Payment intent created:', paymentIntent.id);
      }
      
      console.log('🔍 Payment intent:', paymentIntent?.id, 'status:', paymentIntent?.status);
      console.log('🔍 Payment intent client_secret exists:', !!paymentIntent?.client_secret);

      if (!paymentIntent?.client_secret) {
        console.error('❌ No client secret available:', {
          paymentIntentId: paymentIntent?.id,
          paymentIntentStatus: paymentIntent?.status,
          invoiceId: invoice.id,
          invoiceStatus: invoice.status,
          subscriptionStatus: subscription.status,
          invoiceAmount: invoice.amount_due
        });
        throw new Error('No client secret available for payment');
      }

      console.log('✅ Payment intent client secret obtained');
      
      // Only store the subscription ID, don't update plan until payment is complete
      await storage.updateUser(userId, {
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: 'pending'
      });
      
      console.log('✅ Subscription stored as pending until payment completion');
      
      return {
        clientSecret: paymentIntent.client_secret!,
        subscriptionId: subscription.id,
      };
    } catch (stripeError: any) {
      console.error('❌ Stripe API error:', {
        message: stripeError.message,
        type: stripeError.type,
        code: stripeError.code,
        param: stripeError.param
      });
      throw stripeError;
    }
  }

  async handleWebhook(signature: string, body: Buffer): Promise<void> {
    const event = stripe.webhooks.constructEvent(body, signature, ENV.stripe.webhookSecret);

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await this.updateUserSubscription(subscription);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await this.cancelUserSubscription(subscription);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        if ((invoice as any).subscription) {
          await this.resetUserCredits((invoice as any).subscription as string);
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        if ((invoice as any).subscription) {
          await this.handleFailedPayment((invoice as any).subscription as string);
        }
        break;
      }
    }
  }

  private async updateUserSubscription(subscription: Stripe.Subscription): Promise<void> {
    const customer = await stripe.customers.retrieve(subscription.customer as string);
    if (customer.deleted) return;

    const userId = customer.metadata?.userId;
    if (!userId) return;

    const priceId = subscription.items.data[0]?.price.id;
    const plan = this.getPlanByPriceId(priceId);

    await storage.updateUser(userId, {
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      subscriptionTier: plan.id,
      subscriptionStatus: subscription.status === 'active' ? 'active' : 'inactive',
      subscriptionStartDate: new Date((subscription as any).current_period_start * 1000),
      subscriptionEndDate: new Date((subscription as any).current_period_end * 1000),
      creditsLimit: plan.credits,
      creditsRemaining: plan.credits,
    });
  }

  private async cancelUserSubscription(subscription: Stripe.Subscription): Promise<void> {
    const customer = await stripe.customers.retrieve(subscription.customer as string);
    if (customer.deleted) return;

    const userId = customer.metadata?.userId;
    if (!userId) return;

    await storage.updateUser(userId, {
      subscriptionTier: 'free',
      subscriptionStatus: 'cancelled',
      creditsLimit: 100,
      creditsRemaining: 100,
      stripeSubscriptionId: null,
      stripePriceId: null,
    });
  }

  private async resetUserCredits(subscriptionId: string): Promise<void> {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const customer = await stripe.customers.retrieve(subscription.customer as string);
    if (customer.deleted) return;

    const userId = customer.metadata?.userId;
    if (!userId) return;

    const priceId = subscription.items.data[0]?.price.id;
    const plan = this.getPlanByPriceId(priceId);

    await storage.updateUser(userId, {
      creditsRemaining: plan.credits,
      creditsUsed: 0,
    });
  }

  private async handleFailedPayment(subscriptionId: string): Promise<void> {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const customer = await stripe.customers.retrieve(subscription.customer as string);
    if (customer.deleted) return;

    const userId = customer.metadata?.userId;
    if (!userId) return;

    await storage.updateUser(userId, {
      subscriptionStatus: 'past_due',
    });
  }

  private getPlanByPriceId(priceId?: string): SubscriptionPlan {
    const priceMap: Record<string, string> = {
      [ENV.stripe.starterPriceId]: 'starter',
      [ENV.stripe.growthPriceId]: 'growth',
    };

    const planId = priceMap[priceId || ''] || 'free';
    return SUBSCRIPTION_PLANS[planId];
  }

  async getUserSubscription(userId: string) {
    const user = await storage.getUser(userId);
    if (!user) return null;

    const plan = SUBSCRIPTION_PLANS[user.subscriptionTier || 'free'];
    
    const creditsUsed = user.creditsUsed || 0;
    const creditsLimit = user.creditsLimit || plan.credits;
    // Fix: Calculate remaining credits correctly
    const creditsRemaining = Math.max(0, creditsLimit - creditsUsed);
    
    return {
      plan,
      creditsUsed,
      creditsRemaining,
      creditsLimit,
      subscriptionStatus: user.subscriptionStatus || 'active',
      subscriptionEndDate: user.subscriptionEndDate,
    };
  }

  async deductCredits(userId: string, amount: number): Promise<boolean> {
    const user = await storage.getUser(userId);
    if (!user) return false;

    const creditsUsed = (user.creditsUsed || 0) + amount;
    const creditsLimit = user.creditsLimit || 100;
    const creditsRemaining = Math.max(0, creditsLimit - creditsUsed);
    
    // Check if user has enough credits before deducting
    if (creditsUsed > creditsLimit) return false;

    await storage.updateUser(userId, {
      creditsUsed,
      creditsRemaining,
    });

    return true;
  }

  async cancelSubscription(userId: string): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user?.stripeSubscriptionId) {
      throw new Error('No active subscription found');
    }

    await stripe.subscriptions.cancel(user.stripeSubscriptionId);
  }

  async createPortalSession(userId: string, returnUrl: string): Promise<string> {
    const user = await storage.getUser(userId);
    if (!user?.stripeCustomerId) {
      throw new Error('No Stripe customer found');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });

    return session.url;
  }

  async hasEnoughCredits(userId: string, amount: number): Promise<boolean> {
    const user = await storage.getUser(userId);
    if (!user) return false;
    
    const creditsUsed = user.creditsUsed || 0;
    const creditsLimit = user.creditsLimit || 100;
    const creditsRemaining = Math.max(0, creditsLimit - creditsUsed);
    
    return creditsRemaining >= amount;
  }
}

export const subscriptionService = new SubscriptionService();