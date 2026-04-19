/**
 * Photo project service — owns the /photos top-level container.
 *
 * A project = one photographer's job on one property / shoot. It holds the
 * uploaded source assets, the detected bracket groups, the derived edit
 * jobs + versions, and the delivery status. Scoped to an org.
 *
 * MVP endpoints (server/routes/photo-routes.ts):
 *   - POST /api/photo/projects       → create
 *   - GET  /api/photo/projects       → list all projects in user's active org
 *   - GET  /api/photo/projects/:id   → detail (assets + bracket groups will
 *                                      land in the upload increment)
 *
 * Upload + asset endpoints live in a separate service (photo-asset-service,
 * not yet written) to keep this focused on project lifecycle.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  photoProjects,
  type PhotoProject,
  type PhotoProjectStatus,
} from "@shared/schema";

export interface CreateProjectInput {
  orgId: string;
  userId: string;       // created_by
  name: string;
  addressLine?: string | null;
  settings?: Record<string, unknown> | null;
}

export class PhotoProjectService {
  /** List every project in an org, newest-first. */
  async listByOrg(orgId: string): Promise<PhotoProject[]> {
    return db
      .select()
      .from(photoProjects)
      .where(eq(photoProjects.orgId, orgId))
      .orderBy(desc(photoProjects.createdAt));
  }

  /**
   * Fetch a project by id but only if it belongs to the caller's org.
   * Returns null (not throws) when not found so the route can decide the
   * right status code.
   */
  async getByIdForOrg(id: number, orgId: string): Promise<PhotoProject | null> {
    const [project] = await db
      .select()
      .from(photoProjects)
      .where(and(eq(photoProjects.id, id), eq(photoProjects.orgId, orgId)))
      .limit(1);
    return project ?? null;
  }

  async create(input: CreateProjectInput): Promise<PhotoProject> {
    const [created] = await db
      .insert(photoProjects)
      .values({
        orgId: input.orgId,
        userId: input.userId,
        name: input.name.trim(),
        addressLine: input.addressLine?.trim() || null,
        settings: input.settings ?? null,
        status: "draft" satisfies PhotoProjectStatus,
      })
      .returning();
    return created;
  }
}

export const photoProjectService = new PhotoProjectService();
