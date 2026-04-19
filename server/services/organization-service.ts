/**
 * Organization service — tenancy boundary for the photo module.
 *
 * Responsibilities
 *  - Auto-provision a "personal" org for any user on first photo-module access
 *    so existing single-user accounts aren't blocked by the Phase 1 org model.
 *  - Resolve the active org for a user (personal by default, explicit via
 *    x-org-id header / query param in the future).
 *  - Check membership + role before any org-scoped mutation.
 *
 * Per PRD §7/§8: orgs ship in Phase 1 data-model even though the invite +
 * QC UI lands in Phase 1.5. All photo tables are org-scoped from Day 1.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  organizations,
  organizationMembers,
  users,
  type Organization,
  type OrganizationMember,
  type OrganizationRole,
} from "@shared/schema";

export class OrganizationService {
  /**
   * Return the user's personal org, creating it if missing. Idempotent.
   * Safe to call on every photo-module request without racing: we lean on
   * the (userId, isPersonal=true) invariant + unique slug to prevent dupes.
   */
  async getOrCreatePersonalOrg(userId: string): Promise<Organization> {
    // 1. Look for an existing personal org for this user (via membership).
    const existing = await db
      .select({ org: organizations })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.orgId))
      .where(
        and(
          eq(organizationMembers.userId, userId),
          eq(organizations.isPersonal, true)
        )
      )
      .limit(1);

    if (existing[0]?.org) {
      return existing[0].org;
    }

    // 2. None yet — create one. Use a slug derived from the user email for
    //    readability; fall back to the user id if we can't find an email.
    const [user] = await db
      .select({ email: users.email, firstName: users.firstName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const slugBase = (user?.email?.split("@")[0] ?? userId).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const slug = `${slugBase}-${userId.slice(0, 6)}`; // collision-resistant
    const name = user?.firstName ? `${user.firstName}'s workspace` : "Personal workspace";

    // Insert org + owner membership in a transaction so we never end up
    // with an org nobody belongs to.
    const org = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(organizations)
        .values({
          name,
          slug,
          createdByUserId: userId,
          isPersonal: true,
        })
        .returning();

      await tx.insert(organizationMembers).values({
        orgId: created.id,
        userId,
        role: "admin" as OrganizationRole,
      });

      return created;
    });

    return org;
  }

  /** All orgs the user belongs to, with their role in each. */
  async listUserOrgs(
    userId: string
  ): Promise<Array<{ org: Organization; role: OrganizationRole }>> {
    const rows = await db
      .select({
        org: organizations,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.orgId))
      .where(eq(organizationMembers.userId, userId));

    return rows.map((r) => ({ org: r.org, role: r.role as OrganizationRole }));
  }

  /**
   * Resolve which org this request should act on. For MVP we always use the
   * user's personal org — multi-org switching UI lands in Phase 1.5. When we
   * add the switcher, replace this with a header lookup + membership check.
   */
  async resolveActiveOrgId(userId: string): Promise<string> {
    const personal = await this.getOrCreatePersonalOrg(userId);
    return personal.id;
  }

  /** Check whether a user belongs to an org, optionally requiring a role floor. */
  async requireMembership(
    userId: string,
    orgId: string,
    minRole?: OrganizationRole
  ): Promise<OrganizationMember> {
    const [member] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.orgId, orgId)
        )
      )
      .limit(1);

    if (!member) {
      const err: any = new Error("Not a member of this organization");
      err.statusCode = 403;
      throw err;
    }

    if (minRole && !roleAtLeast(member.role as OrganizationRole, minRole)) {
      const err: any = new Error(`Requires ${minRole} role`);
      err.statusCode = 403;
      throw err;
    }

    return member;
  }
}

/**
 * admin > editor > viewer. Used to gate org-scoped mutations by minimum
 * required role. Invite/QC UI in Phase 1.5 will lean on this too.
 */
function roleAtLeast(actual: OrganizationRole, required: OrganizationRole): boolean {
  const rank: Record<OrganizationRole, number> = { admin: 3, editor: 2, viewer: 1 };
  return rank[actual] >= rank[required];
}

export const organizationService = new OrganizationService();
