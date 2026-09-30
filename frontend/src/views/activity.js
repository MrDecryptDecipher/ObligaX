/**
 * ObligaX Activity & Event Stream Explorer
 * Chronological ledger and operational activity feed showing cryptographic audit logs,
 * Canton contract lifecycle mutations, and command provenance.
 */

import { store } from '../state/store.js';
import { createElement, clearChildren } from '../utils/dom.js';
import { createSvgIcon } from '../utils/icons.js';
import { formatTimestamp, truncateHash } from '../utils/formatters.js';

let searchQuery = '';
let selectedEventType = 'ALL';
let expandedLogId = null;

export function renderActivity(container) {
  const state = store.getState();
  const logs = state.auditLogs || [];

  // Filter logs
  let filtered = [...logs];

  if (selectedEventType !== 'ALL') {
    filtered = filtered.filter(l => (l.eventType || l.type || '').toUpperCase() === selectedEventType);
  }

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filtered = filtered.filter(l =>
      (l.entityId && l.entityId.toLowerCase().includes(q)) ||
      (l.actor && l.actor.toLowerCase().includes(q)) ||
      (l.eventType && l.eventType.toLowerCase().includes(q)) ||
      (l.currentHash && l.currentHash.toLowerCase().includes(q))
    );
  }

  // Sort descending by sequenceNumber or createdAt
  filtered.sort((a, b) => {
    if (a.sequenceNumber && b.sequenceNumber) return b.sequenceNumber - a.sequenceNumber;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  const wrapper = createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '20px' } });

  // 1. Controls Header
  const headerCard = createElement('div', { className: 'panel-card', style: { padding: '14px 18px' } },
    createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' } },
      createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
        createSvgIcon('activity', 20, 'text-primary'),
        createElement('div', null,
          createElement('div', { style: { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' } },
            'Ledger Event Stream & Provenance Log'
          ),
          createElement('div', { style: { fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' } },
            `Synchronized with Canton ACS · Total Recorded Events: ${logs.length}`
          )
        )
      ),

      createElement('div', { style: { display: 'flex', gap: '8px' } },
        createElement('button', {
          className: 'btn btn-secondary',
          onClick: () => store.refreshAll()
        }, createSvgIcon('refresh', 13), 'Refresh Events')
      )
    )
  );
  wrapper.appendChild(headerCard);

  // 2. Toolbar & Search
  const gridContainer = createElement('div', { className: 'grid-container' });
  const toolbar = createElement('div', { className: 'grid-toolbar' });
  const toolbarTop = createElement('div', { className: 'grid-toolbar-top' });

  // Search box
  const searchBox = createElement('div', { className: 'grid-search-box' },
    createElement('span', { className: 'grid-search-icon' }, createSvgIcon('search', 14)),
    createElement('input', {
      type: 'text',
      className: 'grid-search-input',
      placeholder: 'Search events by entity ID, actor, or hash...',
      value: searchQuery,
      onInput: (e) => {
        searchQuery = e.target.value;
        renderActivity(container);
      }
    })
  );

  // Event Type Filter
  const eventTypes = ['ALL', 'OBLIGATION_PROPOSED', 'OBLIGATION_ACCEPTED', 'OBLIGATION_CONFIRMED', 'NETTING_PROPOSED', 'NETTING_EXECUTED', 'SETTLEMENT_DISPATCHED', 'SETTLEMENT_COMPLETED'];
  const typeFilter = createElement('select', {
    className: 'form-control',
    style: { width: 'auto', padding: '4px 8px', fontSize: '12px' },
    onChange: (e) => {
      selectedEventType = e.target.value;
      renderActivity(container);
    }
  },
    ...eventTypes.map(t => createElement('option', { value: t, selected: selectedEventType === t }, t))
  );

  toolbarTop.appendChild(searchBox);
  toolbarTop.appendChild(typeFilter);
  toolbar.appendChild(toolbarTop);
  gridContainer.appendChild(toolbar);

  // Table
  const viewport = createElement('div', { className: 'table-viewport' });
  const table = createElement('table', { className: 'data-table' });

  const thead = createElement('thead', null,
    createElement('tr', null,
      createElement('th', { style: { width: '60px' } }, 'Seq #'),
      createElement('th', null, 'Event Type'),
      createElement('th', null, 'Actor'),
      createElement('th', null, 'Entity Reference'),
      createElement('th', null, 'Cryptographic Hash'),
      createElement('th', null, 'Timestamp'),
      createElement('th', { style: { textAlign: 'right' } }, 'Payload')
    )
  );
  table.appendChild(thead);

  const tbody = createElement('tbody');

  if (filtered.length === 0) {
    const emptyRow = createElement('tr', null,
      createElement('td', {
        colSpan: 7,
        style: { textAlign: 'center', padding: '40px 20px', color: 'var(--text-tertiary)' }
      },
        createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' } },
          createSvgIcon('activity', 32, 'text-tertiary'),
          createElement('div', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' } },
            'No ledger events match the filter'
          )
        )
      )
    );
    tbody.appendChild(emptyRow);
  } else {
    for (const log of filtered) {
      const isExpanded = expandedLogId === log.id;
      const typeStr = (log.eventType || log.type || 'EVENT').toUpperCase();

      const tr = createElement('tr', {
        style: { cursor: 'pointer' },
        onClick: () => {
          expandedLogId = isExpanded ? null : log.id;
          renderActivity(container);
        }
      });

      // Seq
      tr.appendChild(createElement('td', { className: 'mono', style: { color: 'var(--text-tertiary)' } },
        String(log.sequenceNumber || '#')
      ));

      // Event Type
      tr.appendChild(createElement('td', null,
        createElement('span', { className: 'badge badge-confirmed', style: { fontSize: '10px' } }, typeStr)
      ));

      // Actor
      tr.appendChild(createElement('td', { style: { fontWeight: '600' } }, log.actor || 'System'));

      // Entity Reference
      tr.appendChild(createElement('td', {
        className: 'mono',
        style: { color: 'var(--accent-primary)', cursor: 'pointer' },
        onClick: (e) => {
          e.stopPropagation();
          const obl = state.obligations.find(o => o.obligationId === log.entityId);
          if (obl) store.openDrawer(obl);
        }
      }, log.entityId || 'N/A'));

      // Hash
      tr.appendChild(createElement('td', null,
        createElement('span', { className: 'hash-pill' }, truncateHash(log.currentHash || log.hash || '', 10))
      ));

      // Timestamp
      tr.appendChild(createElement('td', { className: 'mono', style: { fontSize: '11px', color: 'var(--text-secondary)' } },
        formatTimestamp(log.createdAt || log.timestamp)
      ));

      // Actions / View
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
            colSpan: 7,
            style: { backgroundColor: 'var(--surface-secondary)', padding: '12px 16px' }
          },
            createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
              createElement('div', { style: { fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' } },
                'Cryptographic Event Provenance:'
              ),
              createElement('div', { className: 'mono', style: { fontSize: '11px', color: 'var(--text-tertiary)' } },
                `Previous Hash: ${log.previousHash || 'Genesis'} → Current Hash: ${log.currentHash || 'N/A'}`
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
