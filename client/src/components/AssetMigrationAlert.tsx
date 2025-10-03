import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface AssetMigrationAlertProps {
  campaignId: number;
  onMigrationComplete?: () => void;
}

interface MigrationStatus {
  needsMigration: boolean;
  message: string;
  invalidAssets: {
    images: string[];
    videos: string[];
  };
}

export function AssetMigrationAlert({ campaignId, onMigrationComplete }: AssetMigrationAlertProps) {
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const { toast } = useToast();

  // Check migration status on mount
  useEffect(() => {
    checkMigrationStatus();
  }, [campaignId]);

  const checkMigrationStatus = async () => {
    setIsChecking(true);
    try {
      const response = await apiRequest('GET', `/api/campaigns/${campaignId}/migration-status`);
      const status = await response.json();
      setMigrationStatus(status);
    } catch (error) {
      console.error('Failed to check migration status:', error);
      toast({
        title: "Error",
        description: "Failed to check asset status",
        variant: "destructive",
      });
    } finally {
      setIsChecking(false);
    }
  };

  const migrateAssets = async () => {
    setIsMigrating(true);
    try {
      const response = await apiRequest('POST', `/api/campaigns/${campaignId}/migrate-assets`);
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Assets Migrated",
          description: result.message,
        });
        
        // Refresh the migration status
        await checkMigrationStatus();
        
        // Notify parent component
        if (onMigrationComplete) {
          onMigrationComplete();
        }
      } else {
        toast({
          title: "Migration Failed",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Migration failed:', error);
      toast({
        title: "Migration Failed",
        description: "Failed to migrate assets. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsMigrating(false);
    }
  };

  // Don't show anything if status is not loaded or no migration needed
  if (!migrationStatus || !migrationStatus.needsMigration) {
    return null;
  }

  const totalInvalidAssets = migrationStatus.invalidAssets.images.length + migrationStatus.invalidAssets.videos.length;

  return (
    <Alert className="border-orange-200 bg-orange-50">
      <AlertTriangle className="h-4 w-4 text-orange-600" />
      <AlertDescription className="flex items-center justify-between">
        <div className="flex-1">
          <p className="font-medium text-orange-800">
            {totalInvalidAssets} asset(s) have expired
          </p>
          <p className="text-sm text-orange-700 mt-1">
            {migrationStatus.message}
          </p>
          {migrationStatus.invalidAssets.images.length > 0 && (
            <p className="text-xs text-orange-600 mt-1">
              • {migrationStatus.invalidAssets.images.length} image(s) expired
            </p>
          )}
          {migrationStatus.invalidAssets.videos.length > 0 && (
            <p className="text-xs text-orange-600 mt-1">
              • {migrationStatus.invalidAssets.videos.length} video(s) expired
            </p>
          )}
        </div>
        <div className="flex gap-2 ml-4">
          <Button
            variant="outline"
            size="sm"
            onClick={checkMigrationStatus}
            disabled={isChecking}
            className="text-orange-700 border-orange-300 hover:bg-orange-100"
          >
            {isChecking ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Check
          </Button>
          <Button
            size="sm"
            onClick={migrateAssets}
            disabled={isMigrating}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            {isMigrating ? (
              <RefreshCw className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <CheckCircle className="h-3 w-3 mr-1" />
            )}
            Fix Assets
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

export default AssetMigrationAlert;
