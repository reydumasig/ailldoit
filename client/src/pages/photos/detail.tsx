import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import {
  ArrowLeft,
  Camera,
  Coins,
  Download,
  History,
  Layers,
  Loader2,
  Lock,
  MapPin,
  Package,
  UploadCloud,
  ImageOff,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Unlock,
} from "lucide-react";
import type { PhotoAsset, PhotoProject } from "@shared/schema";
import { CreditsChip } from "@/components/photos/credits-chip";

/**
 * /photos/:id — project detail screen.
 *
 * Shows the project metadata, a dropzone for uploading source photos, and
 * a thumbnail grid of what's been ingested. Bracket detection + edit-run
 * controls land in Week 2.
 */
type ProjectResponse = { project: PhotoProject };
type AssetsResponse = { assets: PhotoAsset[] };
type UploadResponse = {
  assets: PhotoAsset[];
  errors: Array<{ fileName: string; message: string }>;
  uploaded: number;
  failed: number;
  brackets: { groupsCreated: number; assetsGrouped: number } | null;
};

type BracketGroup = {
  id: number;
  projectId: number;
  captureTimeCenter: string | null;
  photoCount: number;
  status: string;
  exposureRangeEv: { min: number; max: number } | null;
  assets: PhotoAsset[];
  mergedAsset: PhotoAsset | null;
};
type BracketsResponse = { groups: BracketGroup[] };
type DetectResponse = {
  result: {
    projectId: number;
    groupsCreated: number;
    assetsGrouped: number;
    assetsUngrouped: number;
  };
};

type EditVersion = {
  id: number;
  assetId: number;
  jobId: number | null;
  versionNumber: number;
  outputUrl: string;
  /**
   * URL to the clean (unwatermarked) rendition. Populated from Week 6
   * onwards — older rows may be null, in which case the unlock endpoint
   * responds 409 and the UI shows "re-run pipeline to unlock".
   */
  cleanOutputUrl: string | null;
  watermarked: boolean | null;
  isCurrent: boolean | null;
  createdAt: string | null;
  job: {
    id: number;
    jobType: string;
    status: string;
    costCents: number | null;
    durationMs: number | null;
    completedAt: string | null;
  } | null;
};
type VersionsResponse = { versions: EditVersion[] };

type UnlockResponse = {
  url: string;
  charged: boolean;
  downloadId: number;
  versionId: number;
  balanceAfter: number;
};

type BatchUnlockResponse = {
  unlocked: Array<{
    versionId: number;
    url: string;
    charged: boolean;
    downloadId: number;
  }>;
  failed?: {
    reason: "insufficient_credits";
    required: number;
    available: number;
  };
  balance: number;
};

type BatchPlanResponse = {
  plan: {
    chargeable: number[];
    alreadyUnlocked: number[];
    missingClean: number[];
    invalid: number[];
    creditsNeeded: number;
  };
  balance: number;
};

export default function PhotosDetail() {
  const [, params] = useRoute<{ id: string }>("/photos/:id");
  const id = params?.id;

  const projectQuery = useQuery<ProjectResponse>({
    queryKey: [`/api/photo/projects/${id}`],
    enabled: !!id,
  });

  const assetsQuery = useQuery<AssetsResponse>({
    queryKey: [`/api/photo/projects/${id}/assets`],
    enabled: !!id,
  });

  const bracketsQuery = useQuery<BracketsResponse>({
    queryKey: [`/api/photo/projects/${id}/brackets`],
    enabled: !!id,
  });

  const project = projectQuery.data?.project;
  const assets = assetsQuery.data?.assets ?? [];
  const groups = bracketsQuery.data?.groups ?? [];

  // Assets in a group are rendered inside the group card; the loose grid
  // below shows only the "singles" — shots that didn't cluster with anything.
  const groupedIds = new Set(
    groups.flatMap((g) => g.assets.map((a) => a.id))
  );
  const singles = assets.filter((a) => !groupedIds.has(a.id));

  return (
    <div className="flex-1 overflow-hidden">
      <header className="bg-white shadow-sm border-b border-gray-200 px-8 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/photos">
              <Button variant="ghost" size="sm" className="text-ailldoit-muted">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Photos
              </Button>
            </Link>
            <h2 className="text-2xl font-bold text-ailldoit-black truncate">
              {project?.name ?? "Project"}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <CreditsChip />
            {id && project ? (
              <>
                <BatchUnlockButton projectId={id} groups={groups} />
                <TestQueueButton projectId={id} />
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main className="p-8 space-y-6 max-w-5xl">
        {projectQuery.isLoading && (
          <div className="flex items-center gap-2 text-ailldoit-muted">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading project…
          </div>
        )}

        {projectQuery.isError && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-5 text-sm text-red-700">
              {projectQuery.error instanceof Error
                ? projectQuery.error.message
                : "Couldn't load this project."}
            </CardContent>
          </Card>
        )}

        {project && id && (
          <>
            <Card className="bg-white">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-ailldoit-accent/10 flex items-center justify-center text-ailldoit-accent">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-ailldoit-black">{project.name}</h3>
                    {project.addressLine ? (
                      <p className="text-sm text-ailldoit-muted flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3" />
                        {project.addressLine}
                      </p>
                    ) : null}
                    <p className="text-xs text-ailldoit-muted mt-2">
                      Status: <span className="font-medium">{project.status}</span>
                      {project.createdAt
                        ? ` · Created ${new Date(project.createdAt).toLocaleString()}`
                        : null}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <UploadDropzone projectId={id} assetCount={assets.length} />

            <BracketList
              projectId={id}
              groups={groups}
              isLoading={bracketsQuery.isLoading}
              isError={bracketsQuery.isError}
              totalAssets={assets.length}
            />

            <AssetGrid
              assets={singles}
              isLoading={assetsQuery.isLoading}
              isError={assetsQuery.isError}
              label={groups.length > 0 ? "Singles" : "Source photos"}
            />
          </>
        )}
      </main>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Upload dropzone
// -----------------------------------------------------------------------------

function UploadDropzone({ projectId, assetCount }: { projectId: string; assetCount: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<Array<{ fileName: string; message: string }>>([]);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const upload = useMutation<UploadResponse, Error, File[]>({
    mutationFn: async (files) => {
      const form = new FormData();
      files.forEach((f) => form.append("files", f, f.name));

      // Fetch with the Firebase auth header, but no explicit Content-Type —
      // the browser needs to set multipart boundary itself.
      const authHeaders = await getAuthHeaders();
      // Strip Content-Type so the browser picks the multipart boundary.
      const { "Content-Type": _, ...headers } = authHeaders;

      const res = await fetch(`/api/photo/projects/${projectId}/assets`, {
        method: "POST",
        headers,
        body: form,
        credentials: "include",
      });

      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return (await res.json()) as UploadResponse;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [`/api/photo/projects/${projectId}/assets`],
      });
      // Upload handler re-runs bracket detection, so refresh the groups view.
      queryClient.invalidateQueries({
        queryKey: [`/api/photo/projects/${projectId}/brackets`],
      });
      setUploadErrors(data.errors);

      if (data.uploaded > 0) {
        const groupInfo = data.brackets && data.brackets.groupsCreated > 0
          ? ` · ${data.brackets.groupsCreated} bracket${data.brackets.groupsCreated === 1 ? "" : "s"} detected`
          : "";
        toast({
          title: `${data.uploaded} photo${data.uploaded === 1 ? "" : "s"} uploaded`,
          description: data.failed > 0
            ? `${data.failed} failed — see below.${groupInfo}`
            : `EXIF parsed${groupInfo}. Ready for the pipeline.`,
        });
      } else if (data.failed > 0) {
        toast({
          title: "Upload failed",
          description: `All ${data.failed} file(s) failed. See details below.`,
          variant: "destructive",
        });
      }
    },
    onError: (err) => {
      toast({
        title: "Upload failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    // Browsers almost never set a useful MIME type for RAW files — most
    // send an empty string or "application/octet-stream" for .CR3/.DNG
    // etc. So accept by MIME (for standard formats) OR extension (for
    // RAW). The server does the authoritative check.
    const STANDARD_MIME_RE = /^image\/(jpe?g|png|heic|heif)$/i;
    const RAW_EXT_RE = /\.(cr2|cr3|dng|nef|arw|raf|orf|rw2)$/i;
    const files = Array.from(fileList).filter(
      (f) => STANDARD_MIME_RE.test(f.type) || RAW_EXT_RE.test(f.name)
    );
    if (files.length === 0) {
      toast({
        title: "No supported images",
        description:
          "Drop JPEG, PNG, HEIC, or RAW (CR3/DNG/NEF/ARW/RAF) photos — up to 40 at a time.",
        variant: "destructive",
      });
      return;
    }
    setUploadErrors([]);
    upload.mutate(files);
  };

  return (
    <Card
      className={`transition-colors ${
        isDragging
          ? "border-ailldoit-accent bg-ailldoit-accent/5"
          : "border-dashed border-2 border-gray-200 bg-white"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <CardContent className="py-10 flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-ailldoit-accent/10 flex items-center justify-center mb-4">
          <UploadCloud className="w-7 h-7 text-ailldoit-accent" />
        </div>
        <h4 className="text-lg font-semibold text-ailldoit-black mb-1">
          {assetCount === 0 ? "Upload photos" : "Add more photos"}
        </h4>
        <p className="text-ailldoit-muted max-w-md text-sm mb-4">
          Drag JPEG or RAW brackets (3–5 exposures per scene) or single photos.
          Supports CR3, DNG, NEF, ARW, RAF — we'll extract the camera
          preview for fast edits and keep the RAW archived.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic,image/heif,.cr2,.cr3,.dng,.nef,.arw,.raf,.orf,.rw2"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className="bg-ailldoit-accent hover:bg-ailldoit-accent/90 text-white"
        >
          {upload.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <UploadCloud className="w-4 h-4 mr-2" />
              Choose photos
            </>
          )}
        </Button>
        <p className="text-xs text-ailldoit-muted mt-3">
          Up to 40 files · 120MB each · JPEG, PNG, HEIC, or RAW
        </p>

        {uploadErrors.length > 0 && (
          <div className="mt-4 w-full max-w-lg text-left">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-700 mb-2">
              <AlertTriangle className="w-4 h-4" />
              {uploadErrors.length} file{uploadErrors.length === 1 ? "" : "s"} failed
            </div>
            <ul className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-3 space-y-1">
              {uploadErrors.map((e, i) => (
                <li key={i}>
                  <span className="font-mono">{e.fileName}</span> — {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Asset grid
// -----------------------------------------------------------------------------

function AssetGrid({
  assets,
  isLoading,
  isError,
  label = "Source photos",
}: {
  assets: PhotoAsset[];
  isLoading: boolean;
  isError: boolean;
  label?: string;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-ailldoit-muted">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading photos…
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-4 text-sm text-red-700">
          Couldn't load photos for this project.
        </CardContent>
      </Card>
    );
  }

  if (assets.length === 0) {
    return null; // Dropzone or bracket section is the non-empty state
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ailldoit-black">
          {label} · {assets.length}
        </h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {assets.map((asset) => (
          <AssetThumbnail key={asset.id} asset={asset} />
        ))}
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Dev/test: queue a standalone pipeline_auto to prove the BullMQ roundtrip
// -----------------------------------------------------------------------------

function TestQueueButton({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const runTest = useMutation<
    { editJob: { id: number; status: string }; queueJobId: string },
    Error,
    void
  >({
    mutationFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/photo/projects/${projectId}/jobs/test`, {
        method: "POST",
        headers: authHeaders,
        credentials: "include",
      });
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [`/api/photo/projects/${projectId}/jobs`],
      });
      toast({
        title: "Test job queued",
        description: `editJob #${data.editJob.id} — watch the server log for ✅.`,
      });
    },
    onError: (err) => {
      toast({
        title: "Queue test failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => runTest.mutate()}
      disabled={runTest.isPending}
    >
      {runTest.isPending ? (
        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
      ) : (
        <Sparkles className="w-3 h-3 mr-1" />
      )}
      Test queue
    </Button>
  );
}

// -----------------------------------------------------------------------------
// Bracket groups
// -----------------------------------------------------------------------------

function BracketList({
  projectId,
  groups,
  isLoading,
  isError,
  totalAssets,
}: {
  projectId: string;
  groups: BracketGroup[];
  isLoading: boolean;
  isError: boolean;
  totalAssets: number;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const redetect = useMutation<DetectResponse, Error, void>({
    mutationFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(
        `/api/photo/projects/${projectId}/brackets/detect`,
        {
          method: "POST",
          headers: authHeaders,
          credentials: "include",
        }
      );
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return (await res.json()) as DetectResponse;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [`/api/photo/projects/${projectId}/brackets`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/photo/projects/${projectId}/assets`],
      });
      toast({
        title: "Brackets re-detected",
        description: `${data.result.groupsCreated} group${data.result.groupsCreated === 1 ? "" : "s"} · ${data.result.assetsGrouped} grouped · ${data.result.assetsUngrouped} singles`,
      });
    },
    onError: (err) => {
      toast({
        title: "Re-detect failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Hide the whole section when there's nothing to show and no photos yet —
  // the dropzone already tells the user to upload.
  if (totalAssets === 0 && !isLoading) return null;
  if (isError) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-4 text-sm text-red-700">
          Couldn't load bracket groups.
        </CardContent>
      </Card>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-between">
        <p className="text-xs text-ailldoit-muted flex items-center gap-2">
          <Layers className="w-3 h-3" />
          No brackets detected yet — uploads of 3+ photos in quick succession cluster automatically.
        </p>
        {totalAssets >= 2 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => redetect.mutate()}
            disabled={redetect.isPending}
          >
            {redetect.isPending ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-1" />
            )}
            Re-detect
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ailldoit-black flex items-center gap-2">
          <Layers className="w-4 h-4 text-ailldoit-accent" />
          Bracket groups · {groups.length}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => redetect.mutate()}
          disabled={redetect.isPending}
        >
          {redetect.isPending ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3 mr-1" />
          )}
          Re-detect
        </Button>
      </div>
      <div className="space-y-3">
        {groups.map((g) => (
          <BracketGroupCard key={g.id} group={g} />
        ))}
      </div>
    </section>
  );
}

function BracketGroupCard({ group }: { group: BracketGroup }) {
  const captureTime = group.captureTimeCenter ? new Date(group.captureTimeCenter) : null;
  const ev = group.exposureRangeEv;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // While a merge is in-flight we show a spinner on the card + poll the
  // brackets endpoint so the preview flips in automatically when done.
  // Starts false, set true on mutation, cleared once mergedAsset appears.
  const [awaitingMerge, setAwaitingMerge] = useState(false);

  const evLabel = ev
    ? ev.min === ev.max
      ? `${formatEv(ev.min)} EV`
      : `${formatEv(ev.min)} to ${formatEv(ev.max)} EV`
    : null;

  const runPipeline = useMutation<
    { editJob: { id: number; status: string }; queueJobId: string },
    Error,
    void
  >({
    mutationFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(
        `/api/photo/projects/${group.projectId}/brackets/${group.id}/pipeline`,
        {
          method: "POST",
          headers: authHeaders,
          credentials: "include",
        }
      );
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [`/api/photo/projects/${group.projectId}/jobs`],
      });
      setAwaitingMerge(true);
      // Poll the brackets endpoint every 1.5s until the merged asset
      // shows up. Bail at 60s to avoid a forever-loop if something failed
      // — the toast will still show the error from the job row.
      const started = Date.now();
      const interval = setInterval(async () => {
        await queryClient.invalidateQueries({
          queryKey: [`/api/photo/projects/${group.projectId}/brackets`],
        });
        if (Date.now() - started > 60_000) {
          clearInterval(interval);
          setAwaitingMerge(false);
        }
      }, 1_500);
      toast({
        title: "Pipeline queued",
        description: `Merging HDR · editJob #${data.editJob.id}`,
      });
    },
    onError: (err) => {
      toast({
        title: "Couldn't queue pipeline",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Once the merged asset arrives, the polling interval keeps running until
  // its 60s cap — but we can short-circuit the spinner UI as soon as the
  // derived asset is visible. Clearing happens in an effect to avoid
  // setState-during-render.
  useEffect(() => {
    if (awaitingMerge && group.mergedAsset) {
      setAwaitingMerge(false);
    }
  }, [awaitingMerge, group.mergedAsset]);

  const merged = group.mergedAsset;
  const isMerging = awaitingMerge || runPipeline.isPending;
  const pipelineLabel = merged ? "Re-run pipeline" : "Run pipeline";

  return (
    <Card className="bg-white">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm text-ailldoit-black">
            <span className="font-semibold">{group.photoCount} photos</span>
            {evLabel ? (
              <>
                <span className="text-ailldoit-muted">·</span>
                <span className="text-ailldoit-muted">{evLabel}</span>
              </>
            ) : null}
            {captureTime ? (
              <>
                <span className="text-ailldoit-muted">·</span>
                <span className="text-ailldoit-muted">
                  {captureTime.toLocaleString(undefined, {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-wide text-ailldoit-muted">
              {isMerging ? "merging…" : group.status}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => runPipeline.mutate()}
              disabled={runPipeline.isPending || awaitingMerge}
            >
              {isMerging ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3 mr-1" />
              )}
              {pipelineLabel}
            </Button>
          </div>
        </div>

        {merged ? (
          <MergedPreview
            mergedAsset={merged}
            sources={group.assets}
          />
        ) : awaitingMerge ? (
          <div className="mb-3 rounded-lg border border-dashed border-ailldoit-accent/30 bg-ailldoit-accent/5 flex items-center justify-center py-10 text-sm text-ailldoit-muted">
            <Loader2 className="w-4 h-4 mr-2 animate-spin text-ailldoit-accent" />
            Merging exposures — usually ~5–15s.
          </div>
        ) : null}

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2">
          {group.assets.map((asset) => (
            <AssetThumbnail key={asset.id} asset={asset} compact />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function formatEv(v: number): string {
  if (v === 0) return "0";
  const sign = v > 0 ? "+" : "";
  return `${sign}${Number.isInteger(v) ? v : v.toFixed(1)}`;
}

function AssetThumbnail({ asset, compact = false }: { asset: PhotoAsset; compact?: boolean }) {
  const [imgError, setImgError] = useState(false);
  const exif = asset.exifData as {
    captureTime?: string | null;
    iso?: number | null;
    exposureTimeSec?: number | null;
    exposureBiasEv?: number | null;
  } | null;
  const captureTime = exif?.captureTime ? new Date(exif.captureTime) : null;
  const ev = typeof exif?.exposureBiasEv === "number" ? exif.exposureBiasEv : null;

  return (
    <Card className="bg-white overflow-hidden">
      <div className="aspect-square bg-gray-100 flex items-center justify-center relative">
        {imgError ? (
          <ImageOff className="w-8 h-8 text-gray-400" />
        ) : (
          <img
            src={asset.sourceUrl}
            alt={asset.fileName}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        )}
        {compact && ev !== null ? (
          <span className="absolute bottom-1 right-1 text-[10px] font-mono text-white bg-black/60 rounded px-1">
            {ev > 0 ? `+${Number.isInteger(ev) ? ev : ev.toFixed(1)}` : Number.isInteger(ev) ? String(ev) : ev.toFixed(1)} EV
          </span>
        ) : null}
      </div>
      {!compact ? (
        <div className="p-2">
          <p className="text-xs font-medium text-ailldoit-black truncate">{asset.fileName}</p>
          <p className="text-[10px] text-ailldoit-muted truncate">
            {asset.widthPx && asset.heightPx
              ? `${asset.widthPx}×${asset.heightPx}`
              : `${Math.round(asset.sizeBytes / 1024)} KB`}
            {captureTime
              ? ` · ${captureTime.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}`
              : ""}
          </p>
        </div>
      ) : null}
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Merged preview — before/after slider + version history + download
// -----------------------------------------------------------------------------

/**
 * Renders the HDR/enhance output for a bracket group with three Week-4
 * affordances stacked:
 *   1. Before/after compare slider (source mid-exposure vs current rendition)
 *   2. Version strip — chips for each edit_versions row; click to swap
 *      which rendition the slider shows as "after"
 *   3. Download button — pulls the watermarked JPEG
 *
 * We pick the source mid-exposure by sorting on EV and taking the median.
 * That's the frame closest to what a single-shot camera would have produced,
 * which makes the comparison fair.
 */
function MergedPreview({
  mergedAsset,
  sources,
}: {
  mergedAsset: PhotoAsset;
  sources: PhotoAsset[];
}) {
  const versionsQuery = useQuery<VersionsResponse>({
    queryKey: [`/api/photo/projects/${mergedAsset.projectId}/assets/${mergedAsset.id}/versions`],
    enabled: !!mergedAsset.id,
  });

  const versions = versionsQuery.data?.versions ?? [];
  const currentVersion =
    versions.find((v) => v.isCurrent) ?? versions[0] ?? null;
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);

  // The URL driving the "after" side of the slider. Defaults to the
  // current version's URL; falls back to the merged asset directly for
  // the brief window between worker success and versions-query refetch.
  const activeVersion = selectedVersionId
    ? versions.find((v) => v.id === selectedVersionId) ?? currentVersion
    : currentVersion;
  const afterUrl = activeVersion?.outputUrl ?? mergedAsset.sourceUrl;

  const midSource = pickMidExposure(sources);
  const beforeUrl = midSource?.sourceUrl ?? sources[0]?.sourceUrl ?? afterUrl;

  return (
    <div className="mb-3 rounded-lg overflow-hidden border border-ailldoit-accent/20 bg-gray-50">
      <CompareSlider beforeUrl={beforeUrl} afterUrl={afterUrl} />
      <div className="px-3 py-2 flex items-center justify-between gap-3 text-[11px] text-ailldoit-muted">
        <span className="flex items-center gap-1.5 font-medium text-ailldoit-accent">
          <Sparkles className="w-3 h-3" />
          HDR preview · watermarked
        </span>
        <div className="flex items-center gap-2">
          {mergedAsset.widthPx && mergedAsset.heightPx ? (
            <span>
              {mergedAsset.widthPx}×{mergedAsset.heightPx}
            </span>
          ) : null}
          <PreviewDownloadButton url={afterUrl} fileName={mergedAsset.fileName} />
          {activeVersion ? (
            <UnlockAndDownloadButton
              projectId={mergedAsset.projectId}
              version={activeVersion}
              fileName={mergedAsset.fileName}
            />
          ) : null}
        </div>
      </div>
      {versions.length > 1 ? (
        <VersionStrip
          versions={versions}
          activeId={activeVersion?.id ?? null}
          onSelect={(id) => setSelectedVersionId(id)}
        />
      ) : null}
    </div>
  );
}

/** Picks the source frame whose EV is closest to 0 (the "normal" shot). */
function pickMidExposure(sources: PhotoAsset[]): PhotoAsset | null {
  if (sources.length === 0) return null;
  const sorted = [...sources].sort((a, b) => {
    const ae = Math.abs(readEv(a) ?? Infinity);
    const be = Math.abs(readEv(b) ?? Infinity);
    return ae - be;
  });
  return sorted[0];
}
function readEv(asset: PhotoAsset): number | null {
  const exif = asset.exifData as { exposureBiasEv?: number | null } | null;
  return typeof exif?.exposureBiasEv === "number" ? exif.exposureBiasEv : null;
}

/**
 * Draggable before/after slider. Uses clip-path on the "after" image layer
 * so both images occupy identical bounding boxes — no layout shift when
 * the handle moves. Pointer events work on mouse + touch + stylus via
 * the PointerEvent API.
 */
function CompareSlider({
  beforeUrl,
  afterUrl,
}: {
  beforeUrl: string;
  afterUrl: string;
}) {
  const [percent, setPercent] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const handleMove = (clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const p = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setPercent(p);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-gray-900 select-none touch-none"
      onPointerDown={(e) => {
        draggingRef.current = true;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        handleMove(e.clientX);
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) handleMove(e.clientX);
      }}
      onPointerUp={() => {
        draggingRef.current = false;
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
    >
      <img
        src={beforeUrl}
        alt="Source exposure"
        className="block w-full max-h-[520px] object-contain"
        draggable={false}
      />
      <img
        src={afterUrl}
        alt="HDR preview"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        draggable={false}
        style={{ clipPath: `inset(0 0 0 ${percent}%)` }}
      />
      {/* Handle */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.25)] pointer-events-none"
        style={{ left: `${percent}%` }}
      />
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white shadow flex items-center justify-center pointer-events-none"
        style={{ left: `${percent}%` }}
      >
        <span className="text-[10px] font-bold text-ailldoit-black">⇄</span>
      </div>
      {/* Labels */}
      <span className="absolute top-2 left-2 text-[10px] font-semibold text-white bg-black/50 rounded px-1.5 py-0.5 uppercase tracking-wide">
        Before
      </span>
      <span className="absolute top-2 right-2 text-[10px] font-semibold text-white bg-ailldoit-accent/90 rounded px-1.5 py-0.5 uppercase tracking-wide">
        After
      </span>
    </div>
  );
}

/**
 * Version chip row. Each rendition (HDR merge v1, enhance v2, future
 * WB/perspective v3+) gets a chip — click one to preview it as the
 * "after" side of the slider. Tooltip-worthy metadata (cost, duration)
 * rendered inline for now.
 */
function VersionStrip({
  versions,
  activeId,
  onSelect,
}: {
  versions: EditVersion[];
  activeId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="px-3 py-2 border-t border-gray-100 flex items-center gap-2 overflow-x-auto">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ailldoit-muted shrink-0">
        <History className="w-3 h-3" />
        Versions
      </span>
      {versions
        .slice()
        .sort((a, b) => a.versionNumber - b.versionNumber)
        .map((v) => {
          const isActive = v.id === activeId;
          const label = v.job?.jobType
            ? humaniseJobType(v.job.jobType)
            : `v${v.versionNumber}`;
          return (
            <button
              key={v.id}
              onClick={() => onSelect(v.id)}
              className={`shrink-0 text-[11px] px-2 py-1 rounded-full border transition-colors ${
                isActive
                  ? "bg-ailldoit-accent text-white border-ailldoit-accent"
                  : "bg-white text-ailldoit-muted border-gray-200 hover:border-ailldoit-accent/50"
              }`}
              title={
                v.job?.durationMs
                  ? `${label} · ${(v.job.durationMs / 1000).toFixed(1)}s${
                      v.job.costCents != null
                        ? ` · $${(v.job.costCents / 100).toFixed(2)}`
                        : ""
                    }`
                  : label
              }
            >
              v{v.versionNumber} · {label}
              {v.isCurrent ? " ·" : ""}
              {v.isCurrent ? <span className="ml-1">●</span> : null}
            </button>
          );
        })}
    </div>
  );
}

function humaniseJobType(jobType: string): string {
  switch (jobType) {
    case "hdr_merge":
      return "HDR";
    case "enhance":
      return "Polish";
    case "white_balance":
      return "WB";
    case "perspective":
      return "Perspective";
    case "window_pull":
      return "Window";
    case "sky_replace":
      return "Sky";
    case "pipeline_auto":
      return "Auto";
    default:
      return jobType;
  }
}

/**
 * Free-tier preview download — watermarked rendition. No credits charged.
 * Pulled via fetch → object URL so we can set a nice filename (hitting the
 * Firebase signed URL with a download attribute leaves the storage key).
 */
function PreviewDownloadButton({ url, fileName }: { url: string; fileName: string }) {
  const [pending, setPending] = useState(false);
  const { toast } = useToast();

  const handleClick = async () => {
    try {
      setPending(true);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      await triggerBlobDownload(blob, prefixFileName(fileName, "preview"));
    } catch (err) {
      toast({
        title: "Download failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-[11px]"
      onClick={handleClick}
      disabled={pending}
      title="Download the watermarked preview (free)"
    >
      {pending ? (
        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
      ) : (
        <Download className="w-3 h-3 mr-1" />
      )}
      Preview
    </Button>
  );
}

/**
 * Paid unlock + download (1 credit). Calls the unlock endpoint, which is
 * idempotent per-org-per-version — repeat clicks after the first don't
 * re-bill. On 402 we pop the top-up modal seeded with the shortfall so the
 * user can buy credits in one click.
 */
function UnlockAndDownloadButton({
  projectId,
  version,
  fileName,
}: {
  projectId: number;
  version: EditVersion;
  fileName: string;
}) {
  const [pending, setPending] = useState(false);
  const [insufficient, setInsufficient] = useState<{
    required: number;
    available: number;
  } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Pre-Week-6 renditions have no clean URL — disable the button and
  // surface the "re-run pipeline" guidance so users don't keep clicking.
  const noClean = !version.cleanOutputUrl;

  const handleClick = async () => {
    if (noClean) return;
    try {
      setPending(true);
      const res = await fetch(
        `/api/photo/projects/${projectId}/versions/${version.id}/unlock`,
        {
          method: "POST",
          headers: await getAuthHeaders(),
          credentials: "include",
        }
      );

      if (res.status === 402) {
        const body = (await res.json()) as {
          required: number;
          available: number;
        };
        setInsufficient({ required: body.required, available: body.available });
        return;
      }
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }

      const data = (await res.json()) as UnlockResponse;
      // Fetch clean bytes and trigger download. We could `<a href>` the
      // signed URL directly, but fetch-and-blob lets us set a nice filename.
      const cleanRes = await fetch(data.url);
      if (!cleanRes.ok) {
        throw new Error(`Clean download failed: ${cleanRes.status}`);
      }
      const blob = await cleanRes.blob();
      await triggerBlobDownload(blob, prefixFileName(fileName, "clean"));

      // Refresh the balance chip. If we didn't actually charge (already
      // unlocked), the invalidation is still cheap and keeps the UI honest.
      queryClient.invalidateQueries({
        queryKey: ["/api/photo/credits/balance"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/photo/credits/ledger"],
      });

      toast({
        title: data.charged ? "1 credit spent" : "Already unlocked",
        description: data.charged
          ? `Clean rendition downloaded · ${data.balanceAfter} credits remaining`
          : `You've already paid for this version. Free re-download.`,
      });
    } catch (err) {
      toast({
        title: "Unlock failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        className={`h-6 px-2 text-[11px] ${
          noClean
            ? "bg-gray-100 text-gray-400"
            : "bg-ailldoit-accent hover:bg-ailldoit-accent/90 text-white"
        }`}
        onClick={handleClick}
        disabled={pending || noClean}
        title={
          noClean
            ? "Pre-Week-6 version — re-run the pipeline to generate a clean rendition"
            : "Spend 1 credit to download the full-res, unwatermarked image"
        }
        data-testid={`unlock-version-${version.id}`}
      >
        {pending ? (
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        ) : noClean ? (
          <Lock className="w-3 h-3 mr-1" />
        ) : (
          <Unlock className="w-3 h-3 mr-1" />
        )}
        {noClean ? "No clean rendition" : "Unlock (1 credit)"}
      </Button>
      <InsufficientCreditsDialog
        open={!!insufficient}
        onOpenChange={(v) => !v && setInsufficient(null)}
        required={insufficient?.required ?? 0}
        available={insufficient?.available ?? 0}
      />
    </>
  );
}

/**
 * Project-level batch unlock: collects the current rendition for every
 * bracket group that has one, plans the debit, confirms with the user, then
 * unlocks and streams the resulting ZIP. Splits payment (unlock) from
 * delivery (zip) so a flaky browser retry doesn't re-bill.
 */
function BatchUnlockButton({
  projectId,
  groups,
}: {
  projectId: string;
  groups: BracketGroup[];
}) {
  const [planOpen, setPlanOpen] = useState(false);
  const [plan, setPlan] = useState<BatchPlanResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [insufficient, setInsufficient] = useState<{
    required: number;
    available: number;
  } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Candidate version ids: one per bracket group's current merged asset's
  // current version. We hit the versions endpoint per asset to know the
  // current version id — but since we already render those ids on the page
  // we can collect them from the cached queries.
  const candidateAssetIds = groups
    .map((g) => g.mergedAsset?.id)
    .filter((id): id is number => typeof id === "number");

  const openPlan = async () => {
    if (candidateAssetIds.length === 0) {
      toast({
        title: "Nothing to unlock yet",
        description:
          "Run the pipeline on at least one bracket first — then come back to download the clean batch.",
      });
      return;
    }
    try {
      setPending(true);
      // Collect current version ids for each merged asset. Fetches run in
      // parallel (Promise.all) — each call is independent and the results
      // are mostly cache hits on the React Query store anyway.
      const perAsset = await Promise.all(
        candidateAssetIds.map(async (assetId) => {
          const cached = queryClient.getQueryData<VersionsResponse>([
            `/api/photo/projects/${projectId}/assets/${assetId}/versions`,
          ]);
          const versions =
            cached?.versions ??
            (await (async () => {
              const r = await fetch(
                `/api/photo/projects/${projectId}/assets/${assetId}/versions`,
                { headers: await getAuthHeaders(), credentials: "include" }
              );
              if (!r.ok) return [] as EditVersion[];
              return (((await r.json()) as VersionsResponse).versions ?? []);
            })());
          const current =
            versions.find((v) => v.isCurrent) ??
            versions
              .slice()
              .sort((a, b) => b.versionNumber - a.versionNumber)[0];
          return current?.cleanOutputUrl ? current.id : null;
        })
      );
      const versionIds = perAsset.filter(
        (id): id is number => typeof id === "number"
      );

      if (versionIds.length === 0) {
        toast({
          title: "No clean renditions available",
          description:
            "Re-run the pipeline on your brackets — older versions don't have clean renditions yet.",
        });
        return;
      }

      // Plan — no debit, just "how many credits will this cost".
      const res = await apiRequest(
        "POST",
        `/api/photo/projects/${projectId}/versions/batch-unlock`,
        { versionIds, planOnly: true }
      );
      const data = (await res.json()) as BatchPlanResponse;
      setPlan(data);
      setPlanOpen(true);
    } catch (err) {
      toast({
        title: "Couldn't plan batch",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  };

  const confirmDownload = async () => {
    if (!plan) return;
    try {
      setPending(true);

      const allIds = [...plan.plan.chargeable, ...plan.plan.alreadyUnlocked];
      if (allIds.length === 0) {
        toast({
          title: "Nothing to download",
          description: "None of the requested versions have a clean rendition.",
        });
        setPlanOpen(false);
        return;
      }

      // Debit credits for the chargeable set. Already-unlocked ids are
      // tolerated by the unlock endpoint (idempotent) so we can pass the
      // union and not worry about reconciliation here.
      if (plan.plan.chargeable.length > 0) {
        const unlockRes = await apiRequest(
          "POST",
          `/api/photo/projects/${projectId}/versions/batch-unlock`,
          { versionIds: plan.plan.chargeable }
        );
        const unlockData = (await unlockRes.json()) as BatchUnlockResponse;
        if (unlockData.failed?.reason === "insufficient_credits") {
          setInsufficient({
            required: unlockData.failed.required,
            available: unlockData.failed.available,
          });
          // Partial-fulfilment handling: keep the already-charged subset —
          // those ids will still download correctly in the ZIP.
          // We refresh balance and fall through so the user at least gets
          // the photos they paid for.
        }
        queryClient.invalidateQueries({
          queryKey: ["/api/photo/credits/balance"],
        });
        queryClient.invalidateQueries({
          queryKey: ["/api/photo/credits/ledger"],
        });
      }

      // Now stream the zip. Re-query the plan so we don't ask for versions
      // the user couldn't afford (partial fulfilment).
      const replanRes = await apiRequest(
        "POST",
        `/api/photo/projects/${projectId}/versions/batch-unlock`,
        { versionIds: allIds, planOnly: true }
      );
      const replan = (await replanRes.json()) as BatchPlanResponse;
      const downloadableIds = replan.plan.alreadyUnlocked;
      if (downloadableIds.length === 0) {
        setPlanOpen(false);
        return;
      }

      const zipUrl =
        `/api/photo/projects/${projectId}/versions/download.zip` +
        `?versionIds=${downloadableIds.join(",")}`;
      const zipRes = await fetch(zipUrl, {
        headers: await getAuthHeaders(),
        credentials: "include",
      });
      if (!zipRes.ok) {
        const text = (await zipRes.text()) || zipRes.statusText;
        throw new Error(`${zipRes.status}: ${text}`);
      }
      const blob = await zipRes.blob();
      await triggerBlobDownload(
        blob,
        `ailldoit-project-${projectId}-${Date.now()}.zip`
      );

      toast({
        title: `Downloaded ${downloadableIds.length} clean rendition${downloadableIds.length === 1 ? "" : "s"}`,
        description:
          plan.plan.chargeable.length > 0
            ? `${plan.plan.chargeable.length} newly unlocked · ${plan.plan.alreadyUnlocked.length} previously paid`
            : "All were previously unlocked — no credits spent.",
      });

      setPlanOpen(false);
      setPlan(null);
    } catch (err) {
      toast({
        title: "Batch download failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  };

  const creditsNeeded = plan?.plan.creditsNeeded ?? 0;
  const balance = plan?.balance ?? 0;
  const canAfford = balance >= creditsNeeded;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={openPlan}
        disabled={pending || candidateAssetIds.length === 0}
        data-testid="batch-unlock-button"
      >
        {pending ? (
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        ) : (
          <Package className="w-3 h-3 mr-1" />
        )}
        Download all clean
      </Button>
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Download all clean renditions</DialogTitle>
            <DialogDescription>
              One credit per version. Already-unlocked versions are free.
            </DialogDescription>
          </DialogHeader>
          {plan ? (
            <div className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-ailldoit-muted">New unlocks</span>
                <span className="font-medium">
                  {plan.plan.chargeable.length} ×{" "}
                  <Coins className="w-3 h-3 inline" /> {creditsNeeded} credit
                  {creditsNeeded === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ailldoit-muted">Already unlocked</span>
                <span className="font-medium">
                  {plan.plan.alreadyUnlocked.length} · free
                </span>
              </div>
              {plan.plan.missingClean.length > 0 ? (
                <div className="flex justify-between text-amber-700">
                  <span>Missing clean rendition</span>
                  <span className="font-medium">
                    {plan.plan.missingClean.length} skipped
                  </span>
                </div>
              ) : null}
              <div className="h-px bg-gray-200 my-2" />
              <div className="flex justify-between">
                <span className="text-ailldoit-muted">Your balance</span>
                <span
                  className={`font-medium ${canAfford ? "text-emerald-700" : "text-red-700"}`}
                >
                  {balance} credit{balance === 1 ? "" : "s"}
                </span>
              </div>
              {!canAfford ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  You'll unlock the first {balance} versions; the remaining{" "}
                  {creditsNeeded - balance} need a top-up.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-ailldoit-muted">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Planning…
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPlanOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDownload}
              disabled={pending || !plan}
              className="bg-ailldoit-accent hover:bg-ailldoit-accent/90 text-white"
            >
              {pending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Downloading…
                </>
              ) : creditsNeeded > 0 ? (
                `Spend ${Math.min(creditsNeeded, balance)} & download`
              ) : (
                "Download ZIP"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <InsufficientCreditsDialog
        open={!!insufficient}
        onOpenChange={(v) => !v && setInsufficient(null)}
        required={insufficient?.required ?? 0}
        available={insufficient?.available ?? 0}
      />
    </>
  );
}

/**
 * Shared 402 prompt. Keeps the copy + CTA consistent between the per-version
 * unlock and the batch path. Dispatches a window event the CreditsChip
 * can listen to — or simply tells the user to click the chip — we go with
 * the latter for MVP since a cross-component bus is overkill.
 */
function InsufficientCreditsDialog({
  open,
  onOpenChange,
  required,
  available,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  required: number;
  available: number;
}) {
  const shortfall = Math.max(0, required - available);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-600" />
            Top up to finish unlocking
          </DialogTitle>
          <DialogDescription>
            You need {shortfall} more credit{shortfall === 1 ? "" : "s"} to
            unlock this. Your balance is {available}
            {required > 1 ? ` · ${required} required` : ""}.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-ailldoit-muted">
          Click <span className="font-medium">Buy</span> on the credits chip in
          the header to purchase a top-up pack. You'll come back here
          automatically after checkout.
        </p>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Download helpers
// ─────────────────────────────────────────────────────────────────────────────

async function triggerBlobDownload(blob: Blob, fileName: string): Promise<void> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Inserts a suffix before the file extension, e.g. "shot.jpg" + "clean" → "shot-clean.jpg" */
function prefixFileName(fileName: string, suffix: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return `${fileName}-${suffix}`;
  return `${fileName.slice(0, dot)}-${suffix}${fileName.slice(dot)}`;
}
