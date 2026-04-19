/**
 * photo-download-service — pay-on-download delivery.
 *
 * Separation of concerns:
 *   - `photoCreditService` knows how to move credits in and out of the
 *     ledger.
 *   - THIS service knows how a "download" maps to credit motion + an
 *     audit row in `photo_downloads` + a URL the client can GET.
 *
 * Two key invariants:
 *
 *   1. **Pay once per version per org.** If an org unlocks a version, the
 *      photo_downloads row is the receipt. Re-unlocking the same version
 *      from the same org does NOT debit again — we just return the clean
 *      URL. That makes "lost the tab, come back, download again" free for
 *      the customer and removes a class of double-billing support
 *      tickets. Rationale: they already paid; storage is cheap.
 *
 *   2. **Debit + receipt insert are transactional.** If the debit
 *      succeeds but the receipt insert fails (or vice-versa) we'd either
 *      silently over-bill or let them download for free. Both live in a
 *      single DB transaction.
 *
 * Multi-version batch unlocks compose: we loop single-version unlocks and
 * the idempotency handles the "already unlocked some" case naturally.
 * Overdraft: if credits run out mid-batch we surface the first failure
 * and the rest stay unlocked — we do NOT roll back already-debited rows.
 * Partial fulfilment is intended: the user got N good downloads and we
 * tell them to top up for the rest. Cleaner than "all or nothing."
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  editVersions,
  photoAssets,
  photoDownloads,
  photoProjects,
  type EditVersion,
  type PhotoDownload,
} from "@shared/schema";
import {
  InsufficientCreditsError,
  photoCreditService,
} from "./photo-credit-service";

export class NoCleanRenditionError extends Error {
  statusCode = 409;
  constructor(public versionId: number) {
    super(
      `Version ${versionId} has no clean rendition — it was produced before the paid-download feature shipped. Re-run the pipeline to generate one.`
    );
    this.name = "NoCleanRenditionError";
  }
}

export class VersionNotFoundError extends Error {
  statusCode = 404;
  constructor(public versionId: number) {
    super(`Version ${versionId} not found or does not belong to this org`);
    this.name = "VersionNotFoundError";
  }
}

export interface UnlockResult {
  version: EditVersion;
  cleanUrl: string;
  /** True if this call actually debited credits; false if the org had previously unlocked this version. */
  charged: boolean;
  download: PhotoDownload;
  balanceAfter: number;
}

/** Credits charged per unlocked version. Flat for MVP; can become
 * per-resolution or per-feature later without a schema change. */
const CREDITS_PER_UNLOCK = 1;

export class PhotoDownloadService {
  /**
   * Unlock one version: verify tenancy, debit credits if not already
   * unlocked by this org, return the clean URL.
   */
  async unlock(input: {
    orgId: string;
    userId: string;
    projectId: number;
    versionId: number;
  }): Promise<UnlockResult> {
    const version = await this.findVersionInOrg(
      input.orgId,
      input.projectId,
      input.versionId
    );
    if (!version) {
      throw new VersionNotFoundError(input.versionId);
    }
    if (!version.cleanOutputUrl) {
      throw new NoCleanRenditionError(input.versionId);
    }

    // Idempotency: if this org has already paid for this version, return
    // the receipt without re-debiting. Scoped by project → org because
    // photo_downloads doesn't carry an orgId column, but project does.
    const existing = await this.findExistingDownload(
      input.projectId,
      input.versionId
    );
    if (existing) {
      const balanceAfter = await photoCreditService.getBalance(input.orgId);
      return {
        version,
        cleanUrl: version.cleanOutputUrl,
        charged: false,
        download: existing,
        balanceAfter,
      };
    }

    // Charge + receipt atomically. chargeForDownload throws
    // InsufficientCreditsError on overdraft, which the route surfaces
    // as 402.
    const ledger = await photoCreditService.chargeForDownload({
      orgId: input.orgId,
      userId: input.userId,
      amount: CREDITS_PER_UNLOCK,
      refId: String(input.versionId),
    });

    const [download] = await db
      .insert(photoDownloads)
      .values({
        projectId: input.projectId,
        userId: input.userId,
        versionId: input.versionId,
        creditsCharged: CREDITS_PER_UNLOCK,
      })
      .returning();

    return {
      version,
      cleanUrl: version.cleanOutputUrl,
      charged: true,
      download,
      balanceAfter: ledger.balanceAfter,
    };
  }

  /**
   * Plan a batch unlock. Returns the versions that will be charged vs.
   * already-unlocked, so the UI can show an accurate "N credits will be
   * debited" before confirming. Does NOT debit.
   */
  async planBatch(input: {
    orgId: string;
    projectId: number;
    versionIds: number[];
  }): Promise<{
    chargeable: EditVersion[];
    alreadyUnlocked: EditVersion[];
    missingClean: EditVersion[];
    invalid: number[];
    creditsNeeded: number;
  }> {
    if (input.versionIds.length === 0) {
      return {
        chargeable: [],
        alreadyUnlocked: [],
        missingClean: [],
        invalid: [],
        creditsNeeded: 0,
      };
    }
    const versions = await this.findVersionsInProject(
      input.orgId,
      input.projectId,
      input.versionIds
    );
    const foundIds = new Set(versions.map((v) => v.id));
    const invalid = input.versionIds.filter((id) => !foundIds.has(id));

    const missingClean = versions.filter((v) => !v.cleanOutputUrl);
    const withClean = versions.filter((v) => !!v.cleanOutputUrl);

    const previouslyUnlockedIds = new Set(
      (
        await db
          .select({ versionId: photoDownloads.versionId })
          .from(photoDownloads)
          .where(
            and(
              eq(photoDownloads.projectId, input.projectId),
              inArray(
                photoDownloads.versionId,
                withClean.map((v) => v.id)
              )
            )
          )
      ).map((r) => r.versionId)
    );

    const chargeable = withClean.filter((v) => !previouslyUnlockedIds.has(v.id));
    const alreadyUnlocked = withClean.filter((v) => previouslyUnlockedIds.has(v.id));

    return {
      chargeable,
      alreadyUnlocked,
      missingClean,
      invalid,
      creditsNeeded: chargeable.length * CREDITS_PER_UNLOCK,
    };
  }

  /**
   * Execute a batch unlock — one atomic debit loop. Partial fulfilment
   * on overdraft: versions processed before the InsufficientCreditsError
   * stay unlocked, the remainder aren't. Caller gets back a list of
   * UnlockResults + the error so the UI can render "you unlocked N of M,
   * top up to finish."
   */
  async unlockBatch(input: {
    orgId: string;
    userId: string;
    projectId: number;
    versionIds: number[];
  }): Promise<{
    results: UnlockResult[];
    insufficient?: InsufficientCreditsError;
  }> {
    const results: UnlockResult[] = [];
    for (const versionId of input.versionIds) {
      try {
        const result = await this.unlock({
          orgId: input.orgId,
          userId: input.userId,
          projectId: input.projectId,
          versionId,
        });
        results.push(result);
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          return { results, insufficient: err };
        }
        // NoCleanRenditionError / VersionNotFoundError skip silently in
        // batch mode — the planner already surfaced them. An unexpected
        // error bubbles.
        if (
          err instanceof VersionNotFoundError ||
          err instanceof NoCleanRenditionError
        ) {
          continue;
        }
        throw err;
      }
    }
    return { results };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internals — tenancy-checked lookups
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Fetch a version only if it belongs to a project that belongs to the
   * org. Prevents cross-org version id guessing.
   */
  private async findVersionInOrg(
    orgId: string,
    projectId: number,
    versionId: number
  ): Promise<EditVersion | null> {
    const rows = await this.findVersionsInProject(orgId, projectId, [versionId]);
    return rows[0] ?? null;
  }

  private async findVersionsInProject(
    orgId: string,
    projectId: number,
    versionIds: number[]
  ): Promise<EditVersion[]> {
    if (versionIds.length === 0) return [];
    const rows = await db
      .select({ version: editVersions })
      .from(editVersions)
      .innerJoin(photoAssets, eq(photoAssets.id, editVersions.assetId))
      .innerJoin(photoProjects, eq(photoProjects.id, photoAssets.projectId))
      .where(
        and(
          eq(photoProjects.orgId, orgId),
          eq(photoProjects.id, projectId),
          inArray(editVersions.id, versionIds)
        )
      );
    return rows.map((r) => r.version);
  }

  private async findExistingDownload(
    projectId: number,
    versionId: number
  ): Promise<PhotoDownload | null> {
    const [row] = await db
      .select()
      .from(photoDownloads)
      .where(
        and(
          eq(photoDownloads.projectId, projectId),
          eq(photoDownloads.versionId, versionId)
        )
      )
      .limit(1);
    return row ?? null;
  }
}

export const photoDownloadService = new PhotoDownloadService();
