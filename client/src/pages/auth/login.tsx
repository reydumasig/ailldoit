import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';
import { FcGoogle } from 'react-icons/fc';
import { Loader2, Copy } from 'lucide-react';
import { getDomainInstructions } from '@/lib/domainUtils';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signInWithGoogle } = useAuth();
  const { toast } = useToast();

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await signIn(email, password);
      toast({
        title: "Welcome back!",
        description: "You've been successfully signed in.",
      });
    } catch (error: any) {
      toast({
        title: "Sign in failed",
        description: error.message || "Please check your credentials and try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    
    try {
      console.log('🌐 Current domain:', window.location.hostname);
      console.log('🔗 Full URL:', window.location.href);
      
      await signInWithGoogle();
      toast({
        title: "Welcome back!",
        description: "You've been successfully signed in with Google.",
      });
    } catch (error: any) {
      console.error('❌ Google sign in error:', error);
      console.log('🔍 Error code:', error.code);
      console.log('🔍 Error message:', error.message);
      
      let errorMessage = error.message || "Please try again.";
      
      if (error.code === 'auth/unauthorized-domain') {
        const instructions = getDomainInstructions();
        console.log('🔧 Domain setup instructions:', instructions);
        errorMessage = `Domain not authorized: ${window.location.hostname}. Check console for setup instructions.`;
        
        // Copy instructions to clipboard
        if (navigator.clipboard) {
          navigator.clipboard.writeText(instructions).catch(() => {
            console.log('Could not copy to clipboard, but instructions are in console');
          });
        }
      }
      
      toast({
        title: "Google sign in failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-slate-900">
            Welcome to Ailldoit
          </CardTitle>
          <CardDescription>
            Sign in to create viral social media ads with AI
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
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

          <form onSubmit={handleEmailSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button 
              type="submit" 
              className="w-full bg-orange-600 hover:bg-orange-700"
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>

          <div className="text-center text-sm">
            <span className="text-muted-foreground">Don't have an account? </span>
            <Link href="/register" className="text-orange-600 hover:text-orange-700 font-medium">
              Sign up
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}