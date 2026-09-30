/**
 * ObligaX Settlement Operations Queue
 * Real payment rail execution queue: Queued, Processing, Completed, and Failed.
 * Exposes actual adapter states (Simulated RTGS, Canton Internal, etc.) without false claims.
 */

import { store } from '../state/store.js';
import { api } from '../services/api.js';
import { createElement, clearChildren } from '../utils/dom.js';
import { createSvgIcon } from '../utils/icons.js';
import { formatCurrency, formatTimestamp, getStatusMeta } from '../utils/formatters.js';

let activeQueueTab = 'all'; // 'all' | 'queued' | 'processing' | 'completed' | 'failed'
let selectedSettlement = null;

export function renderSettlement(container) {
  const state = store.getState();
  const currentParty = state.currentParticipant;

  const allSettlements = state.settlements || [];

  // Filter by active tab
  let filtered = allSettlements;
  if (activeQueueTab === 'queued') {
    filtered = allSettlements.filter(s => s.status === 'SettlementCreated');
  } else if (activeQueueTab === 'processing') {
    filtered = allSettlements.filter(s => s.status === 'SettlementProcessing');
  } else if (activeQueueTab === 'completed') {
    filtered = allSettlements.filter(s => s.status === 'SettlementCompleted');
  } else if (activeQueueTab === 'failed') {
    filtered = allSettlements.filter(s => s.status === 'SettlementFailed');
  }

  // Calculate queue statistics
  const queuedCount = allSettlements.filter(s => s.status === 'SettlementCreated').length;
  const processingCount = allSettlements.filter(s => s.status === 'SettlementProcessing').length;
  const completedCount = allSettlements.filter(s => s.status === 'SettlementCompleted').length;
  const failedCount = allSettlements.filter(s => s.status === 'SettlementFailed').length;

  const wrapper = createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '20px' } });

  // 1. Adapter Status & Operational Warning
  const adapterBanner = createElement('div', {
    className: 'panel-card',
    style: { padding: '14px 18px', backgroundColor: 'var(--surface-primary)' }
  },
    createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' } },
      createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
        createSvgIcon('settlement', 18, 'text-primary'),
        createElement('div', null,
          createElement('div', { style: { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' } },
            'Settlement Gateway: Multi-Rail Adapter Engine'
          ),
          createElement('div', { style: { fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' } },
            'Rail Mode: Canton ACS dvP Delivery vs Payment · Connected Adapter: Mock/Simulated RTGS Adapter'
          )
        )
      ),
      createElement('div', { style: { display: 'flex', gap: '8px' } },
        createElement('button', {
          className: 'btn btn-secondary',
          onClick: () => store.refreshAll()
        }, createSvgIcon('refresh', 13), 'Refresh Queue')
      )
    )
  );
  wrapper.appendChild(adapterBanner);

  // 2. Queue Summary KPI Row
  const kpiRow = createElement('div', { className: 'exposure-kpi-grid' },
    createElement('div', {
      className: 'kpi-card',
      onClick: () => { activeQueueTab = 'all'; renderSettlement(container); }
    },
      createElement('div', { className: 'kpi-label' }, 'Total Instructions'),
      createElement('div', { className: 'kpi-value' }, String(allSettlements.length)),
      createElement('div', { className: 'kpi-meta' }, 'Cumulative clearing instructions')
    ),
    createElement('div', {
      className: 'kpi-card',
      onClick: () => { activeQueueTab = 'queued'; renderSettlement(container); }
    },
      createElement('div', { className: 'kpi-label' }, 'Queued'),
      createElement('div', { className: 'kpi-value' }, String(queuedCount)),
      createElement('div', { className: 'kpi-meta' }, 'Awaiting rail dispatch')
    ),
    createElement('div', {
      className: 'kpi-card',
      onClick: () => { activeQueueTab = 'processing'; renderSettlement(container); }
    },
      createElement('div', { className: 'kpi-label' }, 'In Flight (Processing)'),
      createElement('div', { className: 'kpi-value' }, String(processingCount)),
      createElement('div', { className: 'kpi-meta' }, 'Dispatched to payment rail')
    ),
    createElement('div', {
      className: 'kpi-card',
      onClick: () => { activeQueueTab = 'completed'; renderSettlement(container); }
    },
      createElement('div', { className: 'kpi-label' }, 'Completed / Finalized'),
      createElement('div', { className: 'kpi-value', style: { color: 'var(--state-success)' } }, String(completedCount)),
      createElement('div', { className: 'kpi-meta' }, 'Settled on ledger')
    ),
    createElement('div', {
      className: 'kpi-card',
      style: failedCount > 0 ? { borderColor: 'rgba(239, 68, 68, 0.4)' } : {},
      onClick: () => { activeQueueTab = 'failed'; renderSettlement(container); }
    },
      createElement('div', { className: 'kpi-label' }, 'Exceptions / Failed'),
      createElement('div', {
        className: 'kpi-value',
        style: failedCount > 0 ? { color: 'var(--state-danger)' } : {}
      }, String(failedCount)),
      createElement('div', { className: 'kpi-meta' }, 'Requires operations intervention')
    )
  );
  wrapper.appendChild(kpiRow);

  // 3. Queue Tabs & Filter Header
  const gridContainer = createElement('div', { className: 'grid-container' });

  const toolbar = createElement('div', { className: 'grid-toolbar' });
  const tabsContainer = createElement('div', { className: 'saved-views-tabs' });

  const tabs = [
    { id: 'all', label: `All Instructions (${allSettlements.length})` },
    { id: 'queued', label: `Queued (${queuedCount})` },
    { id: 'processing', label: `Processing (${processingCount})` },
    { id: 'completed', label: `Completed (${completedCount})` },
    { id: 'failed', label: `Exceptions (${failedCount})` }
  ];

  for (const t of tabs) {
    const tabEl = createElement('div', {
      className: `saved-view-tab ${activeQueueTab === t.id ? 'active' : ''}`,
      onClick: () => {
        activeQueueTab = t.id;
        renderSettlement(container);
      }
    }, t.label);
    tabsContainer.appendChild(tabEl);
  }
  toolbar.appendChild(tabsContainer);
  gridContainer.appendChild(toolbar);

  // Table Viewport
  const viewport = createElement('div', { className: 'table-viewport' });
  const table = createElement('table', { className: 'data-table' });

  const thead = createElement('thead', null,
    createElement('tr', null,
      createElement('th', null, 'Instruction ID'),
      createElement('th', null, 'Status'),
      createElement('th', null, 'Obligation ID'),
      createElement('th', null, 'Payer (Debtor)'),
      createElement('th', null, 'Payee (Creditor)'),
      createElement('th', { style: { textAlign: 'right' } }, 'Amount'),
      createElement('th', null, 'Rail'),
      createElement('th', null, 'Created'),
      createElement('th', { style: { textAlign: 'right' } }, 'Operations')
    )
  );
  table.appendChild(thead);

  const tbody = createElement('tbody');

  if (filtered.length === 0) {
    const emptyRow = createElement('tr', null,
      createElement('td', {
        colSpan: 9,
        style: { textAlign: 'center', padding: '40px 20px', color: 'var(--text-tertiary)' }
      },
        createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' } },
          createSvgIcon('settlement', 32, 'text-tertiary'),
          createElement('div', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' } },
            `No settlement instructions in '${activeQueueTab}' queue`
          ),
          createElement('div', { style: { fontSize: '11px' } },
            'Initiate direct settlement from Confirmed obligations or execute an accepted netting proposal.'
          )
        )
      )
    );
    tbody.appendChild(emptyRow);
  } else {
    for (const s of filtered) {
      const statusMeta = getStatusMeta(s.status);
      const isSelected = selectedSettlement && (selectedSettlement.settlementId === s.settlementId || selectedSettlement.id === s.id);
      const rail = s.rail || (s.requestMetadata && s.requestMetadata.settlementRail) || 'MOCK_RTGS';

      const tr = createElement('tr', {
        className: isSelected ? 'selected' : '',
        onClick: () => {
          selectedSettlement = s;
          renderSettlement(container);
        }
      });

      // ID
      tr.appendChild(createElement('td', { className: 'col-id' }, s.settlementId || s.id));

      // Status
      tr.appendChild(createElement('td', null,
        createElement('span', { className: `badge ${statusMeta.badgeClass}` }, statusMeta.label)
      ));

      // Obligation ID
      tr.appendChild(createElement('td', { className: 'mono', style: { color: 'var(--accent-primary)', cursor: 'pointer' }, onClick: (e) => {
        e.stopPropagation();
        const obl = state.obligations.find(o => o.obligationId === s.obligationId);
        if (obl) store.openDrawer(obl);
      } }, s.obligationId || 'N/A'));

      // Payer
      tr.appendChild(createElement('td', null, s.debtor || (s.requestMetadata && s.requestMetadata.debtor) || 'N/A'));

      // Payee
      tr.appendChild(createElement('td', null, s.creditor || (s.requestMetadata && s.requestMetadata.creditor) || 'N/A'));

      // Amount
      tr.appendChild(createElement('td', { className: 'col-amount' },
        formatCurrency(s.amount, s.currency || 'USD')
      ));

      // Rail
      tr.appendChild(createElement('td', null,
        createElement('span', { className: 'hash-pill' }, rail)
      ));

      // Timestamp
      tr.appendChild(createElement('td', { className: 'mono', style: { fontSize: '11px', color: 'var(--text-secondary)' } },
        formatTimestamp(s.createdAt).split(' ')[0]
      ));

      // Actions
      const tdActions = createElement('td', { className: 'col-actions' });
      const actionsBox = createElement('div', { style: { display: 'flex', gap: '6px', justifyContent: 'flex-end' } });

      if (s.status === 'SettlementCreated') {
        actionsBox.appendChild(createElement('button', {
          className: 'btn btn-primary',
          style: { padding: '2px 8px', fontSize: '11px' },
          onClick: async (e) => {
            e.stopPropagation();
            try {
              await api.processSettlement(s.settlementId || s.id);
              store.addNotification('info', `Settlement ${s.settlementId || s.id} dispatched to ${rail} rail.`);
              await store.refreshAll();
            } catch (err) {
              store.addNotification('error', `Dispatch failed: ${err.message}`);
            }
          }
        }, 'Dispatch Rail'));
      } else if (s.status === 'SettlementProcessing') {
        actionsBox.appendChild(createElement('button', {
          className: 'btn btn-primary',
          style: { padding: '2px 8px', fontSize: '11px' },
          onClick: async (e) => {
            e.stopPropagation();
            try {
              await api.completeSettlement(s.settlementId || s.id);
              store.addNotification('success', `Settlement ${s.settlementId || s.id} completed & finality recorded.`);
              await store.refreshAll();
            } catch (err) {
              store.addNotification('error', `Completion failed: ${err.message}`);
            }
          }
        }, 'Confirm Finality'));

        actionsBox.appendChild(createElement('button', {
          className: 'btn btn-secondary',
          style: { padding: '2px 8px', fontSize: '11px', color: 'var(--state-danger)' },
          onClick: async (e) => {
            e.stopPropagation();
            try {
              await api.failSettlement(s.settlementId || s.id, 'Rail adapter rejection');
              store.addNotification('warning', `Settlement ${s.settlementId || s.id} marked as failed.`);
              await store.refreshAll();
            } catch (err) {
              store.addNotification('error', `Failure update failed: ${err.message}`);
            }
          }
        }, 'Fail'));
      } else if (s.status === 'SettlementFailed') {
        actionsBox.appendChild(createElement('button', {
          className: 'btn btn-secondary',
          style: { padding: '2px 8px', fontSize: '11px' },
          onClick: async (e) => {
            e.stopPropagation();
            try {
              await api.processSettlement(s.settlementId || s.id);
              store.addNotification('info', `Retrying settlement ${s.settlementId || s.id}...`);
              await store.refreshAll();
            } catch (err) {
              store.addNotification('error', `Retry failed: ${err.message}`);
            }
          }
        }, 'Retry'));
      } else {
        actionsBox.appendChild(createElement('span', {
          style: { fontSize: '11px', color: 'var(--text-tertiary)' }
        }, 'Finalized'));
      }

      tdActions.appendChild(actionsBox);
      tr.appendChild(tdActions);

      tbody.appendChild(tr);
    }
  }

  table.appendChild(tbody);
  viewport.appendChild(table);
  gridContainer.appendChild(viewport);
  wrapper.appendChild(gridContainer);

  // 4. Detail Timeline Inspector (if item selected)
  if (selectedSettlement) {
    const s = selectedSettlement;
    const isCompleted = s.status === 'SettlementCompleted';
    const isProcessing = s.status === 'SettlementProcessing' || isCompleted;
    const isFailed = s.status === 'SettlementFailed';

    const detailPanel = createElement('div', {
      className: 'panel-card',
      style: { borderLeft: '3px solid var(--accent-primary)' }
    },
      createElement('div', { className: 'panel-card-header' },
        createElement('span', { className: 'panel-card-title' },
          createSvgIcon('clock', 16),
          `Settlement Execution Timeline: ${s.settlementId || s.id}`
        ),
        createElement('button', {
          className: 'btn btn-secondary',
          style: { padding: '2px 8px', fontSize: '11px' },
          onClick: () => {
            selectedSettlement = null;
            renderSettlement(container);
          }
        }, 'Close Inspector')
      ),

      createElement('div', { className: 'timeline-stages' },
        // Stage 1: Created
        createElement('div', { className: 'timeline-stage completed' },
          createElement('div', { className: 'timeline-stage-marker' }),
          createElement('div', { className: 'timeline-stage-title' }, '1. Instruction Created & Queued'),
          createElement('div', { className: 'timeline-stage-desc' },
            `Instruction registered on Canton ACS for obligation ${s.obligationId}. Initial state: SettlementCreated`
          ),
          createElement('div', { className: 'timeline-stage-time' }, formatTimestamp(s.createdAt))
        ),

        // Stage 2: Processing
        createElement('div', { className: `timeline-stage ${isProcessing ? 'completed' : (isFailed ? 'failed' : 'active')}` },
          createElement('div', { className: 'timeline-stage-marker' }),
          createElement('div', { className: 'timeline-stage-title' }, '2. Dispatched to Payment Rail Adapter'),
          createElement('div', { className: 'timeline-stage-desc' },
            `Adapter [${s.rail || 'MOCK_RTGS'}] dispatched. Awaiting clearing bank acknowledgment.`
          ),
          createElement('div', { className: 'timeline-stage-time' }, formatTimestamp(s.updatedAt || s.createdAt))
        ),

        // Stage 3: Finality
        createElement('div', { className: `timeline-stage ${isCompleted ? 'completed' : (isFailed ? 'failed' : '')}` },
          createElement('div', { className: 'timeline-stage-marker' }),
          createElement('div', { className: 'timeline-stage-title' }, isFailed ? '3. Rail Exception Encountered' : '3. Ledger Settlement Finality'),
          createElement('div', { className: 'timeline-stage-desc' },
            isCompleted
              ? 'External payment confirmed. Obligation status transitioned to Settled atomically on Canton.'
              : (isFailed ? 'Rail adapter returned an error. Manual intervention or retry required.' : 'Pending rail confirmation.')
          ),
          createElement('div', { className: 'timeline-stage-time' }, isCompleted ? formatTimestamp(s.updatedAt) : 'Pending')
        )
      )
    );
    wrapper.appendChild(detailPanel);
  }

  clearChildren(container);
  container.appendChild(wrapper);
}
