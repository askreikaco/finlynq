"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Activity, Shield, Mail, KeyRound, Layers, Receipt, UserPlus, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { DORMANT_DAYS, isDormant } from "@/lib/auth/dormancy";
import {
  findColFilter,
  serializeTableFilters,
  setColFilter,
  type TableColFilter,
} from "@/lib/table-filters";
import { formatDateTimeLocal } from "@/lib/currency";
import { EditUserModal } from "@/components/admin/edit-user-modal";
import { Pagination } from "@/components/ui/pagination";
import { DetailSheet, ListRow, METRIC_GRID_CLASS, MetricGrid, SectionCard } from "@/components/mobile";
import { SectionPage } from "@/components/templates";
import { TW } from "@/lib/design/tokens";
import { MetricRangeSelect } from "@/components/metric-range-select";
import { useMetricRange } from "@/lib/metrics/use-metric-range";
import { cardProps, makeCardResolver, runningTotal } from "@/lib/metrics/series";
import { formatDelta } from "@/lib/metrics/delta";
import { pctChange } from "@/lib/metrics/period";
import { localDateISO } from "@/lib/utils/date";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  username: string | null;
  email: string | null;
  displayName: string | null;
  role: string;
  emailVerified: number;
  mfaEnabled: number;
  onboardingComplete: number;
  plan: string;
  planExpiresAt: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
  transactionCount: number;
  /**
   * Whole days from signup to last recorded activity, computed SERVER-side so
   * it can be sorted and filtered across the whole table rather than one page.
   * Never null — a never-active user is 0 (see @/lib/auth/activity-span).
   */
  activeSpanDays: number;
}

// FINLYNQ-166 — DORMANT_DAYS + the dormancy/sort math live in the pure,
// dependency-free @/lib/auth/dormancy module (unit-tested in isolation).

interface LoginActivityRow {
  id: string;
  username: string | null;
  email: string | null;
  displayName: string | null;
  loginCount: number;
  lastLoginAt: string | null;
}

interface UsageStats {
  totalUsers: number;
  totalTransactions: number;
  totalAccounts: number;
  registrationsLast7Days: number;
  registrationsPrevious7Days?: number;
  registrationsByMonth?: Record<string, number>;
  registrationsLast30Days: number;
  verifiedUsers: number;
  mfaEnabledUsers: number;
  planBreakdown: Record<string, number>;
  totalLogins: number;
  activeUsersLast7Days: number;
  activeUsersLast30Days: number;
  loginsLast24Hours?: number;
  // FINLYNQ — near-real-time "active now" from last_active_at (web + MCP + API key).
  activeUsersLast15Min?: number;
  activeUsersLast60Min?: number;
  activeUsersLast24Hours?: number;
  // FINLYNQ-301 — per-prompt decision-prompt completion.
  promptAcks?: PromptAckRow[];
  recentLogins?: LoginActivityRow[];
}

// FINLYNQ-301 — per-prompt answered/deferred/dismissed completion counts.
interface PromptAckRow {
  promptId: string;
  title: string;
  version: number;
  answered: number;
  deferred: number;
  dismissed: number;
}

// FINLYNQ-167 — a live OAuth grant across all users for the admin panel.
interface AdminGrant {
  id: number;
  userId: string;
  userLabel: string;
  clientId: string;
  clientName: string;
  scope: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
}

// ─── Sort / paging ──────────────────────────────────────────────────────────
//
// Sort, filter AND paging are all SERVER-side (see listUsersPage in
// @/lib/auth/queries). The hand-rolled client comparator that used to live here
// was removed with the 50-row cap: it could only ever order the rows already
// fetched, so sorting a multi-page table silently sorted one page in isolation.

/** The sort keys offered as compact pills on the users list (server-side sort). */
const USER_SORT_OPTIONS: Array<{ key: UserSortKey; label: string }> = [
  { key: "user", label: "Name" },
  { key: "lastActive", label: "Last active" },
  { key: "joined", label: "Joined" },
  { key: "txns", label: "Txns" },
];

/** The one SectionPage shell for the admin console (centred report column at every width). */
const adminPageProps = {
  id: "admin",
  title: "Admin",
  subtitle: "Manage users and monitor platform usage",
  width: "report" as const,
  center: true,
};

/** Rows per page. The route clamps `limit` to 200. */
const USERS_PAGE_SIZE = 50;

/** Sort keys accepted by GET /api/admin/users — mirrors USER_SORT_SQL. */
type UserSortKey =
  | "user"
  | "role"
  | "plan"
  | "verified"
  | "mfa"
  | "txns"
  | "lastActive"
  | "joined"
  | "span";


// ─── Animation ──────────────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" as const },
  },
};

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const metricRange = useMetricRange();
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  // Server-driven table state. Changing any of these refetches the page.
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
    null
  );
  const [page, setPage] = useState(0);
  const [colFilters, setColFilters] = useState<TableColFilter[]>([]);
  // FINLYNQ-167 — OAuth grants panel.
  const [grants, setGrants] = useState<AdminGrant[]>([]);
  const [revokingGrant, setRevokingGrant] = useState<number | null>(null);
  // Row tapped open in a detail sheet (users and OAuth grants).
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [detailGrantId, setDetailGrantId] = useState<number | null>(null);

  /**
   * The users page. Split from the stats/grants fetch below so paging or
   * re-sorting doesn't re-run the (much heavier) stats aggregation.
   */
  const fetchUsers = useCallback(async () => {
    const params = new URLSearchParams({
      limit: String(USERS_PAGE_SIZE),
      offset: String(page * USERS_PAGE_SIZE),
    });
    if (sort) {
      params.set("sort", sort.key);
      params.set("sortDir", sort.dir);
    }
    const serialized = serializeTableFilters(colFilters);
    if (serialized) params.set("filters", serialized);

    try {
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (!res.ok) {
        setError(
          res.status === 403
            ? "Admin access required."
            : "Failed to load admin data."
        );
        setLoading(false);
        return;
      }
      const data = await res.json();
      setUsers(data.users);
      setTotal(data.total);
      setLoading(false);
    } catch {
      setError("Failed to connect to server.");
      setLoading(false);
    }
  }, [page, sort, colFilters]);

  const fetchStatsAndGrants = useCallback(async () => {
    try {
      const [statsRes, grantsRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch("/api/admin/oauth-grants"),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      // Grants are non-fatal: a failed grants fetch leaves the panel empty
      // rather than blanking the whole admin page.
      if (grantsRes.ok) {
        const grantsData = await grantsRes.json();
        setGrants(grantsData.grants ?? []);
      }
    } catch {
      // Stats/grants are supplementary — the users table drives the error state.
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    fetchStatsAndGrants();
  }, [fetchStatsAndGrants]);

  /**
   * A new sort or filter invalidates the current offset — page 4 of the old
   * ordering has nothing to do with page 4 of the new one, and with a filter
   * applied the offset can land past the end and render an empty table.
   */
  const handleSortChange = useCallback(
    (next: { key: string; dir: "asc" | "desc" } | null) => {
      setSort(next);
      setPage(0);
    },
    []
  );

  /** Same reasoning as sort: a changed filter invalidates the current offset. */
  const handleColumnFilterChange = useCallback(
    (columnId: string, next: TableColFilter | null) => {
      setColFilters((prev) => setColFilter(prev, columnId, next));
      setPage(0);
    },
    []
  );

  const handleRoleToggle = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    setUpdatingUser(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
        );
      }
    } finally {
      setUpdatingUser(null);
    }
  };

  const handlePlanChange = async (userId: string, plan: string) => {
    setUpdatingUser(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, plan }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, plan } : u))
        );
      }
    } finally {
      setUpdatingUser(null);
    }
  };
  const handleEditUser = (user: AdminUser) => {
    setEditingUser(user);
    setEditModalOpen(true);
  };

  const handleSaveUserEdits = async (updates: Record<string, unknown>) => {
    if (!editingUser) return;
    setUpdatingUser(editingUser.id);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: editingUser.id, ...updates }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw Object.assign(new Error(data.error || "Failed to update user"), {
          code: data.code as string | undefined,
        });
      }
      const data = await res.json().catch(() => ({}));
      if (data.selfDemoted) {
        // Our own admin role is gone; every further admin call would 403.
        window.location.assign("/");
        return;
      }
      // Refresh the current page to show updated user
      await fetchUsers();
    } finally {
      setUpdatingUser(null);
    }
  };

  // Compact sort and filter helpers. They write the same server-side TableColFilter
  // wire format the shared table used, so paging, sorting and filtering stay server-side.
  const enumFilterValue = (columnId: string): string => {
    const f = findColFilter(colFilters, columnId);
    return f && f.type === "enum" ? (f.values[0] ?? "") : "";
  };
  const setEnumFilter = (columnId: string, value: string) => {
    handleColumnFilterChange(columnId, value ? { type: "enum", columnId, values: [value] } : null);
  };
  const toggleUserSort = (key: UserSortKey) => {
    handleSortChange(sort?.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  };

  // FINLYNQ-167 — admin revoke of a grant (kills access + refresh). Reuses the
  // FINLYNQ-154 revoke path via the admin-scoped route; drops the row from the
  // active list on success.
  const handleRevokeGrant = async (grantId: number) => {
    setRevokingGrant(grantId);
    try {
      const res = await fetch(`/api/admin/oauth-grants?id=${grantId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setGrants((prev) => prev.filter((g) => g.id !== grantId));
      }
    } finally {
      setRevokingGrant(null);
    }
  };

  if (loading) {
    return (
      <SectionPage {...adminPageProps}>
        <div className="space-y-5">
          <div className={METRIC_GRID_CLASS}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 animate-shimmer rounded-xl" />
            ))}
          </div>
          <div className="h-96 animate-shimmer rounded-xl" />
        </div>
      </SectionPage>
    );
  }

  if (error) {
    return (
      <SectionPage {...adminPageProps}>
        <div className="flex items-center justify-center min-h-[40vh]">
          <Card>
            <CardContent className="p-8 text-center">
              <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium">{error}</p>
              <p className="text-sm text-muted-foreground mt-2">
                You need admin privileges to access this page.
              </p>
            </CardContent>
          </Card>
        </div>
      </SectionPage>
    );
  }

  const roleFilter = enumFilterValue("role");
  const planFilter = enumFilterValue("plan");
  const verifiedFilter = enumFilterValue("verified");
  const mfaFilter = enumFilterValue("mfa");
  const textFilter = findColFilter(colFilters, "user");
  const detailUser = users.find((u) => u.id === detailUserId) ?? null;
  const detailGrant = grants.find((g) => g.id === detailGrantId) ?? null;

  return (
    <SectionPage {...adminPageProps}>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* Stats Grid */}
        {stats && (
          <div className="space-y-3">
            <MetricRangeSelect value={metricRange.selection} onChange={metricRange.setSelection} />
            <MetricGrid
              metrics={[
                { icon: Users,
                  label: "Total Users",
                  value: stats.totalUsers,
                  // Running total of signups by month (users that still exist), this month vs last month by default.
                  ...(() => {
                    const rows = Object.entries(stats.registrationsByMonth ?? {}).map(([month, cumulative]) => ({ month, cumulative }));
                    const c = makeCardResolver(metricRange)(runningTotal(rows, localDateISO().slice(0, 7)), "last", stats.totalUsers, "count");
                    return cardProps(c);
                  })(),
                },
                { icon: Receipt, label: "Transactions", value: stats.totalTransactions.toLocaleString() },
                { icon: UserPlus,
                  label: "New (7d)",
                  value: stats.registrationsLast7Days,
                  // Fixed 7-day window: the 7 days before it.
                  badgePct: stats.registrationsPrevious7Days != null ? pctChange(stats.registrationsLast7Days, stats.registrationsPrevious7Days) : null,
                  sub: formatDelta({ cur: stats.registrationsLast7Days, prev: stats.registrationsPrevious7Days, kind: "count", caption: "vs previous 7 days" }) ?? undefined,
                },
                { icon: ShieldCheck, label: "MFA Enabled", value: stats.mfaEnabledUsers },
              ]}
            />
          </div>
        )}

        {/* Live activity — near-real-time "who's using it right now" from
            last_active_at (web + MCP + API key). The 15-min window is the
            deploy-safety glance: ~0 means a restart disrupts nobody. */}
        {stats && (
          <motion.div variants={itemVariants}>
            <div className="flex items-center gap-2 mb-3">
              <span className="relative flex h-2 w-2 shrink-0">
                {(stats.activeUsersLast15Min ?? 0) > 0 && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pos/20 opacity-75" />
                )}
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    (stats.activeUsersLast15Min ?? 0) > 0
                      ? "bg-pos"
                      : "bg-muted"
                  }`}
                />
              </span>
              <h2 className="text-sm font-semibold text-muted-foreground">
                Live activity
              </h2>
            </div>
            <MetricGrid
              metrics={[
                { icon: Activity, label: "Active now (15 min)", value: stats.activeUsersLast15Min ?? 0 },
                { icon: Activity, label: "Active (last hour)", value: stats.activeUsersLast60Min ?? 0 },
                { icon: Activity, label: "Active (last 24h)", value: stats.activeUsersLast24Hours ?? 0 },
              ]}
            />
            <p className="text-xs text-muted-foreground mt-2">
              Counts users with any authenticated request (web, MCP, or API key)
              in the window. Best glance before a deploy: the restart rotates JWTs
              and forces a re-login.
            </p>
          </motion.div>
        )}

        {/* FINLYNQ-301 — Decision-prompt completion (per prompt, current version) */}
        {stats && stats.promptAcks && stats.promptAcks.length > 0 && (
          <motion.div variants={itemVariants}>
            <SectionCard label="Decision prompts" padded={false} className="divide-y divide-border/50 px-3">
              {stats.promptAcks.map((p) => (
                <ListRow
                  key={`${p.promptId}:${p.version}`}
                  title={
                    <>
                      <span className="font-medium">{p.promptId}</span>
                      <span className="ml-2 text-xs text-muted-foreground">v{p.version}</span>
                    </>
                  }
                  subtitle={`${p.answered} answered`}
                  value={<span className="font-mono text-sm">{p.deferred}</span>}
                  secondary={`${p.deferred} deferred · ${p.dismissed} dismissed`}
                />
              ))}
            </SectionCard>
            <p className="text-xs text-muted-foreground mt-2">
              Rows appear once a user has interacted with a prompt; users never
              shown a prompt have no ack row. Answered is terminal for that
              version; bump the prompt&apos;s version to re-ask everyone.
            </p>
          </motion.div>
        )}

        {/* Plan Breakdown */}
        {stats && (
          <motion.div variants={itemVariants}>
            <MetricGrid
              metrics={Object.entries(stats.planBreakdown).map(([plan, count]) => ({
                label: plan.charAt(0).toUpperCase() + plan.slice(1),
                value: count,
                icon: Layers,
              }))}
            />
          </motion.div>
        )}

        {/* User Management */}
        <motion.div variants={itemVariants}>
          <Tabs defaultValue="users">
            <TabsList>
              <TabsTrigger value="users">
                <Users className="h-4 w-4 mr-1.5" />
                Users ({total})
              </TabsTrigger>
              <TabsTrigger value="activity">
                <Activity className="h-4 w-4 mr-1.5" />
                Activity
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="mt-4 space-y-3">
              {/* Compact sort and filter controls. Sort, filter and paging stay server-side. */}
              <div role="group" aria-label="Sort users" className="flex flex-wrap gap-2">
                {USER_SORT_OPTIONS.map((o) => {
                  const active = sort?.key === o.key;
                  return (
                    <button
                      key={o.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleUserSort(o.key)}
                      className={`inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium ${
                        active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                      }`}
                    >
                      {o.label}
                      {active ? (sort?.dir === "asc" ? "↑" : "↓") : null}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  aria-label="Search users"
                  placeholder="Search name, username or email"
                  value={textFilter?.type === "text" ? textFilter.value : ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    handleColumnFilterChange("user", value.trim() ? { type: "text", columnId: "user", value } : null);
                  }}
                  className="col-span-2 h-8 text-xs"
                />
                <select
                  aria-label="Filter by role"
                  value={roleFilter}
                  onChange={(e) => setEnumFilter("role", e.target.value)}
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                >
                  <option value="">All roles</option>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                <select
                  aria-label="Filter by plan"
                  value={planFilter}
                  onChange={(e) => setEnumFilter("plan", e.target.value)}
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                >
                  <option value="">All plans</option>
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                  <option value="premium">Premium</option>
                </select>
                <select
                  aria-label="Filter by verified"
                  value={verifiedFilter}
                  onChange={(e) => setEnumFilter("verified", e.target.value)}
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                >
                  <option value="">Any verification</option>
                  <option value="1">Verified</option>
                  <option value="0">Not verified</option>
                </select>
                <select
                  aria-label="Filter by MFA"
                  value={mfaFilter}
                  onChange={(e) => setEnumFilter("mfa", e.target.value)}
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                >
                  <option value="">Any MFA</option>
                  <option value="1">Enabled</option>
                  <option value="0">Disabled</option>
                </select>
              </div>
              {colFilters.length > 0 && (
                <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>
                    {colFilters.length} column filter
                    {colFilters.length === 1 ? "" : "s"} active
                  </span>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded border hover:bg-muted transition-colors"
                    onClick={() => {
                      setColFilters([]);
                      setPage(0);
                    }}
                  >
                    Clear all
                  </button>
                </div>
              )}

              <SectionCard padded={false} className="divide-y divide-border/50 px-3">
                {users.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No users found.</p>
                ) : (
                  users.map((u) => {
                    const primary = u.displayName || u.username || u.email || "—";
                    const secondaryId = u.username ?? u.email ?? null;
                    const showSecondary =
                      secondaryId !== null &&
                      secondaryId.trim().toLowerCase() !== primary.trim().toLowerCase();
                    const dormant = isDormant(u.lastActiveAt);
                    const flags = [
                      showSecondary ? secondaryId : null,
                      u.role === "admin" ? "Admin" : null,
                      (u.plan ?? "free").charAt(0).toUpperCase() + (u.plan ?? "free").slice(1),
                      u.emailVerified ? "Verified" : null,
                      u.mfaEnabled ? "MFA" : null,
                    ].filter(Boolean);
                    return (
                      <ListRow
                        key={u.id}
                        title={primary}
                        subtitle={flags.join(" · ")}
                        value={<span className="font-mono text-sm">{(u.transactionCount ?? 0).toLocaleString()} txns</span>}
                        secondary={u.lastActiveAt === null ? "Never active" : formatDateTimeLocal(u.lastActiveAt ?? "")}
                        secondaryTone={dormant ? "muted" : "pos"}
                        onPress={() => setDetailUserId(u.id)}
                      />
                    );
                  })
                )}
              </SectionCard>

              <Pagination
                page={page}
                limit={USERS_PAGE_SIZE}
                total={total}
                onPageChange={setPage}
                label="users"
              />
            </TabsContent>

            <TabsContent value="activity" className={`mt-4 ${TW.grid3}`}>
              <Card>
                <CardContent className="p-6">
                  {stats && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between py-3 border-b">
                        <span className="text-muted-foreground">
                          Registrations (last 30 days)
                        </span>
                        <span className="font-bold">
                          {stats.registrationsLast30Days}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-3 border-b">
                        <span className="text-muted-foreground">
                          Email-verified users
                        </span>
                        <span className="font-bold flex items-center gap-1">
                          <Mail className="h-4 w-4" />
                          {stats.verifiedUsers} / {stats.totalUsers}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-3 border-b">
                        <span className="text-muted-foreground">
                          Total logins
                        </span>
                        <span className="font-bold">
                          {stats.totalLogins.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-3 border-b">
                        <span className="text-muted-foreground">
                          Active users (last 7 days)
                        </span>
                        <span className="font-bold">
                          {stats.activeUsersLast7Days}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-3 border-b">
                        <span className="text-muted-foreground">
                          Active users (last 30 days)
                        </span>
                        <span className="font-bold">
                          {stats.activeUsersLast30Days}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-3 border-b">
                        <span className="text-muted-foreground">
                          Total accounts created
                        </span>
                        <span className="font-bold">{stats.totalAccounts}</span>
                      </div>
                      <div className="flex items-center justify-between py-3">
                        <span className="text-muted-foreground">
                          Total transactions
                        </span>
                        <span className="font-bold">
                          {stats.totalTransactions.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 space-y-2">
                  <div className="px-1">
                    <h2 className="font-semibold">Recent logins</h2>
                    <p className="text-sm text-muted-foreground">
                      Last 15 users who signed in, most recent first.
                    </p>
                  </div>
                  <div className="divide-y divide-border/50">
                    {(stats?.recentLogins ?? []).map((row) => (
                      <ListRow
                        key={row.id}
                        title={row.displayName || row.username || "—"}
                        subtitle={row.username ?? row.email ?? "—"}
                        value={<span className="font-mono text-sm">{row.loginCount.toLocaleString()}</span>}
                        secondary={row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : "—"}
                      />
                    ))}
                    {(!stats?.recentLogins || stats.recentLogins.length === 0) && (
                      <p className="py-8 text-center text-sm text-muted-foreground">No login activity yet.</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* FINLYNQ-167 — OAuth grants across users */}
              <Card>
                <CardContent className="p-4 space-y-2">
                  <div className="px-1">
                    <h2 className="font-semibold flex items-center gap-2">
                      <KeyRound className="h-4 w-4" />
                      OAuth grants ({grants.length})
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Live OAuth / MCP grants across all users. A grant is dormant
                      when it has not been used in over {DORMANT_DAYS} days.
                    </p>
                  </div>
                  <div className="divide-y divide-border/50">
                    {grants.map((grant) => {
                      // FINLYNQ-166's pure dormancy predicate — reused here for
                      // last_used_at (null OR >DORMANT_DAYS ago = dormant).
                      const dormant = isDormant(grant.lastUsedAt);
                      return (
                        <ListRow
                          key={grant.id}
                          title={grant.clientName}
                          subtitle={`${grant.userLabel} · ${grant.scope}`}
                          value={
                            <span className={`text-xs ${dormant ? "text-muted-foreground" : "text-pos"}`}>
                              {dormant ? "Dormant" : "Active"}
                            </span>
                          }
                          secondary={grant.lastUsedAt === null ? "Never used" : formatDateTimeLocal(grant.lastUsedAt)}
                          onPress={() => setDetailGrantId(grant.id)}
                        />
                      );
                    })}
                    {grants.length === 0 && (
                      <p className="py-8 text-center text-sm text-muted-foreground">No active OAuth grants.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      </motion.div>

      {detailUser && (
        <DetailSheet
          open
          onOpenChange={(o) => { if (!o) setDetailUserId(null); }}
          title={detailUser.displayName || detailUser.username || detailUser.email || "User"}
          description={detailUser.username ?? detailUser.email ?? undefined}
          items={[
            { label: "Role", value: detailUser.role === "admin" ? "Admin" : "User" },
            { label: "Plan", value: (detailUser.plan ?? "free").charAt(0).toUpperCase() + (detailUser.plan ?? "free").slice(1) },
            { label: "Email verified", value: detailUser.emailVerified ? "Yes" : "No" },
            { label: "MFA", value: detailUser.mfaEnabled ? "Enabled" : "Disabled" },
            { label: "Transactions", value: (detailUser.transactionCount ?? 0).toLocaleString() },
            { label: "Active span", value: `${detailUser.activeSpanDays} day(s)` },
            { label: "Last active", value: detailUser.lastActiveAt === null ? "Never" : formatDateTimeLocal(detailUser.lastActiveAt) },
            { label: "Joined", value: formatDateTimeLocal(detailUser.createdAt) },
          ]}
        >
          <Button variant="outline" disabled={updatingUser === detailUser.id} onClick={() => { setDetailUserId(null); handleEditUser(detailUser); }}>
            Edit
          </Button>
          <Button variant="outline" disabled={updatingUser === detailUser.id} onClick={() => handleRoleToggle(detailUser.id, detailUser.role)}>
            {detailUser.role === "admin" ? "Revoke Admin" : "Make Admin"}
          </Button>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Plan</span>
            <select
              aria-label="Plan"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={detailUser.plan ?? "free"}
              disabled={updatingUser === detailUser.id}
              onChange={(e) => handlePlanChange(detailUser.id, e.target.value)}
            >
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="premium">Premium</option>
            </select>
          </label>
        </DetailSheet>
      )}

      {detailGrant && (
        <DetailSheet
          open
          onOpenChange={(o) => { if (!o) setDetailGrantId(null); }}
          title={detailGrant.clientName}
          description={<span className="font-mono text-xs">{detailGrant.clientId}</span>}
          items={[
            { label: "User", value: detailGrant.userLabel },
            { label: "Scope", value: <span className="font-mono text-xs">{detailGrant.scope}</span> },
            { label: "Granted", value: formatDateTimeLocal(detailGrant.createdAt) },
            {
              label: "Last used",
              value: detailGrant.lastUsedAt === null
                ? "Never"
                : `${formatDateTimeLocal(detailGrant.lastUsedAt)}${isDormant(detailGrant.lastUsedAt) ? ` (dormant: unused over ${DORMANT_DAYS} days)` : ""}`,
            },
          ]}
        >
          <Button
            variant="outline"
            className="text-destructive"
            disabled={revokingGrant === detailGrant.id}
            onClick={() => { setDetailGrantId(null); handleRevokeGrant(detailGrant.id); }}
          >
            {revokingGrant === detailGrant.id ? "Revoking…" : "Revoke grant"}
          </Button>
        </DetailSheet>
      )}

      {editingUser && editModalOpen && (
        <EditUserModal
          user={editingUser}
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
          onSave={handleSaveUserEdits}
        />
      )}
    </SectionPage>
  );
}
