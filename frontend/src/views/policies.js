/**
 * ObligaX Governance Policies
 * Active network clearing rules, exposure limits, netting cutoffs,
 * dispute response SLA windows, and settlement retry policies.
 */

import { store } from '../state/store.js';
import { createElement, clearChildren } from '../utils/dom.js';
import { createSvgIcon } from '../utils/icons.js';
import { formatCurrency } from '../utils/formatters.js';

export function renderPolicies(container) {
  const state = store.getState();

  const wrapper = createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '20px' } });

  // 1. Header
  const headerCard = createElement('div', { className: 'panel-card', style: { padding: '14px 18px' } },
    createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
        createSvgIcon('policies', 20, 'text-primary'),
        createElement('div', null,
          createElement('div', { style: { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' } },
            'ObligaX Governance & Network Clearing Ruleset'
          ),
          createElement('div', { style: { fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' } },
            'Policy Version: 2026.1 · Governing Entity: NetworkOperator · Enforced by DAML Contracts'
          )
        )
      ),
      createElement('span', { className: 'badge badge-confirmed' }, 'ACTIVE & ENFORCED')
    )
  );
  wrapper.appendChild(headerCard);

  // 2. Policies Grid
  const grid = createElement('div', { className: 'topology-grid' });

  const policies = [
    {
      title: 'Exposure & Limits Policy',
      category: 'Risk Management',
      items: [
        { label: 'Single Obligation Cap', val: formatCurrency(100000000, 'USD') },
        { label: 'Default Daily Gross Ceiling', val: formatCurrency(50000000, 'USD') },
        { label: 'Settlement Bank Daily Limit', val: formatCurrency(100000000, 'USD') },
        { label: 'Operator Override Threshold', val: 'Above $100,000,000' }
      ]
    },
    {
      title: 'Netting & Compression Rules',
      category: 'Clearing Engine',
      items: [
        { label: 'Minimum Compression Lines', val: '2 Obligations' },
        { label: 'Bilateral Matching Rule', val: 'Counterparty + Currency Exact Match' },
        { label: 'Cutoff Window (UTC)', val: '16:00 UTC Daily' },
        { label: 'Proposal Expiry SLA', val: '24 Hours' }
      ]
    },
    {
      title: 'Dispute & Amendment Controls',
      category: 'Exception Operations',
      items: [
        { label: 'Dispute Window', val: 'Prior to Settlement Execution' },
        { label: 'Response SLA Time', val: '4 Business Hours' },
        { label: 'Resolution Mechanism', val: 'Bilateral Cancellation or Re-Acceptance' },
        { label: 'Audit Log Retention', val: 'Cryptographic Perpetual Chain' }
      ]
    },
    {
      title: 'Settlement Rails & Retries',
      category: 'Settlement Infrastructure',
      items: [
        { label: 'Supported Settlement Currencies', val: 'USD, EUR, GBP, SGD' },
        { label: 'Max Automatic Retries', val: '3 Attempts' },
        { label: 'Adapter Timeout Threshold', val: '30,000 ms' },
        { label: 'Settlement Delivery Mode', val: 'dvP (Delivery vs Payment) Finality' }
      ]
    }
  ];

  for (const pol of policies) {
    const card = createElement('div', { className: 'panel-card' },
      createElement('div', { className: 'panel-card-header' },
        createElement('span', { className: 'panel-card-title' }, pol.title),
        createElement('span', { className: 'hash-pill', style: { fontSize: '10px' } }, pol.category)
      ),

      createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        ...pol.items.map(it =>
          createElement('div', { className: 'health-status-row' },
            createElement('span', { style: { color: 'var(--text-secondary)', fontSize: '12px' } }, `${it.label}:`),
            createElement('span', { className: 'mono', style: { fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' } }, it.val)
          )
        )
      )
    );
    grid.appendChild(card);
  }
  wrapper.appendChild(grid);

  clearChildren(container);
  container.appendChild(wrapper);
}
