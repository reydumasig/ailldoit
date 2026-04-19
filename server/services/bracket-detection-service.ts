/**
 * Bracket detection — groups source photos into HDR bracket sets.
 *
 * Real-estate photographers shoot scenes as 3–7 bracketed exposures (usually
 * something like -2/-1/0/+1/+2 EV). These frames are taken in quick succession
 * (burst mode, 0.5–2s apart), so the most reliable heuristic is:
 *
 *   1. Sort all source assets by capture time.
 *   2. Walk the sequence and start a new cluster whenever the gap to the
 *      previous frame exceeds TIME_WINDOW_SEC.
 *   3. Any cluster with ≥ 2 frames is a bracket candidate. Singles stay
 *      ungrouped (bracketGroupId = null). We record the exposure spread so
 *      the UI can show "3 photos · −2 to +2 EV · 2:14 PM".
 *
 * This runs cheap (tens of milliseconds for hundreds of photos) and is
 * idempotent — re-running blows away the old groups and rebuilds. That
 * "nuke + rebuild" works for MVP because bracket groups aren't
 * user-editable yet; once users can *confirm* or *split* groups we'll need
 * a merge strategy instead.
 */

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db";
import {
  bracketGroups,
  photoAssets,
  type PhotoAsset,
} from "@shared/schema";

/** Max gap between adjacent frames to still count as the same bracket set. */
const TIME_WINDOW_SEC = 2.5;

/** An asset enriched with the fields we need for clustering. */
interface Clusterable {
  id: number;
  captureAt: Date;
  exposureBiasEv: number | null;
  exposureTimeSec: number | null;
}

export interface BracketDetectionResult {
  projectId: number;
  groupsCreated: number;
  assetsGrouped: number;
  assetsUngrouped: number;
}

export interface BracketGroupWithAssets {
  id: number;
  projectId: number;
  captureTimeCenter: Date | null;
  photoCount: number;
  status: string;
  exposureRangeEv: { min: number; max: number } | null;
  assets: PhotoAsset[];
  /** Present once an hdr_merge job has written an output. */
  mergedAsset: PhotoAsset | null;
}

export class BracketDetectionService {
  /**
   * Re-run detection for a whole project. Safe to call on every upload —
   * a 200-photo project takes <50ms end-to-end (two SELECTs + one DELETE +
   * one INSERT-many + one UPDATE-many).
   */
  async detectForProject(projectId: number): Promise<BracketDetectionResult> {
    const assets = await db
      .select()
      .from(photoAssets)
      .where(
        and(
          eq(photoAssets.projectId, projectId),
          // Source photos only — derived assets (HDR merges, edits) have
          // derivedFromJobId set and shouldn't participate in grouping.
          isNotNull(photoAssets.sourceUrl)
        )
      );

    const clusterable = assets
      .map((a) => {
        const exif = a.exifData as {
          captureTime?: string | null;
          exposureBiasEv?: number | null;
          exposureTimeSec?: number | null;
        } | null;
        const captureTime = exif?.captureTime ? new Date(exif.captureTime) : null;
        if (!captureTime || Number.isNaN(+captureTime)) return null;
        return {
          id: a.id,
          captureAt: captureTime,
          exposureBiasEv: exif?.exposureBiasEv ?? null,
          exposureTimeSec: exif?.exposureTimeSec ?? null,
        } satisfies Clusterable;
      })
      .filter((x): x is Clusterable => x !== null)
      .sort((a, b) => +a.captureAt - +b.captureAt);

    const clusters = this.cluster(clusterable);
    const bracketClusters = clusters.filter((c) => c.length >= 2);

    // Atomic rebuild. We take the "delete + re-insert" approach because
    // bracket groups have no user-editable state yet (no confirmation,
    // no manual splits). When that lands we'll do a diff-based update.
    const result = await db.transaction(async (tx) => {
      // 1. Null out bracket pointers on all assets in this project so we
      //    don't leave dangling FKs when we drop the groups.
      await tx
        .update(photoAssets)
        .set({ bracketGroupId: null })
        .where(eq(photoAssets.projectId, projectId));

      // 2. Drop existing groups (empties the table for this project).
      await tx.delete(bracketGroups).where(eq(bracketGroups.projectId, projectId));

      if (bracketClusters.length === 0) {
        return {
          groupsCreated: 0,
          assetsGrouped: 0,
        };
      }

      // 3. Insert the new groups.
      const groupRows = await tx
        .insert(bracketGroups)
        .values(
          bracketClusters.map((cluster) => ({
            projectId,
            captureTimeCenter: medianTime(cluster),
            photoCount: cluster.length,
            status: "detected" as const,
          }))
        )
        .returning();

      // 4. Attach each asset in the cluster to its new group. We run an
      //    UPDATE per group rather than per asset — N groups ≪ N*size assets.
      let assetsGrouped = 0;
      for (let i = 0; i < bracketClusters.length; i++) {
        const group = groupRows[i];
        const cluster = bracketClusters[i];
        await tx
          .update(photoAssets)
          .set({ bracketGroupId: group.id })
          .where(
            and(
              eq(photoAssets.projectId, projectId),
              inArray(
                photoAssets.id,
                cluster.map((c) => c.id)
              )
            )
          );
        assetsGrouped += cluster.length;
      }

      return {
        groupsCreated: groupRows.length,
        assetsGrouped,
      };
    });

    return {
      projectId,
      groupsCreated: result.groupsCreated,
      assetsGrouped: result.assetsGrouped,
      assetsUngrouped: assets.length - result.assetsGrouped,
    };
  }

  /**
   * List every bracket group in a project with its member assets inlined,
   * ordered by capture time. Used by the detail page + HDR merge workflow.
   */
  async listForProject(projectId: number): Promise<BracketGroupWithAssets[]> {
    const [groups, assets] = await Promise.all([
      db
        .select()
        .from(bracketGroups)
        .where(eq(bracketGroups.projectId, projectId)),
      db
        .select()
        .from(photoAssets)
        .where(eq(photoAssets.projectId, projectId)),
    ]);

    // Split in one pass: source photos go in the group members map,
    // derived (HDR merge outputs, edits) are indexed by id so we can join
    // on group.mergedAssetId.
    const assetsByGroup = new Map<number, PhotoAsset[]>();
    const assetsById = new Map<number, PhotoAsset>();
    for (const asset of assets) {
      assetsById.set(asset.id, asset);
      // Source photos (no derivedFromJobId) that belong to a group.
      if (asset.bracketGroupId != null && asset.derivedFromJobId == null) {
        const bucket = assetsByGroup.get(asset.bracketGroupId) ?? [];
        bucket.push(asset);
        assetsByGroup.set(asset.bracketGroupId, bucket);
      }
    }

    return groups
      .map((g) => {
        const members = (assetsByGroup.get(g.id) ?? []).sort(
          (a, b) => captureMs(a) - captureMs(b)
        );
        const mergedAsset = g.mergedAssetId ? assetsById.get(g.mergedAssetId) ?? null : null;
        return {
          id: g.id,
          projectId: g.projectId,
          captureTimeCenter: g.captureTimeCenter,
          photoCount: g.photoCount,
          status: g.status,
          exposureRangeEv: exposureRange(members),
          assets: members,
          mergedAsset,
        } satisfies BracketGroupWithAssets;
      })
      .sort((a, b) => {
        const aT = a.captureTimeCenter ? +a.captureTimeCenter : 0;
        const bT = b.captureTimeCenter ? +b.captureTimeCenter : 0;
        return aT - bT;
      });
  }

  /**
   * Single-linkage clustering on capture time. Items are already sorted
   * ascending; we start a new cluster whenever the gap to the previous
   * item exceeds TIME_WINDOW_SEC.
   */
  private cluster(items: Clusterable[]): Clusterable[][] {
    if (items.length === 0) return [];

    const clusters: Clusterable[][] = [];
    let current: Clusterable[] = [items[0]];

    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1];
      const gapSec = (+items[i].captureAt - +prev.captureAt) / 1000;
      if (gapSec <= TIME_WINDOW_SEC) {
        current.push(items[i]);
      } else {
        clusters.push(current);
        current = [items[i]];
      }
    }
    clusters.push(current);
    return clusters;
  }
}

function medianTime(cluster: Clusterable[]): Date {
  const sorted = [...cluster].sort((a, b) => +a.captureAt - +b.captureAt);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? new Date((+sorted[mid - 1].captureAt + +sorted[mid].captureAt) / 2)
    : sorted[mid].captureAt;
}

function captureMs(asset: PhotoAsset): number {
  const exif = asset.exifData as { captureTime?: string | null } | null;
  if (!exif?.captureTime) return 0;
  const t = new Date(exif.captureTime);
  return Number.isNaN(+t) ? 0 : +t;
}

function exposureRange(assets: PhotoAsset[]): { min: number; max: number } | null {
  const evs: number[] = [];
  for (const asset of assets) {
    const exif = asset.exifData as { exposureBiasEv?: number | null } | null;
    if (typeof exif?.exposureBiasEv === "number") evs.push(exif.exposureBiasEv);
  }
  if (evs.length === 0) return null;
  return { min: Math.min(...evs), max: Math.max(...evs) };
}

export const bracketDetectionService = new BracketDetectionService();
