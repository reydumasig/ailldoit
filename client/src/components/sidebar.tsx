import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { 
  Wand2, 
  BarChart3, 
  Megaphone, 
  Settings,
  User,
  LogOut,
  Link2,
  Brain
} from "lucide-react";

export default function Sidebar() {
  const [location] = useLocation();
  const { user, signOut } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const navItems = [
    { href: "/", label: "Dashboard", icon: BarChart3 },
    { href: "/campaigns", label: "Campaigns", icon: Megaphone },
    { href: "/connections", label: "Platforms", icon: Link2 },
    { href: "/test-learning", label: "AI Learning", icon: Brain },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="w-64 bg-white shadow-xl border-r border-gray-200 flex flex-col">
      <div className="p-6">
        {/* Logo */}
        <div className="flex items-center space-x-3 mb-8">
          <div className="w-10 h-10 bg-ailldoit-accent rounded-xl flex items-center justify-center">
            <Wand2 className="text-white text-lg" />
          </div>
          <h1 className="text-2xl font-bold text-ailldoit-black">Ailldoit</h1>
        </div>
        
        {/* Navigation */}
        <nav className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            
            return (
              <div key={item.href}>
                <Link href={item.href}>
                  <div className={cn(
                    "flex items-center space-x-3 px-4 py-3 rounded-lg transition-all cursor-pointer",
                    isActive 
                      ? "bg-ailldoit-accent/10 text-ailldoit-accent font-medium" 
                      : "text-ailldoit-muted hover:bg-ailldoit-neutral hover:text-ailldoit-black"
                  )}>
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </div>
                </Link>
              </div>
            );
          })}
        </nav>
      </div>
      
      {/* User Profile */}
      <div className="mt-auto p-6 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-ailldoit-accent rounded-full flex items-center justify-center">
              <User className="text-white w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-ailldoit-black">
                {`${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || 'User'}
              </p>
              <p className="text-xs text-ailldoit-muted">{user?.email || 'user@ailldoit.com'}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-ailldoit-muted hover:text-ailldoit-accent hover:bg-ailldoit-accent/10"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
