import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Image } from "lucide-react";
import { publicationsApi } from "../api/publications";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { PublicationCard } from "../components/PublicationCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function Publications() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [platform, setPlatform] = useState("all");

  useEffect(() => {
    setBreadcrumbs([{ label: "Publications" }]);
  }, [setBreadcrumbs]);

  const filters = platform !== "all" ? { platform } : undefined;

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.publications(selectedCompanyId!, platform !== "all" ? platform : undefined),
    queryFn: () => publicationsApi.list(selectedCompanyId!, filters),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Image} message="Select a company to view publications." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      {/* Header with filter */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data?.length ?? 0} publication{data?.length !== 1 ? "s" : ""}
        </p>
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="linkedin">LinkedIn</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Gallery grid */}
      {data && data.length === 0 && (
        <EmptyState icon={Image} message="No publications yet. Published social media posts will appear here." />
      )}

      {data && data.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {data.map((pub) => (
            <PublicationCard key={pub.id} pub={pub} />
          ))}
        </div>
      )}
    </div>
  );
}
