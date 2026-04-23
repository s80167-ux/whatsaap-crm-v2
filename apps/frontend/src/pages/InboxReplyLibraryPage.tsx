import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { createQuickReply, deleteQuickReply, updateQuickReply } from "../api/crm";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { InboxSubTabs } from "../components/InboxSubTabs";
import { Input } from "../components/Input";
import { PanelPagination, usePanelPagination } from "../components/PanelPagination";
import { useQuickReplies } from "../hooks/useQuickReplies";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";
import { getStoredUser } from "../lib/auth";

function formatTimestamp(value?: string | null) {
  if (!value) {
    return "Never";
  }

  return new Date(value).toLocaleString();
}

export function InboxReplyLibraryPage() {
  const queryClient = useQueryClient();
  const currentUser = getStoredUser();
  const dashboardContext = useOutletContext<DashboardOutletContext>();
  const isSuperAdmin = currentUser?.role === "super_admin";
  const activeOrganizationId = isSuperAdmin
    ? dashboardContext.selectedOrganizationId || null
    : currentUser?.organizationId ?? null;
  const canManageQuickReplies = Boolean(
    currentUser?.role === "super_admin" || currentUser?.permissionKeys.includes("org.manage_settings")
  );
  const canLoadLibrary = !isSuperAdmin || Boolean(activeOrganizationId);
  const { data: quickReplies = [] } = useQuickReplies({
    organizationId: activeOrganizationId,
    includeInactive: canManageQuickReplies,
    enabled: canLoadLibrary
  });
  const quickReplyPagination = usePanelPagination(quickReplies);

  const [quickReplyTitle, setQuickReplyTitle] = useState("");
  const [quickReplyBody, setQuickReplyBody] = useState("");
  const [quickReplyCategory, setQuickReplyCategory] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const totalUsageCount = useMemo(
    () => quickReplies.reduce((total, reply) => total + (reply.usage_count ?? 0), 0),
    [quickReplies]
  );
  const mostUsedReply = useMemo(
    () => [...quickReplies].sort((left, right) => (right.usage_count ?? 0) - (left.usage_count ?? 0))[0] ?? null,
    [quickReplies]
  );

  async function handleCreateQuickReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeOrganizationId) {
      setNotice("Select an organization before creating quick replies.");
      return;
    }

    setIsWorking(true);
    setNotice(null);

    try {
      await createQuickReply({
        organizationId: activeOrganizationId,
        title: quickReplyTitle,
        body: quickReplyBody,
        category: quickReplyCategory || null
      });
      setQuickReplyTitle("");
      setQuickReplyBody("");
      setQuickReplyCategory("");
      setNotice("Quick reply created. Users and agents can select it in their chat composer.");
      await queryClient.invalidateQueries({ queryKey: ["quick-replies"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to create quick reply");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleToggleQuickReply(templateId: string, nextActive: boolean) {
    setIsWorking(true);
    setNotice(null);

    try {
      await updateQuickReply({
        templateId,
        organizationId: activeOrganizationId,
        isActive: nextActive
      });
      setNotice(nextActive ? "Quick reply activated." : "Quick reply hidden from chat composers.");
      await queryClient.invalidateQueries({ queryKey: ["quick-replies"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update quick reply");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleDeleteQuickReply(templateId: string, title: string) {
    if (!window.confirm(`Delete quick reply "${title}"?`)) {
      return;
    }

    setIsWorking(true);
    setNotice(null);

    try {
      await deleteQuickReply({
        templateId,
        organizationId: activeOrganizationId
      });
      setNotice("Quick reply deleted.");
      await queryClient.invalidateQueries({ queryKey: ["quick-replies"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to delete quick reply");
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <section className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <Card elevated>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Inbox</p>
              <h1 className="mt-3 section-title">Organization reply library</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
                Keep approved quick replies close to the Inbox so teams can manage and reuse them from the same workspace.
              </p>
            </div>
            <InboxSubTabs
              tabs={[
                { to: "/inbox", label: "Conversations" },
                { to: "/inbox/replies", label: "Reply library" }
              ]}
            />
          </div>
          {notice ? <p className="mt-4 text-sm text-primary">{notice}</p> : null}
        </Card>
      </motion.div>

      {!canLoadLibrary ? (
        <Card elevated>
          <div className="flex min-h-[220px] items-center justify-center px-6 text-center text-sm text-text-muted">
            Choose an organization from the sidebar to open the reply library.
          </div>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[420px,minmax(0,1fr)]">
          {canManageQuickReplies ? (
            <motion.form
              onSubmit={handleCreateQuickReply}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Card elevated>
                <h2 className="text-lg font-semibold text-text">Create quick reply</h2>
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  Org admins can publish approved responses here for agents and users to insert from chat.
                </p>
                <div className="mt-4 space-y-3">
                  <Input
                    value={quickReplyTitle}
                    onChange={(event) => setQuickReplyTitle(event.target.value)}
                    placeholder="Reply title"
                    required
                  />
                  <Input
                    value={quickReplyCategory}
                    onChange={(event) => setQuickReplyCategory(event.target.value)}
                    placeholder="Category (optional)"
                  />
                  <textarea
                    value={quickReplyBody}
                    onChange={(event) => setQuickReplyBody(event.target.value)}
                    placeholder="Write the message agents can insert..."
                    required
                    rows={5}
                    className="w-full resize-none rounded-xl border border-border bg-white px-4 py-3 text-sm text-text outline-none transition focus:border-primary/30"
                  />
                  <Button type="submit" disabled={isWorking || !activeOrganizationId}>
                    Create quick reply
                  </Button>
                </div>
              </Card>
            </motion.form>
          ) : null}

          <Card elevated>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text">Library dashboard</h2>
                <p className="mt-1 text-sm text-text-muted">
                  Active replies stay visible to everyone. Hidden replies are shown here only to managers.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-background-tint p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">Templates</p>
                <p className="mt-2 text-2xl font-semibold text-text">{quickReplies.length}</p>
              </div>
              <div className="rounded-xl border border-border bg-background-tint p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">Total uses</p>
                <p className="mt-2 text-2xl font-semibold text-text">{totalUsageCount}</p>
              </div>
              <div className="rounded-xl border border-border bg-background-tint p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">Most used</p>
                <p className="mt-2 truncate text-sm font-semibold text-text">{mostUsedReply?.title ?? "--"}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {quickReplies.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-background-tint px-4 py-6 text-sm leading-6 text-text-muted">
                  No quick replies yet for this organization.
                </p>
              ) : (
                quickReplyPagination.visibleItems.map((reply) => (
                  <div key={reply.id} className="rounded-xl border border-border bg-background-tint p-4 text-sm text-text-muted">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text">{reply.title}</p>
                        {reply.category ? (
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-text-soft">{reply.category}</p>
                        ) : null}
                      </div>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                          reply.is_active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-border bg-white text-text-soft"
                        }`}
                      >
                        {reply.is_active ? "Active" : "Hidden"}
                      </span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap leading-6">{reply.body}</p>
                    <div className="mt-3 grid gap-2 rounded-xl border border-border bg-white px-3 py-2 text-xs text-text-soft sm:grid-cols-2">
                      <p>Uses: {reply.usage_count ?? 0}</p>
                      <p>Last used: {reply.last_used_at ? formatTimestamp(reply.last_used_at) : "Never"}</p>
                    </div>
                    {canManageQuickReplies ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          className="px-3 py-2 text-xs"
                          disabled={isWorking}
                          onClick={() => handleToggleQuickReply(reply.id, !reply.is_active)}
                        >
                          {reply.is_active ? "Hide from agents" : "Make active"}
                        </Button>
                        <Button
                          variant="secondary"
                          className="px-3 py-2 text-xs text-coral"
                          disabled={isWorking}
                          onClick={() => handleDeleteQuickReply(reply.id, reply.title)}
                        >
                          Delete
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
            <PanelPagination
              className="mt-4"
              page={quickReplyPagination.page}
              pageCount={quickReplyPagination.pageCount}
              totalItems={quickReplyPagination.totalItems}
              onPageChange={quickReplyPagination.setPage}
            />
          </Card>
        </div>
      )}
    </section>
  );
}
