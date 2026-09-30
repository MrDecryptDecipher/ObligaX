/**
 * ObligaX Application Bootstrap — main.js
 * Mounts the institutional shell (header, sidebar, workspace),
 * initialises reactive rendering via store subscriptions,
 * and wires global keyboard shortcuts.
 */

import { store } from './state/store.js';
import { renderHeader } from './components/header.js';
import { renderSidebar } from './components/sidebar.js';
import { renderCommandPalette } from './components/command-palette.js';
import { renderNotifications } from './components/notifications.js';
import { renderDetailDrawer } from './components/drawer.js';
import { renderModal } from './components/confirmation-modal.js';

// Views
import { renderOverview } from './views/overview.js';
import { renderObligations } from './views/obligations.js';
import { renderNetting } from './views/netting.js';
import { renderSettlement } from './views/settlement.js';
import { renderReconciliation } from './views/reconciliation.js';
import { renderActivity } from './views/activity.js';
import { renderNetwork } from './views/network.js';
import { renderParticipants } from './views/participants.js';
import { renderPolicies } from './views/policies.js';
import { renderAudit } from './views/audit.js';
import { renderHealth } from './views/health.js';

// ── Shell container references ──────────────────────────────────────
const headerRoot   = document.getElementById('header-root');
const sidebarRoot  = document.getElementById('sidebar-root');
const workspaceEl  = document.getElementById('workspace-content');
const drawerRoot   = document.getElementById('drawer-root');
const modalRoot    = document.getElementById('modal-root');
const notifRoot    = document.getElementById('notifications-root');
const cmdRoot      = document.getElementById('command-palette-root');

// ── View router ──────────────────────────────────────────────────────
const VIEW_RENDERERS = {
  overview:       renderOverview,
  obligations:    renderObligations,
  netting:        renderNetting,
  settlement:     renderSettlement,
  reconciliation: renderReconciliation,
  activity:       renderActivity,
  network:        renderNetwork,
  participants:   renderParticipants,
  policies:       renderPolicies,
  audit:          renderAudit,
  health:         renderHealth
};

let lastRenderedView = null;

function renderCurrentView(state) {
  const view = state.activeView || 'overview';
  const render = VIEW_RENDERERS[view] || renderOverview;

  // Only re-render workspace when view changed or on explicit data refresh
  if (workspaceEl) {
    try {
      render(workspaceEl);
    } catch (err) {
      console.error(`[ObligaX] Error rendering view "${view}":`, err);
      workspaceEl.innerHTML = `
        <div style="padding:40px;text-align:center;color:var(--state-danger);font-family:var(--font-mono);font-size:12px;">
          View render error in <strong>${view}</strong>: ${err.message}
        </div>`;
    }
  }

  lastRenderedView = view;
}

// ── Reactive Shell Renderer ──────────────────────────────────────────
function renderShell(state) {
  if (headerRoot)  renderHeader(headerRoot);
  if (sidebarRoot) renderSidebar(sidebarRoot);
}

function renderOverlays(_state) {
  if (drawerRoot)  renderDetailDrawer(drawerRoot);
  if (modalRoot)   renderModal(modalRoot);
  if (notifRoot)   renderNotifications(notifRoot);
  if (cmdRoot)     renderCommandPalette(cmdRoot);
}

// ── Full reactive subscription ───────────────────────────────────────
store.subscribe((state) => {
  renderShell(state);
  renderCurrentView(state);
  renderOverlays(state);
});

// ── Global Keyboard Shortcuts ────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // ⌘K / Ctrl+K — Command Palette
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    store.toggleCommandPalette();
    return;
  }

  // Escape — close command palette, drawer, or modal
  if (e.key === 'Escape') {
    const s = store.getState();
    if (s.commandPaletteOpen) {
      store.toggleCommandPalette(false);
    } else if (s.activeModal) {
      store.closeModal();
    } else if (s.activeDrawer) {
      store.closeDrawer();
    }
    return;
  }
});

// ── Auto-refresh heartbeat (every 60 seconds) ────────────────────────
let autoRefreshInterval = null;

function startAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(() => {
    const s = store.getState();
    if (!s.isRefreshing) {
      store.refreshAll();
    }
  }, 60_000);
}

// ── Application Boot ─────────────────────────────────────────────────
async function boot() {
  // Initial shell render with loading state
  if (headerRoot)  renderHeader(headerRoot);
  if (sidebarRoot) renderSidebar(sidebarRoot);

  // Show loading placeholder in workspace
  if (workspaceEl) {
    workspaceEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--text-tertiary);font-family:var(--font-mono);font-size:12px;">
        <div style="text-align:center;">
          <div style="margin-bottom:8px;">Connecting to Canton Ledger...</div>
          <div style="font-size:10px;color:var(--text-tertiary);">Fetching health, obligations, and participant topology</div>
        </div>
      </div>`;
  }

  // Fetch all data from backend
  await store.refreshAll();

  // Render initial view
  const initialState = store.getState();
  renderCurrentView(initialState);
  renderOverlays(initialState);

  // Start background heartbeat
  startAutoRefresh();

  console.info('[ObligaX] Application boot complete. Active view:', initialState.activeView);
}

boot().catch(err => {
  console.error('[ObligaX] Fatal boot error:', err);
  if (workspaceEl) {
    workspaceEl.innerHTML = `
      <div style="padding:40px;text-align:center;color:var(--state-danger);font-family:var(--font-mono);font-size:12px;font-weight:600;">
        Application boot failed: ${err.message}
      </div>`;
  }
});
