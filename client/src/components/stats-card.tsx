import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string;
  change: string;
  changeType: "positive" | "negative";
  icon: LucideIcon;
  iconColor: string;
}

export default function StatsCard({ 
  title, 
  value, 
  change, 
  changeType, 
  icon: Icon, 
  iconColor 
}: StatsCardProps) {
  return (
    <Card className="shadow-lg border-gray-100">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-ailldoit-muted text-sm">{title}</p>
            <p className="text-2xl font-bold text-ailldoit-black mt-1">{value}</p>
          </div>
          <div className={`w-12 h-12 ${iconColor} rounded-xl flex items-center justify-center`}>
            <Icon className="text-white w-5 h-5" />
          </div>
        </div>
        <div className="mt-4 flex items-center text-sm">
          <span className={changeType === "positive" ? "text-success" : "text-destructive"}>
            {change}
          </span>
          <span className="text-ailldoit-muted ml-2">from last month</span>
        </div>
      </CardContent>
    </Card>
  );
}
