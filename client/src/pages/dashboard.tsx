import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { Campaign } from "@shared/schema";
import StatsCard from "@/components/stats-card";
import CampaignCard from "@/components/campaign-card";
import CreditsDisplay from "@/components/credits-display";
import { 
  Plus, 
  Bell, 
  Megaphone, 
  Play, 
  MousePointer, 
  TrendingUp 
} from "lucide-react";

export default function Dashboard() {
  const { data: campaigns = [], isLoading: campaignLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
  });

  const filterCampaigns = (status?: string) => {
    if (!status) return campaigns;
    return campaigns.filter(campaign => campaign.status === status);
  };

  return (
    <div className="flex-1 overflow-hidden">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-8 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-ailldoit-black">Campaign Dashboard</h2>
            <p className="text-ailldoit-muted">Generate viral, localized social media content in minutes</p>
          </div>
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm">
              <Bell className="w-4 h-4" />
            </Button>
            <Link href="/campaign/new">
              <Button className="bg-ailldoit-accent hover:bg-ailldoit-accent/90 text-white hover:shadow-lg">
                <Plus className="w-4 h-4 mr-2" />
                New Campaign
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-8 h-full overflow-y-auto">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <StatsCard
            title="Total Campaigns"
            value={statsLoading ? "..." : stats?.totalCampaigns?.toString() || "0"}
            change="+12%"
            changeType="positive"
            icon={Megaphone}
            iconColor="bg-ailldoit-accent"
          />
          <StatsCard
            title="Active Campaigns"
            value={statsLoading ? "..." : stats?.activeCampaigns?.toString() || "0"}
            change="+5%"
            changeType="positive"
            icon={Play}
            iconColor="bg-success"
          />
          <StatsCard
            title="Avg. Engagement"
            value={statsLoading ? "..." : stats?.avgCTR || "0%"}
            change="+0.8%"
            changeType="positive"
            icon={MousePointer}
            iconColor="bg-ailldoit-accent"
          />
          <StatsCard
            title="Total Views"
            value={statsLoading ? "..." : stats?.roi || "0"}
            change="+25%"
            changeType="positive"
            icon={TrendingUp}
            iconColor="bg-ailldoit-accent"
          />
          <CreditsDisplay className="h-full" />
        </div>

        {/* Campaigns List */}
        <Card className="shadow-lg border-gray-100 overflow-hidden">
          <Tabs defaultValue="all" className="w-full">
            <div className="flex border-b border-gray-200">
              <TabsList className="grid w-full grid-cols-4 bg-transparent">
                <TabsTrigger value="all" className="data-[state=active]:text-ailldoit-accent data-[state=active]:border-b-2 data-[state=active]:border-ailldoit-accent">
                  All Campaigns
                </TabsTrigger>
                <TabsTrigger value="draft" className="data-[state=active]:text-ailldoit-accent data-[state=active]:border-b-2 data-[state=active]:border-ailldoit-accent">
                  Draft
                </TabsTrigger>
                <TabsTrigger value="active" className="data-[state=active]:text-ailldoit-accent data-[state=active]:border-b-2 data-[state=active]:border-ailldoit-accent">
                  Active
                </TabsTrigger>
                <TabsTrigger value="ready" className="data-[state=active]:text-ailldoit-accent data-[state=active]:border-b-2 data-[state=active]:border-ailldoit-accent">
                  Ready
                </TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="all" className="p-6">
              {campaignLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="animate-pulse bg-gray-200 rounded-xl h-24"></div>
                  ))}
                </div>
              ) : campaigns.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-ailldoit-muted mb-4">No campaigns yet</p>
                  <Link href="/campaign/new">
                    <Button className="bg-ailldoit-accent hover:bg-ailldoit-accent/90 text-white">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Your First Campaign
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {campaigns.map((campaign) => (
                    <CampaignCard key={campaign.id} campaign={campaign} />
                  ))}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="draft" className="p-6">
              <div className="space-y-4">
                {filterCampaigns("draft").map((campaign) => (
                  <CampaignCard key={campaign.id} campaign={campaign} />
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="active" className="p-6">
              <div className="space-y-4">
                {filterCampaigns("active").map((campaign) => (
                  <CampaignCard key={campaign.id} campaign={campaign} />
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="ready" className="p-6">
              <div className="space-y-4">
                {filterCampaigns("ready").map((campaign) => (
                  <CampaignCard key={campaign.id} campaign={campaign} />
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </main>
    </div>
  );
}
