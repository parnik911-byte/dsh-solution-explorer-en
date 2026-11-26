/**
 * SCM panel commands — SCM domain.
 * Registered via registerScmCommands(deps); deps injected from panel.ts.
 * @module dsh-solution-explorer/client/scm/commands
 */

import { t } from "../locales.ts"


import { showToast, showConfirm, showPrompt } from "../shared/ui.ts"

import { gitRoot, type AppState } from "../state/store.ts"


import type { ActionsDeps } from "./actions.ts"

import type { HistoryDeps } from "./history.ts"

import type { BranchesDeps } from "./branches.ts"
import { commands } from '../commands.ts'

export interface ScmCommandsDeps {
  state: AppState
  render: () => void
  actionsDeps: ActionsDeps
  historyDeps: HistoryDeps
  branchesDeps: BranchesDeps
  loadGitStatus: (d: ActionsDeps) => Promise<void>
  loadRepos: (d: ActionsDeps) => Promise<void>
  loadRecentCommits: (d: HistoryDeps) => Promise<void>
  loadRemotes: (d: BranchesDeps) => Promise<void>
  loadBranches: (d: BranchesDeps) => Promise<void>
  loadTags: (d: BranchesDeps) => Promise<void>
  loadCommitsPage: (d: HistoryDeps) => Promise<void>
  getCommitDetail: (hash: string, d: HistoryDeps) => Promise<any>
  hideCommitTooltip: (d: HistoryDeps) => void
  doStage: (files: string[], d: ActionsDeps) => Promise<void>
  doUnstage: (files: string[], d: ActionsDeps) => Promise<void>
  doDiscard: (files: string[], d: ActionsDeps) => Promise<void>
  doCommit: (d: ActionsDeps) => Promise<void>
}

export function registerScmCommands(deps: ScmCommandsDeps): () => void {
  const { state } = deps
  const render = deps.render

  commands.selectRepo = (path) => {
    if (!path || path === state.scm.activeRepo) return;
    state.scm.activeRepo = path;
    state.commits.commitDetailCache.clear();
    state.commits.remotesResolved = false;
    deps.loadGitStatus(deps.actionsDeps);
    deps.loadRecentCommits(deps.historyDeps);
    // React renders the selection highlight and the change list.
    render();
  };

  commands.commitDetail = async (hash) => {
    deps.hideCommitTooltip(deps.historyDeps);
    if (!hash) return;
    state.commits.graphDetailOpen = state.commits.graphDetailOpen === hash ? "" : hash;
    // React renders the row's selected state and its inline detail.
    render();
    if (!state.commits.graphDetailOpen) return;
    try {
      await deps.getCommitDetail(hash, deps.historyDeps);
      if (state.commits.graphDetailOpen === hash) render();
    } catch {
      if (state.commits.graphDetailOpen === hash) render();
    }
  };

  commands.commitCheckout = async (hash) => {
    if (!hash) return;

    const ok = await showConfirm({ title: "Checkout", okText: "Checkout", message: `Checkout ${hash.substring(0, 8)}?\nNote: this enters a detached HEAD state.` });
    if (!ok) return;
    const result = await (await fetch("/solution-explorer/git-branch-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(state), name: hash }) })).json();
    if (!result.ok) showToast(result.error?.message || "Checkout failed", true);
    else { await deps.loadGitStatus(deps.actionsDeps); await deps.loadRecentCommits(deps.historyDeps); }
  };

  commands.gitInit = async () => {
    if (!(await showConfirm({ title: t("scm.init.button"), message: t("scm.init.confirm"), okText: t("scm.init.button") }))) return;
    const result = await (await fetch("/solution-explorer/git-init", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(state) }) })).json();
    if (!result.ok) showToast(result.error?.message || "Initialization failed", true);
    else { await deps.loadRepos(deps.actionsDeps); await deps.loadGitStatus(deps.actionsDeps); commands.refresh(); }
  };
  commands.fetch = async () => {
    const result = await (await fetch("/solution-explorer/git-fetch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(state) }) })).json();
    if (!result.ok) showToast(result.error?.message || "Fetch failed", true);
    else {
      await deps.loadGitStatus(deps.actionsDeps); await deps.loadBranches(deps.branchesDeps);
      const out = (result.value || "").trim();
      showToast(out ? t("scm.sync.fetch") + ":\n" + out : t("scm.sync.upToDate"));
    }
  };
  commands.pull = async () => {
    if (!(await showConfirm({ title: t("scm.sync.pull"), message: t("scm.sync.pullConfirm"), okText: t("scm.sync.pull") }))) return;
    const result = await (await fetch("/solution-explorer/git-pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(state) }) })).json();
    if (!result.ok) showToast(result.error?.message || "Pull failed", true);
    else {
      await deps.loadGitStatus(deps.actionsDeps); await deps.loadRecentCommits(deps.historyDeps);
      const out = (result.value || "").trim();
      showToast(out ? t("scm.sync.pull") + ":\n" + out : t("scm.sync.upToDate"));
    }
  };
  commands.push = async () => {
    if (!(await showConfirm({ title: t("scm.sync.push"), message: t("scm.sync.pushConfirm"), okText: t("scm.sync.push") }))) return;
    const result = await (await fetch("/solution-explorer/git-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(state) }) })).json();
    if (!result.ok) showToast(result.error?.message || "Push failed", true);
    else {
      await deps.loadGitStatus(deps.actionsDeps);
      const out = (result.value || "").trim();
      showToast(out ? t("scm.sync.push") + ":\n" + out : t("scm.sync.done"));
    }
  };
  commands.sync = async () => {
    if (!(await showConfirm({ title: t("scm.sync.sync"), message: t("scm.sync.syncConfirm"), okText: t("scm.sync.sync") }))) return;
    const result = await (await fetch("/solution-explorer/git-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(state) }) })).json();
    if (!result.ok) showToast(result.error?.message || "Sync failed", true);
    else {
      await deps.loadGitStatus(deps.actionsDeps); await deps.loadRecentCommits(deps.historyDeps);
      const out = (result.value || "").trim();
      showToast(out ? t("scm.sync.sync") + ":\n" + out : t("scm.sync.done"));
    }
  };
  commands.remotePanel = async () => { state.scm.remotePanelOpen = !state.scm.remotePanelOpen; if (state.scm.remotePanelOpen) await deps.loadRemotes(deps.branchesDeps); render(); };
  // Single-line controlled inputs: they must re-render on every
  // keystroke, otherwise React restores (wipes) the typed character.
  commands.remoteName = (v) => { state.scm.remoteName = v; render(); };
  commands.remoteUrl = (v) => { state.scm.remoteUrl = v; render(); };
  commands.remoteAdd = async () => {
    if (!state.scm.remoteName.trim() || !state.scm.remoteUrl.trim()) return;
    const result = await (await fetch("/solution-explorer/git-remote-add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(state), name: state.scm.remoteName.trim(), url: state.scm.remoteUrl.trim() }) })).json();
    if (!result.ok) showToast(result.error?.message || "Failed to add remote", true);
    else { state.scm.remoteName = ""; state.scm.remoteUrl = ""; await deps.loadRemotes(deps.branchesDeps); render(); }
  };
  commands.remoteRemove = async (name) => {
    if (!(await showConfirm({ title: t("scm.remote.title"), message: t("scm.remote.removeConfirm").replace("{name}", name), okText: t("scm.remote.remove"), danger: true }))) return;
    const result = await (await fetch("/solution-explorer/git-remote-remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(state), name }) })).json();
    if (!result.ok) showToast(result.error?.message || "Failed to remove remote", true); else { await deps.loadRemotes(deps.branchesDeps); render(); }
  };
  commands.remoteSetUrl = async (name) => {
    const url = await showPrompt({ title: t("scm.remote.title"), message: "New URL (" + name + ")", placeholder: "https://… or git@…" });
    if (!url || !url.trim()) return;
    const result = await (await fetch("/solution-explorer/git-remote-set-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(state), name, url: url.trim() }) })).json();
    if (!result.ok) showToast(result.error?.message || "Failed to update URL", true); else await deps.loadRemotes(deps.branchesDeps);
  };
  commands.branchPanel = async () => { state.scm.branchPanelOpen = !state.scm.branchPanelOpen; if (state.scm.branchPanelOpen) { await deps.loadBranches(deps.branchesDeps); await deps.loadTags(deps.branchesDeps); } render(); };
  commands.branchName = (v) => { state.scm.branchName = v; render(); };
  commands.branchFrom = (v) => { state.scm.branchFrom = v; render(); };
  commands.branchCreate = async () => {
    if (!state.scm.branchName.trim()) return;
    const body: { root: string; name: string; from?: string } = { root: gitRoot(state), name: state.scm.branchName.trim() };
    if (state.scm.branchFrom.trim()) body.from = state.scm.branchFrom.trim();
    const result = await (await fetch("/solution-explorer/git-branch-create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
    if (!result.ok) showToast(result.error?.message || "Failed to create branch", true);
    else { state.scm.branchName = ""; state.scm.branchFrom = ""; await deps.loadBranches(deps.branchesDeps); render(); }
  };
  commands.branchCheckout = async (name, isRemote) => {
    const result = await (await fetch("/solution-explorer/git-branch-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(state), name, track: isRemote === true }) })).json();
    if (!result.ok) showToast(result.error?.message || "Checkout failed", true);
    else {
      // Order matters: update state, rebuild the DOM, then load commits into the
      // fresh list node — loading before render() lets render wipe the result
      // and leave the history stuck on "Loading…".
      await deps.loadGitStatus(deps.actionsDeps);
      await deps.loadBranches(deps.branchesDeps);
      render();
      await deps.loadRecentCommits(deps.historyDeps);
    }
  };
  commands.branchDelete = async (name) => {
    if (!(await showConfirm({ title: t("scm.branch.title"), message: t("scm.branch.deleteConfirm").replace("{name}", name), okText: t("scm.branch.delete"), danger: true }))) return;
    let result = await (await fetch("/solution-explorer/git-branch-delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(state), name }) })).json();
    // Safe delete (-d) refuses unmerged branches — offer a forced delete (-D).
    if (!result.ok && String(result.error?.message || "").includes("not fully merged")) {
  
      const ok = await showConfirm({ title: t("scm.branch.title"), message: "This branch has unmerged commits. Force delete? This cannot be undone.", okText: "Force delete", danger: true });
      if (!ok) return;
      result = await (await fetch("/solution-explorer/git-branch-delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(state), name, force: true }) })).json();
    }
    if (!result.ok) showToast(result.error?.message || "Delete failed", true); else { await deps.loadBranches(deps.branchesDeps); render(); }
  };
  commands.branchRename = async (name) => {
    const newName = await showPrompt({ title: t("scm.branch.title"), message: t("scm.branch.newName") + " (" + name + ")", placeholder: name });
    if (!newName || !newName.trim()) return;
    const result = await (await fetch("/solution-explorer/git-branch-rename", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(state), oldName: name, newName: newName.trim() }) })).json();
    if (!result.ok) showToast(result.error?.message || "Rename failed", true); else { await deps.loadBranches(deps.branchesDeps); render(); }
  };
  commands.branchMerge = async (name) => {
    if (!(await showConfirm({ title: t("scm.branch.title"), message: t("scm.branch.mergeConfirm").replace("{name}", name), okText: t("scm.branch.merge") }))) return;
    const result = await (await fetch("/solution-explorer/git-branch-merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(state), name }) })).json();
    if (!result.ok) showToast(result.error?.message || "Merge failed", true); else { await deps.loadGitStatus(deps.actionsDeps); await deps.loadRecentCommits(deps.historyDeps); }
  };
  commands.branchPublish = async (name) => {
    if (!(await showConfirm({ title: t("scm.branch.title"), message: t("scm.branch.publishConfirm").replace("{name}", name), okText: t("scm.branch.publish") }))) return;
    const result = await (await fetch("/solution-explorer/git-branch-publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(state), name }) })).json();
    if (!result.ok) showToast(result.error?.message || "Publish failed", true); else await deps.loadBranches(deps.branchesDeps);
  };

  commands.commitsScroll = (evt) => {
    const el = evt.target as HTMLElement;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      deps.loadCommitsPage(deps.historyDeps);
    }
  };

  commands.refreshSCM = () => {
    // Silent refresh: re-render only the SCM region, no flash.
    deps.loadGitStatus(deps.actionsDeps);
    deps.loadRecentCommits(deps.historyDeps);
  };

  // The commit textarea is uncontrolled (see ScmPanel): after a
  // programmatic change (AI draft, clear after commit) the state no
  // longer matches the DOM node, so push it back imperatively.
  const syncCommitBox = () => {
    document.querySelectorAll(".sol-exp-commit-box .sol-exp-commit-input").forEach((el) => {
      const ta = el as HTMLTextAreaElement;
      if (ta.value !== state.scm.commitMessage) ta.value = state.scm.commitMessage;
    });
  };

  commands.commitMsg = (msg) => {
    state.scm.commitMessage = msg;
    // render() here is REQUIRED, not an optimization to avoid: React
    // decides whether a click on an interactive element is delivered from
    // the props snapshot of the LAST render. Toggling the `disabled`
    // attribute imperatively without rendering leaves React believing the
    // button is disabled, so onClick is suppressed — the button looks
    // enabled but never fires. (This is exactly the stage-first symptom.)
    // With the textarea uncontrolled, the render cannot disturb the caret
    // or the loaded history.
    render();
  };

  commands.genCommitMsg = async () => {
    if (state.scm.aiGenerating) return;
    state.scm.aiGenerating = true;
    render();
    try {
      const result = await (await fetch("/solution-explorer/llm-generate-commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ root: gitRoot(state) }),
      })).json();
      if (!result.ok) {
        showToast(result.error?.message || t("scm.ai.failed") + "unknown", true);
        return;
      }
      state.scm.commitMessage = result.value;
      render();
      syncCommitBox();
      // Re-enable the commit button after filling the message in place.
      document.querySelectorAll(".sol-exp-commit-btn").forEach((btn) => {
        if (state.scm.committing || !state.scm.commitMessage.trim()) btn.setAttribute("disabled", "disabled");
        else btn.removeAttribute("disabled");
      });
    } catch (err) {
      showToast(t("scm.ai.failed") + (err instanceof Error ? err.message : String(err)), true);
    } finally {
      state.scm.aiGenerating = false;
      render();
    }
  };

  commands.commit = () => {
    deps.doCommit(deps.actionsDeps);
  };

  commands.stage = (files) => {
    deps.doStage(files, deps.actionsDeps);
  };

  commands.unstage = (files) => {
    deps.doUnstage(files, deps.actionsDeps);
  };

  commands.discard = (files) => {
    deps.doDiscard(files, deps.actionsDeps);
  };

  commands.stageAll = () => {
    const all = [...state.scm.gitStatus?.unstaged || [], ...state.scm.gitStatus?.untracked || []].map((i) => i.path);
    if (all.length) deps.doStage(all, deps.actionsDeps);
  };

  commands.unstageAll = () => {
    const all = (state.scm.gitStatus?.staged || []).map((i) => i.path);
    if (all.length) deps.doUnstage(all, deps.actionsDeps);
  };

  commands.discardAll = async () => {
    const all = [...state.scm.gitStatus?.unstaged || [], ...state.scm.gitStatus?.untracked || []].map((i) => i.path);
    if (all.length && (await showConfirm({ title: t("scm.changes"), message: t("scm.discardAllConfirm"), okText: "Discard", danger: true }))) deps.doDiscard(all, deps.actionsDeps);
  };

  commands.toggleSection = (id) => {
    // Query inside the active panel: a global query could hit a
    // stale or duplicate SCM region after session/repo switches,
    // leaving the visible section stuck open.
    const scope = state.activeEl ?? document;
    const el = scope.querySelector(`[data-section="${id}"]`);
    if (el) {
      if (el.classList.contains("collapsed")) {
        el.classList.remove("collapsed");
        state.scm.collapsedSections.delete(id);
      } else {
        el.classList.add("collapsed");
        state.scm.collapsedSections.add(id);
      }
    }
  };

  return () => {
    delete commands.selectRepo;
    delete commands.commitDetail;
    delete commands.commitCheckout;
    delete commands.gitInit;
    delete commands.fetch;
    delete commands.pull;
    delete commands.push;
    delete commands.sync;
    delete commands.remotePanel;
    delete commands.remoteName;
    delete commands.remoteUrl;
    delete commands.remoteAdd;
    delete commands.remoteRemove;
    delete commands.remoteSetUrl;
    delete commands.branchPanel;
    delete commands.branchName;
    delete commands.branchFrom;
    delete commands.branchCreate;
    delete commands.branchCheckout;
    delete commands.branchDelete;
    delete commands.branchRename;
    delete commands.branchMerge;
    delete commands.branchPublish;
    delete commands.commitsScroll;
    delete commands.refreshSCM;
    delete commands.commitMsg;
    delete commands.genCommitMsg;
    delete commands.commit;
    delete commands.stage;
    delete commands.unstage;
    delete commands.discard;
    delete commands.stageAll;
    delete commands.unstageAll;
    delete commands.discardAll;
    delete commands.toggleSection;
  };
}
