/**
 * ObligaX Sidebar Navigation Component
 * Organizes 11 operational sections with live badge indicators and telemetry.
 */

import { store } from '../state/store.js';
import { createElement } from '../utils/dom.js';
import { createSvgIcon } from '../utils/icons.js';

export function renderSidebar(container) {
  const state = store.getState();

  const navSections = [
    {
      group: 'OPERATIONS',
      items: [
        {
          id: 'overview',
          label: 'Overview',
          icon: 'overview'
        },
        {
          id: 'obligations',
          label: 'Obligations',
          icon: 'obligations',
          badge: state.obligations.length > 0 ? String(state.obligations.length) : null
        },
        {
          id: 'netting',
          label: 'Netting Workbench',
          icon: 'netting',
          badge: state.nettingProposals.length > 0 ? String(state.nettingProposals.length) : null
        },
        {
          id: 'settlement',
          label: 'Settlement Monitor',
          icon: 'settlement',
          badge: state.settlements.filter(s => s.status === 'SettlementProcessing' || s.status === 'SettlementCreated').length > 0
            ? String(state.settlements.filter(s => s.status === 'SettlementProcessing' || s.status === 'SettlementCreated').length)
            : null
        },
        {
          id: 'reconciliation',
          label: 'Reconciliation',
          icon: 'reconciliation',
          badge: state.reconciliationReport && !state.reconciliationReport.isBalanced
            ? String(state.reconciliationReport.discrepancies?.length || '!')
            : null,
          badgeAlert: state.reconciliationReport && !state.reconciliationReport.isBalanced
        },
        {
          id: 'activity',
          label: 'Activity Feed',
          icon: 'activity'
        }
      ]
    },
    {
      group: 'INFRASTRUCTURE & CONTROL',
      items: [
        {
          id: 'network',
          label: 'Network Topology',
          icon: 'network'
        },
        {
          id: 'participants',
          label: 'Participants',
          icon: 'participants'
        },
        {
          id: 'policies',
          label: 'Governance Policies',
          icon: 'policies'
        },
        {
          id: 'audit',
          label: 'Audit Explorer',
          icon: 'audit'
        },
        {
          id: 'health',
          label: 'System Health',
          icon: 'health',
          badge: state.health.status !== 'UP' ? 'ALERT' : null,
          badgeAlert: state.health.status !== 'UP'
        }
      ]
    }
  ];

  const sidebarElement = createElement('aside', { className: 'app-sidebar' },
    createElement('div', null,
      ...navSections.map(sec =>
        createElement('div', { className: 'sidebar-nav-group' },
          createElement('div', { className: 'sidebar-group-title' }, sec.group),
          ...sec.items.map(item => {
            const isActive = state.activeView === item.id;
            return createElement('button', {
              className: `sidebar-nav-item ${isActive ? 'active' : ''}`,
              role: 'tab',
              'aria-selected': isActive ? 'true' : 'false',
              onClick: () => store.setActiveView(item.id)
            },
              createElement('div', { className: 'nav-item-content' },
                createElement('span', { className: 'nav-item-icon' }, createSvgIcon(item.icon, 16)),
                createElement('span', null, item.label)
              ),
              item.badge
                ? createElement('span', {
                    className: `nav-item-badge ${item.badgeAlert ? 'alert' : ''}`
                  }, item.badge)
                : null
            );
          })
        )
      )
    ),

    // Sidebar Footer with live telemetry summary
    createElement('div', { className: 'sidebar-footer' },
      createElement('div', { className: 'telemetry-summary' },
        createElement('div', { className: 'telemetry-row' },
          createElement('span', null, 'Canton Ledger:'),
          createElement('span', { className: 'telemetry-val' }, state.health.connected ? 'Online' : 'Offline')
        ),
        createElement('div', { className: 'telemetry-row' },
          createElement('span', null, 'Read Projection:'),
          createElement('span', { className: 'telemetry-val' }, 'PostgreSQL')
        ),
        createElement('div', { className: 'telemetry-row' },
          createElement('span', null, 'Operator Mode:'),
          createElement('span', { className: 'telemetry-val mono' }, state.currentParticipant)
        )
      )
    )
  );

  container.innerHTML = '';
  container.appendChild(sidebarElement);
}
