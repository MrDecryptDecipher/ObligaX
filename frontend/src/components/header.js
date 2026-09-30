/**
 * ObligaX Header Component
 * Contains environment context, network health chip, synchronizer freshness,
 * command palette trigger, participant switcher, and notifications.
 */

import { store } from '../state/store.js';
import { createElement } from '../utils/dom.js';
import { createSvgIcon } from '../utils/icons.js';
import { formatRelativeTime } from '../utils/formatters.js';

export function renderHeader(container) {
  const state = store.getState();

  const isConnected = state.health.status === 'UP' && state.health.connected;
  const statusClass = isConnected ? 'connected' : (state.health.status === 'DEGRADED' ? 'degraded' : 'offline');
  const statusText = isConnected ? 'Canton Synchronized' : (state.health.status === 'DEGRADED' ? 'Degraded Sync' : 'Ledger Offline');

  const relativeSync = state.lastSyncTime ? formatRelativeTime(state.lastSyncTime) : 'syncing...';

  // Participant Options
  const participantOptions = state.participants.map(p => {
    const id = p.partyId || p.participantId || p.id;
    const name = p.name || p.participantName || id;
    return createElement('option', { value: id, selected: id === state.currentParticipant }, name);
  });

  const headerElement = createElement('header', { className: 'app-header' },
    // Left
    createElement('div', { className: 'header-left' },
      createElement('div', {
        className: 'brand-badge',
        onClick: () => store.setActiveView('overview')
      },
        createElement('span', { className: 'brand-logo-text' },
          'OBLIGA',
          createElement('span', { className: 'brand-logo-x' }, 'X')
        ),
        createElement('span', { className: 'brand-subtext' }, 'Institutional Clearing')
      ),
      createElement('span', { className: 'env-tag' },
        createElement('span', { className: `status-dot ${statusClass}` }),
        'Canton v2.10'
      )
    ),

    // Middle (Command Palette Trigger)
    createElement('div', { className: 'header-middle' },
      createElement('button', {
        className: 'cmd-trigger-btn',
        title: 'Quick Actions & Search (Cmd+K or Ctrl+K)',
        onClick: () => store.toggleCommandPalette(true)
      },
        createSvgIcon('search', 14),
        createElement('span', null, 'Search or Jump To...'),
        createElement('kbd', { className: 'cmd-kbd' }, '⌘K')
      )
    ),

    // Right
    createElement('div', { className: 'header-right' },
      // Network Status Pill
      createElement('div', {
        className: 'network-status-chip',
        title: `Health: ${state.health.status} · Uptime: ${state.health.uptimeSeconds}s · Synced: ${relativeSync}`
      },
        createElement('span', { className: `status-dot ${statusClass}` }),
        createElement('span', null, statusText)
      ),

      // Acting Participant Context Selector
      createElement('div', { className: 'participant-context-box' },
        createElement('label', { htmlFor: 'headerParticipantSelect', className: 'participant-context-label' }, 'Party:'),
        createElement('select', {
          id: 'headerParticipantSelect',
          className: 'participant-select',
          onChange: (e) => store.setParticipant(e.target.value)
        }, ...participantOptions)
      ),

      // Refresh Button
      createElement('button', {
        className: 'header-action-btn',
        title: 'Refresh Ledger Projections',
        onClick: () => store.refreshAll()
      },
        createSvgIcon('refresh', 14, state.isRefreshing ? 'spin' : '')
      ),

      // Notifications Bell
      createElement('button', {
        className: 'header-action-btn',
        title: 'Notifications & Audit Alerts',
        onClick: () => store.setActiveView('activity')
      },
        createSvgIcon('bell', 14),
        state.notifications.length > 0
          ? createElement('span', { className: 'header-badge-count' }, String(state.notifications.length))
          : null
      )
    )
  );

  container.innerHTML = '';
  container.appendChild(headerElement);
}
