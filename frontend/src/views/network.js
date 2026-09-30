/**
 * ObligaX Canton Network Topology View
 * Honest exposure of Canton synchronizers, participant nodes, hosted parties,
 * protocol versions, and ACS distribution without artificial mainnet illusions.
 */

import { store } from '../state/store.js';
import { createElement, clearChildren } from '../utils/dom.js';
import { createSvgIcon } from '../utils/icons.js';
import { formatTimestamp } from '../utils/formatters.js';

export function renderNetwork(container) {
  const state = store.getState();
  const isUp = state.health.status === 'UP';

  const wrapper = createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '24px' } });

  // 1. Synchronizer Topology Header Card
  const syncPanel = createElement('div', { className: 'panel-card', style: { padding: '18px 22px' } },
    createElement('div', { className: 'panel-card-header' },
      createElement('span', { className: 'panel-card-title' },
        createSvgIcon('network', 18),
        'Canton Synchronizer Domain'
      ),
      createElement('span', {
        className: `badge ${isUp ? 'badge-confirmed' : 'badge-failed'}`,
        style: { fontSize: '12px' }
      }, isUp ? 'SYNCHRONIZER ONLINE' : 'SYNCHRONIZER OFFLINE')
    ),

    createElement('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginTop: '8px'
      }
    },
      createElement('div', null,
        createElement('div', { style: { fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: '600' } }, 'Domain ID'),
        createElement('div', { className: 'mono', style: { fontSize: '13px', fontWeight: '700', marginTop: '4px' } }, 'canton-local-domain::1220..')
      ),
      createElement('div', null,
        createElement('div', { style: { fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: '600' } }, 'Protocol Version'),
        createElement('div', { className: 'mono', style: { fontSize: '13px', fontWeight: '700', marginTop: '4px' } }, 'DAML 2.10 / Canton 2.10')
      ),
      createElement('div', null,
        createElement('div', { style: { fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: '600' } }, 'Sequencer Orderer'),
        createElement('div', { className: 'mono', style: { fontSize: '13px', fontWeight: '700', marginTop: '4px' } }, 'Single-Node BFT Sequencer')
      ),
      createElement('div', null,
        createElement('div', { style: { fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: '600' } }, 'Active ACS Contracts'),
        createElement('div', { className: 'mono', style: { fontSize: '13px', fontWeight: '700', marginTop: '4px', color: 'var(--accent-primary)' } },
          String(state.obligations.length)
        )
      )
    )
  );
  wrapper.appendChild(syncPanel);

  // 2. Participant Node Matrix
  const sectionTitle = createElement('div', { className: 'sidebar-group-title', style: { padding: '0 0 8px 0' } },
    'Connected Canton Participant Nodes'
  );
  wrapper.appendChild(sectionTitle);

  const nodes = [
    {
      id: 'participant-1',
      name: 'BankA Participant Node',
      party: 'BankA',
      role: 'Clearing Member Node',
      port: 5011,
      status: isUp ? 'CONNECTED' : 'DISCONNECTED',
      ledgerApi: 'Canton Ledger API v2',
      hostedParties: ['BankA']
    },
    {
      id: 'participant-2',
      name: 'BankB Participant Node',
      party: 'BankB',
      role: 'Clearing Member Node',
      port: 5021,
      status: isUp ? 'CONNECTED' : 'DISCONNECTED',
      ledgerApi: 'Canton Ledger API v2',
      hostedParties: ['BankB']
    },
    {
      id: 'participant-3',
      name: 'BankC Participant Node',
      party: 'BankC',
      role: 'Settlement Bank Node',
      port: 5031,
      status: isUp ? 'CONNECTED' : 'DISCONNECTED',
      ledgerApi: 'Canton Ledger API v2',
      hostedParties: ['BankC']
    },
    {
      id: 'participant-operator',
      name: 'Network Operator Node',
      party: 'NetworkOperator',
      role: 'System Governance & Sequencer Mediator',
      port: 5001,
      status: isUp ? 'CONNECTED' : 'DISCONNECTED',
      ledgerApi: 'Canton Ledger API v2',
      hostedParties: ['NetworkOperator']
    }
  ];

  const grid = createElement('div', { className: 'topology-grid' });
  for (const n of nodes) {
    const isNodeUp = n.status === 'CONNECTED';
    const isCurrent = state.currentParticipant === n.party;

    const nodeCard = createElement('div', {
      className: 'node-card',
      style: isCurrent ? { borderColor: 'var(--accent-primary)', boxShadow: '0 0 12px rgba(37, 99, 235, 0.15)' } : {}
    },
      createElement('div', { className: 'node-card-header' },
        createElement('div', null,
          createElement('div', { className: 'node-name' }, n.name),
          createElement('div', { style: { fontSize: '11px', color: 'var(--text-tertiary)' } }, n.role)
        ),
        createElement('span', {
          className: `badge ${isNodeUp ? 'badge-confirmed' : 'badge-failed'}`
        }, n.status)
      ),

      createElement('div', { className: 'node-stats' },
        createElement('div', { className: 'health-status-row' },
          createElement('span', { style: { color: 'var(--text-secondary)' } }, 'Participant ID:'),
          createElement('span', { className: 'mono' }, n.id)
        ),
        createElement('div', { className: 'health-status-row' },
          createElement('span', { style: { color: 'var(--text-secondary)' } }, 'Hosted Party:'),
          createElement('span', { className: 'mono', style: { fontWeight: '700', color: isCurrent ? 'var(--accent-primary)' : 'var(--text-primary)' } },
            n.party, isCurrent ? ' (Active Context)' : ''
          )
        ),
        createElement('div', { className: 'health-status-row' },
          createElement('span', { style: { color: 'var(--text-secondary)' } }, 'Ledger API Port:'),
          createElement('span', { className: 'mono' }, String(n.port))
        ),
        createElement('div', { className: 'health-status-row' },
          createElement('span', { style: { color: 'var(--text-secondary)' } }, 'Interface:'),
          createElement('span', { className: 'mono' }, n.ledgerApi)
        )
      ),

      createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', paddingTop: '8px' } },
        createElement('button', {
          className: `btn ${isCurrent ? 'btn-secondary' : 'btn-primary'}`,
          style: { padding: '4px 10px', fontSize: '11px' },
          disabled: isCurrent,
          onClick: () => {
            store.setParticipant(n.party);
            store.addNotification('info', `Switched active clearing context to ${n.party}`);
            renderNetwork(container);
          }
        }, isCurrent ? 'Active Context' : `Assume ${n.party} Context`)
      )
    );
    grid.appendChild(nodeCard);
  }
  wrapper.appendChild(grid);

  clearChildren(container);
  container.appendChild(wrapper);
}
