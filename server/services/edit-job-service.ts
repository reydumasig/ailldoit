/**
 * Edit-job service — owns the edit_jobs table.
 *
 * Job lifecycle in our system:
 *   1. Client triggers a pipeline / edit → route handler calls createJob()
 *      which inserts a row with status='queued' and returns the editJobId.
 *   2. Route handler enqueues a BullMQ job carrying that editJobId.
 *   3. Worker hydrates the row, calls markRunning(), does work, then
 *      markSucceeded() or markFailed() depending on outcome.
 *
 * The BullMQ job carries only the DB id, not the payload — inputParams +
 * provider + everything else lives on the row. One source of truth; the
 * queue layer becomes easy to swap.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  editJobs,
  type EditJob,
  type EditJobStatus,
  type EditJobType,
  type InsertEditJob,
} from "@shared/schema";

export interface CreateEditJobInput {
  projectId: number;
  userId: string;
  jobType: EditJobType;
  assetId?: number | null;
  bracketGroupId?: number | null;
  provider?: string | null;
  inputParams?: Record<string, unknown> | null;
}

export class EditJobService {
  async create(input: CreateEditJobInput): Promise<EditJob> {
    const insert: InsertEditJob = {
      projectId: input.projectId,
      userId: input.userId,
      jobType: input.jobType,
      assetId: input.assetId ?? null,
      bracketGroupId: input.bracketGroupId ?? null,
      provider: input.provider ?? null,
      inputParams: input.inputParams ?? null,
      status: "queued" satisfies EditJobStatus,
    };
    const [row] = await db.insert(editJobs).values(insert).returning();
    return row;
  }

  async getById(id: number): Promise<EditJob | null> {
    const rows = await db.select().from(editJobs).where(eq(editJobs.id, id));
    return rows[0] ?? null;
  }

  async listForProject(projectId: number): Promise<EditJob[]> {
    return db.select().from(editJobs).where(eq(editJobs.projectId, projectId));
  }

  async markRunning(id: number): Promise<void> {
    await db
      .update(editJobs)
      .set({
        status: "running" satisfies EditJobStatus,
        startedAt: new Date(),
      })
      .where(
        and(eq(editJobs.id, id), eq(editJobs.status, "queued" satisfies EditJobStatus))
      );
  }

  async markSucceeded(
    id: number,
    patch: {
      outputAssetId?: number | null;
      costCents?: number | null;
      durationMs?: number | null;
    } = {}
  ): Promise<void> {
    await db
      .update(editJobs)
      .set({
        status: "succeeded" satisfies EditJobStatus,
        completedAt: new Date(),
        outputAssetId: patch.outputAssetId ?? null,
        costCents: patch.costCents ?? null,
        durationMs: patch.durationMs ?? null,
      })
      .where(eq(editJobs.id, id));
  }

  async markFailed(id: number, errorMessage: string): Promise<void> {
    await db
      .update(editJobs)
      .set({
        status: "failed" satisfies EditJobStatus,
        completedAt: new Date(),
        errorMessage: errorMessage.slice(0, 2_000), // keep row size sane
      })
      .where(eq(editJobs.id, id));
  }
}

export const editJobService = new EditJobService();
