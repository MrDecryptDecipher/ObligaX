/**
 * ObligaX Reconciliation Investigation Workbench
 * Two-way audit & integrity verification between Canton Active Contract Set (ACS)
 * and PostgreSQL Read-Model Projections.
 */

import { store } from '../state/store.js';
import { api } from '../services/api.js';
import { createElement, clearChildren } from '../utils/dom.js';
import { createSvgIcon } from '../utils/icons.js';
import { formatTimestamp } from '../utils/formatters.js';

let isRunning = false;
let selectedSeverity = 'ALL'; // 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM'

export function renderReconciliation(container) {
  const state = store.getState();
  const report = state.reconciliationReport;

  const wrapper = createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '24px' } });

  // 1. Reconciliation Header & Trigger Banner
  const headerCard = createElement('div', { className: 'panel-card', style: { padding: '16px 20px' } },
    createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' } },
      createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
        createSvgIcon('reconciliation', 24, 'text-primary'),
        createElement('div', null,
          createElement('div', { style: { fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' } },
            'Canton ACS vs PostgreSQL Projection Reconciliation'
          ),
          createElement('div', { style: { fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' } },
            report ? `Last Reconciled: ${formatTimestamp(report.timestamp)} · Report ID: ${report.reportId || 'REC-LATEST'}` : 'No previous reconciliation report loaded.'
          )
        )
      ),

      createElement('div', { style: { display: 'flex', gap: '8px' } },
        createElement('button', {
          className: 'btn btn-secondary',
          disabled: !report,
          onClick: () => {
            if (!report) return;
            const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute('href', dataStr);
            downloadAnchor.setAttribute('download', `reconciliation-${Date.now()}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
          }
        }, createSvgIcon('download', 14), 'Export Audit JSON'),

        createElement('button', {
          className: 'btn btn-primary',
          disabled: isRunning,
          onClick: async () => {
            isRunning = true;
            renderReconciliation(container);
            try {
              store.addNotification('info', 'Triggering ACS ledger scan & dual-model reconciliation...');
              const newReport = await api.runReconciliation();
              store.setReconciliationReport(newReport);
              store.addNotification(newReport.isBalanced ? 'success' : 'warning',
                newReport.isBalanced
                  ? 'Reconciliation complete: Canton ACS and PostgreSQL are fully balanced.'
                  : `Reconciliation found ${newReport.discrepancies?.length || 0} discrepancies.`);
            } catch (err) {
              store.addNotification('error', `Reconciliation failed: ${err.message}`);
            } finally {
              isRunning = false;
              renderReconciliation(container);
            }
          }
        }, createSvgIcon('refresh', 14), isRunning ? 'Scanning ACS...' : 'Execute Full Reconciliation')
      )
    )
  );
  wrapper.appendChild(headerCard);

  if (!report) {
    wrapper.appendChild(
      createElement('div', { className: 'panel-card', style: { padding: '40px 20px', textAlign: 'center', color: 'var(--text-tertiary)' } },
        createSvgIcon('reconciliation', 32, 'text-tertiary'),
        createElement('div', { style: { marginTop: '12px', fontSize: '14px', fontWeight: '600', color: 'var(--text-secondary)' } },
          'Reconciliation Baseline Not Established'
        ),
        createElement('div', { style: { fontSize: '12px', marginTop: '6px' } },
          'Click "Execute Full Reconciliation" to compare all active Canton contract IDs against the read database.'
        )
      )
    );
    clearChildren(container);
    container.appendChild(wrapper);
    return;
  }

  // 2. Control Metrics Stat Banner
  const isBalanced = report.isBalanced !== false && (!report.discrepancies || report.discrepancies.length === 0);
  const discrepancies = report.discrepancies || [];

  const statBanner = createElement('div', { className: 'reconciliation-stat-banner' },
    createElement('div', { className: 'rec-stat-col' },
      createElement('span', { className: 'rec-stat-label' }, 'Canton ACS Active'),
      createElement('span', { className: 'rec-stat-val' }, String(report.ledgerCount || state.obligations.length))
    ),
    createElement('div', { className: 'rec-stat-col' },
      createElement('span', { className: 'rec-stat-label' }, 'DB Read Projections'),
      createElement('span', { className: 'rec-stat-val' }, String(report.dbCount || state.obligations.length))
    ),
    createElement('div', { className: 'rec-stat-col' },
      createElement('span', { className: 'rec-stat-label' }, 'Matched Contracts'),
      createElement('span', { className: 'rec-stat-val' }, String(report.matchedCount || state.obligations.length))
    ),
    createElement('div', { className: 'rec-stat-col' },
      createElement('span', { className: 'rec-stat-label' }, 'Discrepancies'),
      createElement('span', {
        className: 'rec-stat-val',
        style: discrepancies.length > 0 ? { color: 'var(--state-danger)' } : { color: 'var(--state-success)' }
      }, String(discrepancies.length))
    ),
    createElement('div', { className: 'rec-stat-col' },
      createElement('span', { className: 'rec-stat-label' }, 'Reconciliation State'),
      createElement('span', {
        className: `badge ${isBalanced ? 'badge-confirmed' : 'badge-failed'}`,
        style: { fontSize: '12px', padding: '4px 10px' }
      }, isBalanced ? 'FULL EQUILIBRIUM' : 'UNBALANCED MISMATCH')
    )
  );
  wrapper.appendChild(statBanner);

  // 3. Discrepancies Investigation Section
  const discSection = createElement('div', { className: 'panel-card', style: { padding: '16px 20px' } });

  const discHeader = createElement('div', { className: 'panel-card-header' },
    createElement('span', { className: 'panel-card-title' },
      createSvgIcon('alertTriangle', 16),
      `Discrepancy Investigation Ledger (${discrepancies.length})`
    ),
    createElement('div', { style: { display: 'flex', gap: '6px' } },
      createElement('button', {
        className: `btn btn-secondary ${selectedSeverity === 'ALL' ? 'active' : ''}`,
        style: { padding: '2px 8px', fontSize: '11px' },
        onClick: () => { selectedSeverity = 'ALL'; renderReconciliation(container); }
      }, 'All'),
      createElement('button', {
        className: `btn btn-secondary ${selectedSeverity === 'CRITICAL' ? 'active' : ''}`,
        style: { padding: '2px 8px', fontSize: '11px', color: 'var(--state-danger)' },
        onClick: () => { selectedSeverity = 'CRITICAL'; renderReconciliation(container); }
      }, 'Critical'),
      createElement('button', {
        className: `btn btn-secondary ${selectedSeverity === 'HIGH' ? 'active' : ''}`,
        style: { padding: '2px 8px', fontSize: '11px' },
        onClick: () => { selectedSeverity = 'HIGH'; renderReconciliation(container); }
      }, 'High')
    )
  );
  discSection.appendChild(discHeader);

  const filteredDiscrepancies = discrepancies.filter(d => {
    if (selectedSeverity === 'ALL') return true;
    return d.severity === selectedSeverity;
  });

  if (discrepancies.length === 0) {
    discSection.appendChild(
      createElement('div', { style: { padding: '32px 0', textAlign: 'center', color: 'var(--state-success)' } },
        createSvgIcon('check', 36, 'text-success'),
        createElement('div', { style: { marginTop: '8px', fontSize: '14px', fontWeight: '600' } },
          'No Ledger-to-Projection Drift Detected'
        ),
        createElement('div', { style: { fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' } },
          'Every active contract on Canton Participant synchronizer matches PostgreSQL read models in state, parties, and amounts.'
        )
      )
    );
  } else {
    for (const d of filteredDiscrepancies) {
      const card = createElement('div', { className: 'discrepancy-card' },
        createElement('div', { className: 'discrepancy-header' },
          createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            createElement('span', { className: 'mono', style: { fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)' } },
              d.obligationId || 'Unknown ID'
            ),
            createElement('span', { className: 'badge badge-disputed' }, d.type || 'STATE_MISMATCH')
          ),
          createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            createElement('span', {
              className: `badge ${d.severity === 'CRITICAL' ? 'badge-failed' : 'badge-warning'}`
            }, d.severity || 'MEDIUM'),
            createElement('button', {
              className: 'btn btn-secondary',
              style: { padding: '2px 6px', fontSize: '11px' },
              onClick: () => {
                const obl = state.obligations.find(o => o.obligationId === d.obligationId);
                if (obl) store.openDrawer(obl);
                else store.addNotification('info', `Obligation ${d.obligationId} not found in active projections.`);
              }
            }, 'Inspect Obligation')
          )
        ),

        createElement('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0' } },
          d.description || 'Discrepancy detected between ledger active contract and read projection.'
        ),

        // Dual-Model Field Diff
        createElement('div', { className: 'discrepancy-diff-grid' },
          createElement('div', null,
            createElement('div', { style: { color: 'var(--text-tertiary)', marginBottom: '2px' } }, 'CANTON ACS CONTRACT:'),
            createElement('div', { style: { color: 'var(--state-success)', fontWeight: '600' } },
              d.ledgerValue || 'ACTIVE ON LEDGER'
            )
          ),
          createElement('div', null,
            createElement('div', { style: { color: 'var(--text-tertiary)', marginBottom: '2px' } }, 'POSTGRESQL READ MODEL:'),
            createElement('div', { style: { color: 'var(--state-danger)', fontWeight: '600' } },
              d.dbValue || 'OUT OF SYNC'
            )
          )
        )
      );
      discSection.appendChild(card);
    }
  }
  wrapper.appendChild(discSection);

  clearChildren(container);
  container.appendChild(wrapper);
}
