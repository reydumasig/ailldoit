import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import {
  Camera,
  Plus,
  Image as ImageIcon,
  Sparkles,
  Ruler,
  Clock,
  MapPin,
  Loader2,
} from "lucide-react";
import type { PhotoProject } from "@shared/schema";
import { CreditsChip } from "@/components/photos/credits-chip";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

/**
 * Photos — real-estate AI photo editing module (landing page).
 *
 * MVP scope (see MVP_PHOTO_PLAN.md at repo root):
 *  - Upload JPEG brackets or singles
 *  - Auto HDR merge, white balance, exposure balance, perspective, crop
 *  - Enhancement: brightness / contrast / vibrance / noise reduction
 *  - Smart edits: sky replacement, window pull (highlight recovery)
 *  - Watermarked preview → pay-on-download
 *
 * Object removal, virtual staging, and twilight conversion are Phase 2 —
 * not shipped with MVP. Don't surface them in this UI yet.
 *
 * Page shows:
 *  - If user has projects: recent projects grid + "New project" CTA.
 *  - If empty: big empty state + feature preview cards.
 */
type ProjectsResponse = { projects: PhotoProject[] };

export default function PhotosIndex() {
  const { data, isLoading, isError, error } = useQuery<ProjectsResponse>({
    queryKey: ["/api/photo/projects"],
  });

  const projects = data?.projects ?? [];
  const hasProjects = projects.length > 0;

  // Post-checkout redirect handling. Stripe sends users back to
  // /photos?checkout=success&session_id=cs_... — invalidate the balance
  // query so the chip updates once the webhook has credited the org. We
  // strip the query params so a refresh doesn't re-trigger the toast-y UX.
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const checkoutStatus = params.get("checkout");
    if (!checkoutStatus) return;
    if (checkoutStatus === "success") {
      // The webhook may land slightly after the redirect — give it a beat,
      // then refetch. A second invalidation after a longer delay catches
      // the slow-webhook case without blocking the first paint.
      setTimeout(
        () =>
          queryClient.invalidateQueries({
            queryKey: ["/api/photo/credits/balance"],
          }),
        1500
      );
      setTimeout(
        () =>
          queryClient.invalidateQueries({
            queryKey: ["/api/photo/credits/balance"],
          }),
        5000
      );
    }
    // Clean the URL.
    setLocation("/photos");
  }, [location, queryClient, setLocation]);

  return (
    <div className="flex-1 overflow-hidden">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-8 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-ailldoit-black">Photos</h2>
            <p className="text-ailldoit-muted">
              The operating system for real-estate media — HDR merge, sky replace, perspective, window pull.
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <CreditsChip />
            <Link href="/photos/new">
              <Button className="bg-ailldoit-accent hover:bg-ailldoit-accent/90 text-white hover:shadow-lg">
                <Plus className="w-4 h-4 mr-2" />
                New Project
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="p-8 space-y-8">
        {isLoading && (
          <div className="flex items-center gap-2 text-ailldoit-muted">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading projects…
          </div>
        )}

        {isError && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-5 text-sm text-red-700">
              Couldn't load projects: {error instanceof Error ? error.message : "unknown error"}
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && hasProjects && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-ailldoit-black">Recent projects</h3>
              <span className="text-sm text-ailldoit-muted">{projects.length} total</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          </section>
        )}

        {!isLoading && !isError && !hasProjects && (
          <>
            {/* Empty state */}
            <Card className="border-dashed border-2 border-gray-200 bg-white">
              <CardContent className="py-16 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-ailldoit-accent/10 flex items-center justify-center mb-6">
                  <Camera className="w-8 h-8 text-ailldoit-accent" />
                </div>
                <h3 className="text-xl font-semibold text-ailldoit-black mb-2">
                  Start your first photo project
                </h3>
                <p className="text-ailldoit-muted max-w-md mb-6">
                  Upload a property shoot (single photos or bracketed exposures) and
                  our AI pipeline will deliver polished, listing-ready images in minutes.
                  You only pay when you download.
                </p>
                <Link href="/photos/new">
                  <Button className="bg-ailldoit-accent hover:bg-ailldoit-accent/90 text-white">
                    <Plus className="w-4 h-4 mr-2" />
                    New Project
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Feature preview — sells the MVP story on the page itself */}
            <section>
              <h3 className="text-lg font-semibold text-ailldoit-black mb-4">What you'll get</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <FeatureCard
                  icon={<ImageIcon className="w-5 h-5" />}
                  title="Auto HDR merge"
                  body="Upload 3–5 bracketed exposures. We fuse them into a perfectly balanced final image — bright highlights, detailed shadows, no blown windows."
                />
                <FeatureCard
                  icon={<Sparkles className="w-5 h-5" />}
                  title="Sky replacement"
                  body="Cloudy day, flat sky, overexposed? Swap in a clean sky that matches the property's vibe. One click."
                />
                <FeatureCard
                  icon={<Ruler className="w-5 h-5" />}
                  title="Perspective + window pull"
                  body="Straighten verticals automatically and pull detail back into blown-out windows. Rooms look tall, bright, and true-to-life."
                />
                <FeatureCard
                  icon={<Clock className="w-5 h-5" />}
                  title="Preview before you pay"
                  body="Every edit is previewed free (watermarked). You only unlock and download when you're happy — no commitment up front."
                />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function ProjectCard({ project }: { project: PhotoProject }) {
  return (
    <Link href={`/photos/${project.id}`}>
      <Card className="bg-white hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="w-9 h-9 rounded-lg bg-ailldoit-accent/10 text-ailldoit-accent flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
            <StatusBadge status={project.status} />
          </div>
          <h4 className="font-semibold text-ailldoit-black mb-1 truncate">{project.name}</h4>
          {project.addressLine ? (
            <p className="text-xs text-ailldoit-muted flex items-center gap-1 mb-2">
              <MapPin className="w-3 h-3" />
              <span className="truncate">{project.addressLine}</span>
            </p>
          ) : null}
          <p className="text-xs text-ailldoit-muted">
            Created {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : "recently"}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    ingesting: "bg-blue-100 text-blue-700",
    processing: "bg-amber-100 text-amber-700",
    ready: "bg-emerald-100 text-emerald-700",
    delivered: "bg-purple-100 text-purple-700",
    archived: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded ${styles[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card className="bg-white">
      <CardContent className="p-5">
        <div className="w-9 h-9 rounded-lg bg-ailldoit-accent/10 text-ailldoit-accent flex items-center justify-center mb-3">
          {icon}
        </div>
        <h4 className="font-semibold text-ailldoit-black mb-1">{title}</h4>
        <p className="text-sm text-ailldoit-muted">{body}</p>
      </CardContent>
    </Card>
  );
}
