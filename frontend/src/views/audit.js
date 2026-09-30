/**
 * ObligaX Audit Chain Explorer
 * Tamper-evident cryptographic ledger audit log with sequential SHA-256 hash-chaining
 * and on-demand mathematical verification from genesis block to current tip.
 */

import { store } from '../state/store.js';
import { api } from '../services/api.js';
import { createElement, clearChildren } from '../utils/dom.js';
import { createSvgIcon } from '../utils/icons.js';
import { formatTimestamp, truncateHash } from '../utils/formatters.js';

let isVerifying = false;
let verificationResult = null;
let expandedAuditId = null;

export function renderAudit(container) {
  const state = store.getState();
  const logs = state.auditLogs || [];

  const wrapper = createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '20px' } });

  // 1. Audit Tip Banner & Chain Verification CTA
  const tipBanner = createElement('div', { className: 'panel-card', style: { padding: '16px 20px' } },
    createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' } },
      createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
        createSvgIcon('audit', 24, 'text-primary'),
        createElement('div', null,
          createElement('div', { style: { fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' } },
            'Cryptographic Audit Chain (SHA-256)'
          ),
          createElement('div', { className: 'mono', style: { fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' } },
            `Tip Hash: ${state.auditTipHash ? state.auditTipHash : 'Genesis'} · Total Sequential Entries: ${logs.length}`
          )
        )
      ),

      createElement('div', { style: { display: 'flex', gap: '8px' } },
        createElement('button', {
          className: 'btn btn-primary',
          disabled: isVerifying,
          onClick: async () => {
            isVerifying = true;
            renderAudit(container);
            try {
              store.addNotification('info', 'Executing cryptographic hash chain verification...');
              const res = await api.verifyAuditChain();
              verificationResult = res;
              if (res.valid) {
                store.addNotification('success', `Audit chain verified: all ${res.totalRecords} entries cryptographically intact!`);
              } else {
                store.addNotification('error', `CRITICAL AUDIT BREACH: Hash chain broken at index ${res.brokenLinkIndex}!`);
              }
            } catch (err) {
              store.addNotification('error', `Verification failed: ${err.message}`);
            } finally {
              isVerifying = false;
              renderAudit(container);
            }
          }
        }, createSvgIcon('shieldCheck', 14), isVerifying ? 'Verifying Hashes...' : 'Verify Chain Integrity')
      )
    )
  );
  wrapper.appendChild(tipBanner);

  // 2. Verification Result Card (if verified)
  if (verificationResult) {
    const isValid = verificationResult.valid;
    const resCard = createElement('div', {
      className: 'panel-card',
      style: {
        borderLeft: `3px solid ${isValid ? 'var(--state-success)' : 'var(--state-danger)'}`,
        backgroundColor: isValid ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)'
      }
    },
      createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
        createSvgIcon(isValid ? 'shieldCheck' : 'alertTriangle', 24, isValid ? 'text-success' : 'text-danger'),
        createElement('div', { style: { flex: 1 } },
          createElement('div', { style: { fontSize: '14px', fontWeight: '700', color: isValid ? 'var(--state-success)' : 'var(--state-danger)' } },
            isValid ? 'CRYPTOGRAPHIC INTEGRITY CONFIRMED' : 'INTEGRITY VERIFICATION FAILURE'
          ),
          createElement('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' } },
            isValid
              ? `Mathematically verified sequential SHA-256 hashes from genesis record through ${verificationResult.totalRecords} events. Zero tampering detected.`
              : `Broken hash link identified at index ${verificationResult.brokenLinkIndex}. Potential data corruption or tampering detected.`
          )
        )
      )
    );
    wrapper.appendChild(resCard);
  }

  // 3. Sequential Hash-Chain Table
  const gridContainer = createElement('div', { className: 'grid-container' });
  const viewport = createElement('div', { className: 'table-viewport' });
  const table = createElement('table', { className: 'data-table' });

  const thead = createElement('thead', null,
    createElement('tr', null,
      createElement('th', { style: { width: '60px' } }, 'Seq #'),
      createElement('th', null, 'Event Type'),
      createElement('th', null, 'Actor'),
      createElement('th', null, 'Entity Reference'),
      createElement('th', null, 'Previous Hash'),
      createElement('th', null, 'Current Block Hash'),
      createElement('th', null, 'Timestamp'),
      createElement('th', { style: { textAlign: 'right' } }, 'Inspect')
    )
  );
  table.appendChild(thead);

  const tbody = createElement('tbody');

  if (logs.length === 0) {
    const emptyRow = createElement('tr', null,
      createElement('td', {
        colSpan: 8,
        style: { textAlign: 'center', padding: '40px 20px', color: 'var(--text-tertiary)' }
      },
        createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' } },
          createSvgIcon('audit', 32, 'text-tertiary'),
          createElement('div', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' } },
            'No audit records found'
          )
        )
      )
    );
    tbody.appendChild(emptyRow);
  } else {
    // Sorted descending by sequenceNumber
    const sorted = [...logs].sort((a, b) => (b.sequenceNumber || 0) - (a.sequenceNumber || 0));

    for (const log of sorted) {
      const isExpanded = expandedAuditId === log.id;

      const tr = createElement('tr', {
        onClick: () => {
          expandedAuditId = isExpanded ? null : log.id;
          renderAudit(container);
        }
      });

      // Seq #
      tr.appendChild(createElement('td', { className: 'mono', style: { fontWeight: '700', color: 'var(--text-primary)' } },
        `#${log.sequenceNumber || 1}`
      ));

      // Event Type
      tr.appendChild(createElement('td', null,
        createElement('span', { className: 'badge badge-confirmed', style: { fontSize: '10px' } },
          (log.eventType || log.type || 'LOG').toUpperCase()
        )
      ));

      // Actor
      tr.appendChild(createElement('td', { style: { fontWeight: '600' } }, log.actor || 'System'));

      // Entity
      tr.appendChild(createElement('td', { className: 'mono', style: { color: 'var(--accent-primary)' } },
        log.entityId || 'N/A'
      ));

      // Prev Hash
      tr.appendChild(createElement('td', null,
        createElement('span', { className: 'hash-pill', style: { color: 'var(--text-tertiary)' } },
          truncateHash(log.previousHash || 'Genesis', 8)
        )
      ));

      // Current Hash
      tr.appendChild(createElement('td', null,
        createElement('span', { className: 'hash-pill', style: { borderColor: 'rgba(37, 99, 235, 0.4)', color: 'var(--text-primary)' } },
          truncateHash(log.currentHash || log.hash || '', 8)
        )
      ));

      // Timestamp
      tr.appendChild(createElement('td', { className: 'mono', style: { fontSize: '11px', color: 'var(--text-secondary)' } },
        formatTimestamp(log.createdAt || log.timestamp)
      ));

      // Action
      tr.appendChild(createElement('td', { className: 'col-actions' },
        createElement('button', {
          className: 'btn btn-secondary',
          style: { padding: '2px 6px', fontSize: '11px' }
        }, isExpanded ? 'Hide' : 'Inspect')
      ));

      tbody.appendChild(tr);

      // Expanded Payload Row
      if (isExpanded) {
        const payloadRow = createElement('tr', null,
          createElement('td', {
            colSpan: 8,
            style: { backgroundColor: 'var(--surface-secondary)', padding: '12px 16px' }
          },
            createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
              createElement('div', { style: { fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' } },
                'Cryptographic Proof & Entry Payload:'
              ),
              createElement('div', { className: 'mono', style: { fontSize: '11px', color: 'var(--text-tertiary)' } },
                `SHA256(${log.previousHash || '0'} + ${log.eventType} + payload) = ${log.currentHash}`
              ),
              createElement('pre', {
                className: 'mono',
                style: {
                  backgroundColor: 'var(--surface-canvas)',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11px',
                  color: 'var(--text-primary)',
                  overflowX: 'auto',
                  border: '1px solid var(--border-default)',
                  margin: 0
                }
              }, JSON.stringify(log.payload || log.data || log, null, 2))
            )
          )
        );
        tbody.appendChild(payloadRow);
      }
    }
  }

  table.appendChild(tbody);
  viewport.appendChild(table);
  gridContainer.appendChild(viewport);
  wrapper.appendChild(gridContainer);

  clearChildren(container);
  container.appendChild(wrapper);
}
