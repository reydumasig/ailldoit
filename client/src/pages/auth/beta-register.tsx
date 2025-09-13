import React, { useState } from 'react';
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Link, useLocation } from 'wouter';
import { FcGoogle } from 'react-icons/fc';
import { Loader2, Sparkles, Zap, Crown } from 'lucide-react';
import { getDomainInstructions } from '@/lib/domainUtils';

export default function BetaRegister() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const signUpBeta = async (firebaseUser: any) => {
    const idToken = await firebaseUser.getIdToken();
    
    const response = await fetch('/api/auth/signup/beta', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Beta signup failed: ${errorText}`);
    }
    
    return response.json();
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        title: "Password mismatch",
        description: "Please make sure your passwords match.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    try {
      console.log('🎯 Starting Beta signup process...');
      const result = await createUserWithEmailAndPassword(auth, email, password);
      console.log('✅ Firebase user created successfully:', result.user.uid);
      
      // Call Beta signup endpoint
      console.log('🔑 Registering as Beta user...');
      await signUpBeta(result.user);
      
      console.log('✅ Beta user registration completed successfully');
      toast({
        title: "Welcome to Beta!",
        description: "Your Beta account is ready with 5,000 credits. Start creating amazing content!",
      });
      
      // Navigate to dashboard
      navigate('/dashboard');
    } catch (error: any) {
      console.error('❌ Beta signup failed:', error);
      toast({
        title: "Beta sign up failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setIsLoading(true);
    
    try {
      console.log('🎯 Starting Beta Google signup...');
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      // Call Beta signup endpoint
      console.log('🔑 Registering as Beta user...');
      await signUpBeta(result.user);
      
      console.log('✅ Beta Google signup completed successfully');
      toast({
        title: "Welcome to Beta!",
        description: "Your Beta account is ready with 5,000 credits. Start creating amazing content!",
      });
      
      // Navigate to dashboard
      navigate('/dashboard');
    } catch (error: any) {
      console.error('❌ Beta Google signup error:', error);
      
      let errorMessage = error.message || "Please try again.";
      
      if (error.code === 'auth/unauthorized-domain') {
        const instructions = getDomainInstructions();
        errorMessage = `Domain not authorized: ${window.location.hostname}. Check console for setup instructions.`;
        
        if (navigator.clipboard) {
          navigator.clipboard.writeText(instructions).catch(() => {
            console.log('Could not copy to clipboard, but instructions are in console');
          });
        }
      }
      
      toast({
        title: "Beta Google sign up failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-2 border-purple-500/20 shadow-2xl">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <Badge className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 text-lg font-bold">
              <Crown className="mr-2 h-5 w-5" />
              BETA ACCESS
            </Badge>
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900">
            Join the Beta Program
          </CardTitle>
          <CardDescription className="text-base">
            Get exclusive early access with premium features
          </CardDescription>
          
          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="flex items-center space-x-2 text-sm text-purple-700 bg-purple-50 p-3 rounded-lg">
              <Zap className="h-4 w-4 text-purple-600" />
              <span className="font-medium">5,000 Credits</span>
            </div>
            <div className="flex items-center space-x-2 text-sm text-purple-700 bg-purple-50 p-3 rounded-lg">
              <Sparkles className="h-4 w-4 text-purple-600" />
              <span className="font-medium">Beta Features</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Button
            type="button"
            variant="outline"
            className="w-full border-purple-300 hover:bg-purple-50"
            onClick={handleGoogleSignUp}
            disabled={isLoading}
            data-testid="button-google-beta-signup"
          >
            <FcGoogle className="mr-2 h-5 w-5" />
            Continue with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with email
              </span>
            </div>
          </div>

          <form onSubmit={handleEmailSignUp} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  type="text"
                  placeholder="John"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  disabled={isLoading}
                  data-testid="input-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  disabled={isLoading}
                  data-testid="input-last-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                data-testid="input-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isLoading}
                data-testid="input-confirm-password"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              disabled={isLoading}
              data-testid="button-create-beta-account"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Join Beta Program
            </Button>
          </form>

          <div className="text-center text-sm">
            <span className="text-muted-foreground">Already have an account? </span>
            <Link href="/login" className="text-purple-600 hover:text-purple-700 font-medium">
              Sign in
            </Link>
          </div>
          
          <div className="text-center text-xs text-muted-foreground">
            <Link href="/signup" className="hover:text-purple-600">
              Join regular plan instead?
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}