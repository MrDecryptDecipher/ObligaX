/**
 * ObligaX Participants Directory
 * Institutional membership directory displaying participant legal entities,
 * roles, clearing capabilities, authorized currencies, and exposure ceilings.
 */

import { store } from '../state/store.js';
import { createElement, clearChildren } from '../utils/dom.js';
import { createSvgIcon } from '../utils/icons.js';
import { formatCurrency } from '../utils/formatters.js';

export function renderParticipants(container) {
  const state = store.getState();
  const currentParty = state.currentParticipant;
  const participants = state.participants || [];

  const wrapper = createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '20px' } });

  // 1. Directory Header Card
  const headerCard = createElement('div', { className: 'panel-card', style: { padding: '14px 18px' } },
    createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' } },
      createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
        createSvgIcon('participants', 20, 'text-primary'),
        createElement('div', null,
          createElement('div', { style: { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' } },
            'Registered Clearing Participants & Settlement Institutions'
          ),
          createElement('div', { style: { fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' } },
            `Authorized Ledger Participants: ${participants.length} · Network Ruleset: ObligaX v1.0`
          )
        )
      ),

      createElement('div', { style: { display: 'flex', gap: '8px' } },
        createElement('button', {
          className: 'btn btn-secondary',
          onClick: () => store.refreshAll()
        }, createSvgIcon('refresh', 13), 'Refresh Registry')
      )
    )
  );
  wrapper.appendChild(headerCard);

  // 2. High-Density Table
  const gridContainer = createElement('div', { className: 'grid-container' });
  const viewport = createElement('div', { className: 'table-viewport' });
  const table = createElement('table', { className: 'data-table' });

  const thead = createElement('thead', null,
    createElement('tr', null,
      createElement('th', null, 'Participant / Legal Entity'),
      createElement('th', null, 'Membership Role'),
      createElement('th', null, 'Status'),
      createElement('th', null, 'Hosted Node'),
      createElement('th', null, 'Authorized Currencies'),
      createElement('th', { style: { textAlign: 'right' } }, 'Daily Gross Limit'),
      createElement('th', { style: { textAlign: 'right' } }, 'Context Action')
    )
  );
  table.appendChild(thead);

  const tbody = createElement('tbody');

  for (const p of participants) {
    const isCurrent = p.partyId === currentParty;
    const currencies = p.currencies || ['USD', 'EUR'];
    const limit = p.dailyLimit || 50000000;

    const tr = createElement('tr', {
      className: isCurrent ? 'selected' : ''
    });

    // Party
    tr.appendChild(createElement('td', { className: 'col-id' },
      createElement('span', { style: { color: isCurrent ? 'var(--accent-primary)' : 'var(--text-primary)' } },
        p.name || p.partyId, isCurrent ? ' (Active)' : ''
      )
    ));

    // Role
    tr.appendChild(createElement('td', null,
      createElement('span', { className: 'badge badge-confirmed', style: { fontSize: '10px' } }, p.role || 'CLEARING_MEMBER')
    ));

    // Status
    tr.appendChild(createElement('td', null,
      createElement('span', { className: 'status-badge-inline' },
        createElement('span', { className: 'status-dot connected' }),
        createElement('span', null, p.status || 'ACTIVE')
      )
    ));

    // Node
    tr.appendChild(createElement('td', { className: 'mono', style: { fontSize: '11px', color: 'var(--text-secondary)' } },
      p.participantNode || 'participant-node'
    ));

    // Currencies
    const tdCcy = createElement('td', null);
    const ccyBox = createElement('div', { style: { display: 'flex', gap: '4px' } });
    for (const c of currencies) {
      ccyBox.appendChild(createElement('span', { className: 'hash-pill', style: { fontSize: '10px' } }, c));
    }
    tdCcy.appendChild(ccyBox);
    tr.appendChild(tdCcy);

    // Daily Limit
    tr.appendChild(createElement('td', { className: 'col-amount' },
      limit === 0 ? 'UNLIMITED (OPERATOR)' : formatCurrency(limit, 'USD')
    ));

    // Context Action
    const tdAction = createElement('td', { className: 'col-actions' });
    if (!isCurrent) {
      tdAction.appendChild(createElement('button', {
        className: 'btn btn-secondary',
        style: { padding: '2px 8px', fontSize: '11px' },
        onClick: () => {
          store.setParticipant(p.partyId);
          store.addNotification('info', `Switched active clearing context to ${p.partyId}`);
          renderParticipants(container);
        }
      }, `Switch to ${p.partyId}`));
    } else {
      tdAction.appendChild(createElement('span', {
        style: { fontSize: '11px', color: 'var(--accent-primary)', fontWeight: '600' }
      }, 'Active Session'));
    }
    tr.appendChild(tdAction);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  viewport.appendChild(table);
  gridContainer.appendChild(viewport);
  wrapper.appendChild(gridContainer);

  clearChildren(container);
  container.appendChild(wrapper);
}
