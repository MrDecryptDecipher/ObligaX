/**
 * ObligaX Command Palette (Cmd+K / Ctrl+K)
 * Fast, keyboard-accessible command and search runner.
 */

import { store } from '../state/store.js';
import { createElement, trapFocus } from '../utils/dom.js';
import { createSvgIcon } from '../utils/icons.js';
import { formatCurrency } from '../utils/formatters.js';

let selectedIndex = 0;
let resultsList = [];
let cleanupFocusTrap = null;

export function renderCommandPalette(container) {
  const state = store.getState();
  if (!state.commandPaletteOpen) {
    if (cleanupFocusTrap) {
      cleanupFocusTrap();
      cleanupFocusTrap = null;
    }
    container.innerHTML = '';
    return;
  }

  function getSearchResults(query = '') {
    const q = query.toLowerCase().trim();
    const results = [];

    // 1. Navigation Pages
    const pages = [
      { id: 'overview', name: 'Overview', group: 'Navigation', icon: 'overview' },
      { id: 'obligations', name: 'Obligations Data Grid', group: 'Navigation', icon: 'obligations' },
      { id: 'netting', name: 'Bilateral Netting Workbench', group: 'Navigation', icon: 'netting' },
      { id: 'settlement', name: 'Direct Settlement Monitor', group: 'Navigation', icon: 'settlement' },
      { id: 'reconciliation', name: 'Reconciliation & Discrepancies', group: 'Navigation', icon: 'reconciliation' },
      { id: 'activity', name: 'Activity Feed', group: 'Navigation', icon: 'activity' },
      { id: 'network', name: 'Canton Network Topology', group: 'Navigation', icon: 'network' },
      { id: 'participants', name: 'Participants & Governance Limits', group: 'Navigation', icon: 'participants' },
      { id: 'policies', name: 'Network Risk Policies', group: 'Navigation', icon: 'policies' },
      { id: 'audit', name: 'Audit Explorer (SHA-256 Hash Chain)', group: 'Navigation', icon: 'audit' },
      { id: 'health', name: 'System Health & Telemetry', group: 'Navigation', icon: 'health' }
    ];

    for (const p of pages) {
      if (!q || p.name.toLowerCase().includes(q) || p.id.includes(q)) {
        results.push({
          type: 'page',
          id: p.id,
          title: p.name,
          category: 'Navigation',
          icon: p.icon,
          action: () => {
            store.setActiveView(p.id);
            store.toggleCommandPalette(false);
          }
        });
      }
    }

    // 2. Actions
    const actions = [
      {
        id: 'act-new-obl',
        title: 'Propose New Financial Obligation',
        category: 'Quick Actions',
        icon: 'plus',
        action: () => {
          store.setActiveView('obligations');
          store.openModal('create-obligation');
          store.toggleCommandPalette(false);
        }
      },
      {
        id: 'act-run-rec',
        title: 'Run Ledger Reconciliation',
        category: 'Quick Actions',
        icon: 'reconciliation',
        action: async () => {
          store.setActiveView('reconciliation');
          store.toggleCommandPalette(false);
          await store.runReconciliation();
        }
      },
      {
        id: 'act-verify-audit',
        title: 'Verify Tamper-Evident Audit Chain Integrity',
        category: 'Quick Actions',
        icon: 'audit',
        action: async () => {
          store.setActiveView('audit');
          store.toggleCommandPalette(false);
          await store.fetchAuditLogs();
        }
      }
    ];

    for (const a of actions) {
      if (!q || a.title.toLowerCase().includes(q)) {
        results.push(a);
      }
    }

    // 3. Search Obligations
    if (q) {
      for (const o of state.obligations) {
        if (
          o.obligationId.toLowerCase().includes(q) ||
          o.creditor.toLowerCase().includes(q) ||
          o.debtor.toLowerCase().includes(q) ||
          (o.description && o.description.toLowerCase().includes(q))
        ) {
          results.push({
            type: 'obligation',
            id: o.obligationId,
            title: `${o.obligationId}: ${o.creditor} ← ${o.debtor} (${formatCurrency(o.amount, o.currency)})`,
            meta: o.status,
            category: 'Obligations',
            icon: 'obligations',
            action: () => {
              store.setActiveView('obligations');
              store.openDrawer('obligation', o);
              store.toggleCommandPalette(false);
            }
          });
        }
      }
    }

    return results.slice(0, 15);
  }

  resultsList = getSearchResults('');
  selectedIndex = 0;

  const backdrop = createElement('div', {
    className: 'modal-backdrop open',
    onClick: (e) => {
      if (e.target === backdrop) store.toggleCommandPalette(false);
    }
  });

  const paletteContainer = createElement('div', {
    className: 'palette-container',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Command Palette'
  });

  const searchInput = createElement('input', {
    type: 'text',
    className: 'palette-input',
    placeholder: 'Type a command, page name, or obligation ID...',
    autofocus: true
  });

  const resultsBox = createElement('div', { className: 'palette-results' });

  function renderList() {
    resultsBox.innerHTML = '';
    if (resultsList.length === 0) {
      resultsBox.appendChild(
        createElement('div', {
          style: { padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }
        }, 'No matching commands or records found.')
      );
      return;
    }

    let currentGroup = '';
    resultsList.forEach((item, index) => {
      if (item.category !== currentGroup) {
        currentGroup = item.category;
        resultsBox.appendChild(createElement('div', { className: 'palette-group-title' }, currentGroup));
      }

      const isSelected = index === selectedIndex;
      const itemElement = createElement('div', {
        className: `palette-item ${isSelected ? 'selected' : ''}`,
        role: 'option',
        'aria-selected': isSelected ? 'true' : 'false',
        onClick: () => item.action(),
        onMouseEnter: () => {
          selectedIndex = index;
          updateSelectionHighlight();
        }
      },
        createElement('div', { className: 'palette-item-main' },
          createElement('span', { className: 'palette-item-icon' }, createSvgIcon(item.icon, 14)),
          createElement('span', null, item.title)
        ),
        item.meta ? createElement('span', { className: 'palette-item-meta' }, item.meta) : null
      );

      resultsBox.appendChild(itemElement);
    });
  }

  function updateSelectionHighlight() {
    const items = resultsBox.querySelectorAll('.palette-item');
    items.forEach((el, idx) => {
      if (idx === selectedIndex) {
        el.classList.add('selected');
        el.scrollIntoView({ block: 'nearest' });
      } else {
        el.classList.remove('selected');
      }
    });
  }

  searchInput.addEventListener('input', (e) => {
    resultsList = getSearchResults(e.target.value);
    selectedIndex = 0;
    renderList();
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (resultsList.length > 0) {
        selectedIndex = (selectedIndex + 1) % resultsList.length;
        updateSelectionHighlight();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (resultsList.length > 0) {
        selectedIndex = (selectedIndex - 1 + resultsList.length) % resultsList.length;
        updateSelectionHighlight();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (resultsList[selectedIndex]) {
        resultsList[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      store.toggleCommandPalette(false);
    }
  });

  const inputWrap = createElement('div', { className: 'palette-input-wrap' },
    createSvgIcon('search', 16, 'text-tertiary'),
    searchInput,
    createElement('kbd', { className: 'cmd-kbd' }, 'ESC')
  );

  paletteContainer.appendChild(inputWrap);
  paletteContainer.appendChild(resultsBox);
  backdrop.appendChild(paletteContainer);

  container.innerHTML = '';
  container.appendChild(backdrop);

  renderList();
  searchInput.focus();

  cleanupFocusTrap = trapFocus(paletteContainer);
}
