import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Users, TrendingUp, CreditCard, Activity, Settings, Shield } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface SystemStats {
  totalUsers: number;
  activeUsers: number;
  newSignupsToday: number;
  totalCampaigns: number;
  campaignsToday: number;
  totalCreditsUsed: number;
  creditsUsedToday: number;
}

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  creditsUsed: number;
  creditsLimit: number;
  createdAt: string;
  lastLoginAt?: string;
}

interface UsersData {
  users: User[];
  subscriptionBreakdown: { [key: string]: number };
  platformBreakdown: { [key: string]: number };
}

interface PerformanceData {
  metrics: {
    currentActiveUsers: number;
    currentActiveGenerations: number;
    peakConcurrentUsers: number;
    peakConcurrentGenerations: number;
    totalApiCalls: number;
    totalCreditsConsumed: number;
    uptimeHours: number;
  };
  capacity: {
    canHandle100Users: boolean;
    currentLoad: {
      activeUsers: number;
      activeGenerations: number;
      systemHealth: string;
    };
    recommendations: string[];
    limits: {
      estimatedMaxConcurrentUsers: number;
      estimatedMaxConcurrentGenerations: number;
      creditConsumptionRate: number;
    };
  };
}

export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Check if user is superadmin
  useEffect(() => {
    if (user && !['rey@ailldoit.com', 'rey@taxikel.com'].includes(user.email || '')) {
      window.location.href = '/';
    }
  }, [user]);

  // Fetch system stats
  const { data: systemStats, isLoading: statsLoading } = useQuery<SystemStats>({
    queryKey: ['/api/admin/system-stats'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch users data
  const { data: usersData, isLoading: usersLoading } = useQuery<UsersData>({
    queryKey: ['/api/admin/users'],
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch performance data
  const { data: performanceData, isLoading: performanceLoading } = useQuery<PerformanceData>({
    queryKey: ['/api/admin/performance'],
    refetchInterval: 15000, // Refresh every 15 seconds for real-time monitoring
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, updates }: { userId: string; updates: any }) => {
      return await apiRequest(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setIsEditDialogOpen(false);
      toast({
        title: "User updated",
        description: "User has been successfully updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update user.",
        variant: "destructive",
      });
    },
  });

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setIsEditDialogOpen(true);
  };

  const handleUpdateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    const formData = new FormData(e.target as HTMLFormElement);
    const updates = {
      role: formData.get('role'),
      subscriptionTier: formData.get('subscriptionTier'),
      creditsLimit: parseInt(formData.get('creditsLimit') as string),
    };

    updateUserMutation.mutate({ userId: selectedUser.id, updates });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'superadmin': return 'bg-red-100 text-red-800';
      case 'admin': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getSubscriptionColor = (tier: string) => {
    switch (tier) {
      case 'enterprise': return 'bg-purple-100 text-purple-800';
      case 'pro': return 'bg-blue-100 text-blue-800';
      default: return 'bg-green-100 text-green-800';
    }
  };

  if (!user || !['rey@ailldoit.com', 'rey@taxikel.com'].includes(user.email || '')) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Shield className="h-12 w-12 mx-auto text-red-500 mb-4" />
            <CardTitle className="text-xl text-red-600">Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access this area.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121212] text-[#FAFAFA]">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="h-8 w-8 text-[#FF6B00]" />
            <h1 className="text-3xl font-bold">Superadmin Dashboard</h1>
          </div>
          <p className="text-[#6D6D6D]">
            Monitor platform usage, user analytics, and system performance
          </p>
        </div>

        {/* System Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="bg-[#F4F4F4] border-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#121212]">Total Users</CardTitle>
              <Users className="h-4 w-4 text-[#6D6D6D]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#121212]">
                {statsLoading ? '...' : systemStats?.totalUsers?.toLocaleString() || '0'}
              </div>
              <p className="text-xs text-[#6D6D6D]">
                {statsLoading ? '...' : `${systemStats?.newSignupsToday || 0} new today`}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#F4F4F4] border-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#121212]">Active Users</CardTitle>
              <Activity className="h-4 w-4 text-[#6D6D6D]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#121212]">
                {statsLoading ? '...' : systemStats?.activeUsers?.toLocaleString() || '0'}
              </div>
              <p className="text-xs text-[#6D6D6D]">
                Last 30 days
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#F4F4F4] border-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#121212]">Total Campaigns</CardTitle>
              <TrendingUp className="h-4 w-4 text-[#6D6D6D]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#121212]">
                {statsLoading ? '...' : systemStats?.totalCampaigns?.toLocaleString() || '0'}
              </div>
              <p className="text-xs text-[#6D6D6D]">
                {statsLoading ? '...' : `${systemStats?.campaignsToday || 0} created today`}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#F4F4F4] border-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#121212]">Credits Consumed</CardTitle>
              <CreditCard className="h-4 w-4 text-[#6D6D6D]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#121212]">
                {statsLoading ? '...' : systemStats?.totalCreditsUsed?.toLocaleString() || '0'}
              </div>
              <p className="text-xs text-[#6D6D6D]">
                {statsLoading ? '...' : `${systemStats?.creditsUsedToday || 0} used today`}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="bg-[#F4F4F4]">
            <TabsTrigger value="users" className="data-[state=active]:bg-[#FF6B00] data-[state=active]:text-white">
              Users
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-[#FF6B00] data-[state=active]:text-white">
              Analytics
            </TabsTrigger>
            <TabsTrigger value="performance" className="data-[state=active]:bg-[#FF6B00] data-[state=active]:text-white">
              Performance
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-6">
            <Card className="bg-[#F4F4F4] border-0">
              <CardHeader>
                <CardTitle className="text-[#121212]">User Management</CardTitle>
                <CardDescription className="text-[#6D6D6D]">
                  Manage user accounts, subscriptions, and access levels
                </CardDescription>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="text-center py-8 text-[#6D6D6D]">Loading users...</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[#121212]">User</TableHead>
                        <TableHead className="text-[#121212]">Role</TableHead>
                        <TableHead className="text-[#121212]">Subscription</TableHead>
                        <TableHead className="text-[#121212]">Credits Used</TableHead>
                        <TableHead className="text-[#121212]">Joined</TableHead>
                        <TableHead className="text-[#121212]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usersData?.users?.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium text-[#121212]">
                                {user.firstName && user.lastName 
                                  ? `${user.firstName} ${user.lastName}`
                                  : user.email}
                              </div>
                              <div className="text-sm text-[#6D6D6D]">{user.email}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={getRoleColor(user.role)}>
                              {user.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={getSubscriptionColor(user.subscriptionTier)}>
                              {user.subscriptionTier}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-[#121212]">
                            {user.creditsUsed || 0} / {user.creditsLimit || 100}
                            <div className="text-xs text-[#6D6D6D]">
                              ({Math.round(((user.creditsUsed || 0) / (user.creditsLimit || 100)) * 100)}%)
                            </div>
                          </TableCell>
                          <TableCell className="text-[#121212]">
                            {formatDate(user.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditUser(user)}
                              className="border-[#FF6B00] text-[#FF6B00] hover:bg-[#FF6B00] hover:text-white"
                            >
                              <Settings className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-[#F4F4F4] border-0">
                <CardHeader>
                  <CardTitle className="text-[#121212]">Subscription Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  {usersData?.subscriptionBreakdown ? (
                    Object.entries(usersData.subscriptionBreakdown).map(([tier, count]) => (
                      <div key={tier} className="flex justify-between items-center py-2">
                        <Badge className={getSubscriptionColor(tier)}>
                          {tier}
                        </Badge>
                        <span className="text-[#121212] font-medium">{count} users</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[#6D6D6D]">No data available</div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-[#F4F4F4] border-0">
                <CardHeader>
                  <CardTitle className="text-[#121212]">Platform Usage</CardTitle>
                </CardHeader>
                <CardContent>
                  {usersData?.platformBreakdown ? (
                    Object.entries(usersData.platformBreakdown).map(([platform, count]) => (
                      <div key={platform} className="flex justify-between items-center py-2">
                        <span className="text-[#121212] capitalize">{platform}</span>
                        <span className="text-[#121212] font-medium">{count} campaigns</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[#6D6D6D]">No data available</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-[#F4F4F4] border-0">
                <CardHeader>
                  <CardTitle className="text-[#121212]">System Load</CardTitle>
                  <CardDescription className="text-[#6D6D6D]">
                    Real-time system performance metrics
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {performanceLoading ? (
                    <div className="text-center py-4 text-[#6D6D6D]">Loading metrics...</div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[#121212]">Active Users</span>
                        <Badge className="bg-blue-100 text-blue-800">
                          {performanceData?.metrics.currentActiveUsers || 0}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#121212]">Active Generations</span>
                        <Badge className="bg-orange-100 text-orange-800">
                          {performanceData?.metrics.currentActiveGenerations || 0}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#121212]">System Health</span>
                        <Badge className={
                          performanceData?.capacity.currentLoad.systemHealth === 'excellent' ? 'bg-green-100 text-green-800' :
                          performanceData?.capacity.currentLoad.systemHealth === 'good' ? 'bg-blue-100 text-blue-800' :
                          'bg-yellow-100 text-yellow-800'
                        }>
                          {performanceData?.capacity.currentLoad.systemHealth || 'unknown'}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#121212]">100 Users Capacity</span>
                        <Badge className={
                          performanceData?.capacity.canHandle100Users 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }>
                          {performanceData?.capacity.canHandle100Users ? 'Ready' : 'Needs Upgrade'}
                        </Badge>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-[#F4F4F4] border-0">
                <CardHeader>
                  <CardTitle className="text-[#121212]">Peak Performance</CardTitle>
                  <CardDescription className="text-[#6D6D6D]">
                    Historical peak load metrics
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {performanceLoading ? (
                    <div className="text-center py-4 text-[#6D6D6D]">Loading metrics...</div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[#121212]">Peak Users</span>
                        <span className="text-[#121212] font-medium">
                          {performanceData?.metrics.peakConcurrentUsers || 0}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#121212]">Peak Generations</span>
                        <span className="text-[#121212] font-medium">
                          {performanceData?.metrics.peakConcurrentGenerations || 0}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#121212]">Total API Calls</span>
                        <span className="text-[#121212] font-medium">
                          {performanceData?.metrics.totalApiCalls?.toLocaleString() || 0}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#121212]">Credits/Hour Rate</span>
                        <span className="text-[#121212] font-medium">
                          {performanceData?.capacity.limits.creditConsumptionRate || 0}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-[#F4F4F4] border-0 md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-[#121212]">System Recommendations</CardTitle>
                  <CardDescription className="text-[#6D6D6D]">
                    Automated suggestions for scaling and optimization
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {performanceLoading ? (
                    <div className="text-center py-4 text-[#6D6D6D]">Loading recommendations...</div>
                  ) : (
                    <div className="space-y-2">
                      {performanceData?.capacity.recommendations?.map((recommendation, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <div className="w-2 h-2 bg-[#FF6B00] rounded-full mt-2 flex-shrink-0"></div>
                          <span className="text-[#121212] text-sm">{recommendation}</span>
                        </div>
                      )) || (
                        <div className="text-[#6D6D6D]">No recommendations at this time</div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Edit User Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="bg-[#F4F4F4]">
            <DialogHeader>
              <DialogTitle className="text-[#121212]">Edit User</DialogTitle>
              <DialogDescription className="text-[#6D6D6D]">
                Update user role, subscription, and credit limits
              </DialogDescription>
            </DialogHeader>
            {selectedUser && (
              <form onSubmit={handleUpdateUser} className="space-y-4">
                <div>
                  <Label htmlFor="role" className="text-[#121212]">Role</Label>
                  <Select name="role" defaultValue={selectedUser.role}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="superadmin">Superadmin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="subscriptionTier" className="text-[#121212]">Subscription Tier</Label>
                  <Select name="subscriptionTier" defaultValue={selectedUser.subscriptionTier}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="creditsLimit" className="text-[#121212]">Credits Limit</Label>
                  <Input
                    name="creditsLimit"
                    type="number"
                    defaultValue={selectedUser.creditsLimit}
                    className="bg-white border-[#6D6D6D]"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-[#FF6B00] hover:bg-[#e55d00] text-white"
                    disabled={updateUserMutation.isPending}
                  >
                    {updateUserMutation.isPending ? 'Updating...' : 'Update User'}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}