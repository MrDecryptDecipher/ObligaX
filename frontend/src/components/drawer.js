/**
 * ObligaX Detail Inspector Drawer (Slide-Over)
 * Two-level information architecture: Level 1 Business + Level 2 Canton Ledger Provenance
 */

import { store } from '../state/store.js';
import { api } from '../services/api.js';
import { createElement, trapFocus } from '../utils/dom.js';
import { createSvgIcon } from '../utils/icons.js';
import { formatCurrency, formatTimestamp, getStatusMeta, truncateHash } from '../utils/formatters.js';

let cleanupFocusTrap = null;

export function renderDetailDrawer(container) {
  const state = store.getState();
  const drawerData = state.activeDrawer;

  if (!drawerData) {
    if (cleanupFocusTrap) {
      cleanupFocusTrap();
      cleanupFocusTrap = null;
    }
    container.innerHTML = '';
    return;
  }

  const backdrop = createElement('div', {
    className: 'drawer-backdrop open',
    onClick: (e) => {
      if (e.target === backdrop) store.closeDrawer();
    }
  });

  const drawerElement = createElement('aside', {
    className: 'detail-drawer open',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Record Detail Inspector'
  });

  if (drawerData.type === 'obligation') {
    renderObligationDrawerContent(drawerElement, drawerData.data, state);
  } else if (drawerData.type === 'settlement') {
    renderSettlementDrawerContent(drawerElement, drawerData.data, state);
  }

  backdrop.appendChild(drawerElement);
  container.innerHTML = '';
  container.appendChild(backdrop);

  cleanupFocusTrap = trapFocus(drawerElement);
}

function renderObligationDrawerContent(drawer, obl, state) {
  const statusMeta = getStatusMeta(obl.status);
  const isBusinessTab = state.activeDrawerTab === 'business';

  // Header
  const header = createElement('div', { className: 'drawer-header' },
    createElement('div', { className: 'drawer-title-group' },
      createElement('span', { className: 'drawer-eyebrow' }, 'Obligation Record'),
      createElement('h3', { className: 'drawer-id' }, obl.obligationId)
    ),
    createElement('button', {
      className: 'header-action-btn',
      title: 'Close inspector (Esc)',
      onClick: () => store.closeDrawer()
    }, createSvgIcon('x', 16))
  );

  // Level 1 / Level 2 Tab Switcher
  const tabs = createElement('div', { className: 'drawer-tabs' },
    createElement('button', {
      className: `drawer-tab ${isBusinessTab ? 'active' : ''}`,
      onClick: () => store.setDrawerTab('business')
    }, 'Level 1: Business Terms'),
    createElement('button', {
      className: `drawer-tab ${!isBusinessTab ? 'active' : ''}`,
      onClick: () => store.setDrawerTab('canton')
    }, 'Level 2: Canton Provenance')
  );

  // Body Content
  const body = createElement('div', { className: 'drawer-body' });

  if (isBusinessTab) {
    // Economics & Parties
    const economicsSection = createElement('div', { className: 'inspector-section' },
      createElement('div', { className: 'inspector-section-title' }, 'Commercial & Financial Terms'),
      createElement('div', { className: 'inspector-grid' },
        createElement('span', { className: 'inspector-label' }, 'Amount / Currency:'),
        createElement('span', { className: 'inspector-value mono' }, formatCurrency(obl.amount, obl.currency)),
        createElement('span', { className: 'inspector-label' }, 'Creditor (Payee):'),
        createElement('span', { className: 'inspector-value' }, obl.creditor),
        createElement('span', { className: 'inspector-label' }, 'Debtor (Payer):'),
        createElement('span', { className: 'inspector-value' }, obl.debtor),
        createElement('span', { className: 'inspector-label' }, 'Lifecycle Status:'),
        createElement('span', { className: 'inspector-value' },
          createElement('span', { className: `badge ${statusMeta.class}` }, statusMeta.label)
        ),
        createElement('span', { className: 'inspector-label' }, 'Due Date:'),
        createElement('span', { className: 'inspector-value mono' }, String(obl.dueDate).split('T')[0]),
        createElement('span', { className: 'inspector-label' }, 'Created Date:'),
        createElement('span', { className: 'inspector-value mono' }, String(obl.createdDate || '').split('T')[0] || '—'),
        createElement('span', { className: 'inspector-label' }, 'Description:'),
        createElement('span', { className: 'inspector-value' }, obl.description || '—'),
        createElement('span', { className: 'inspector-label' }, 'Version:'),
        createElement('span', { className: 'inspector-value mono' }, `v${obl.version || 1}`)
      )
    );

    // Lifecycle Visual Flow
    const lifecycleFlow = renderLifecycleFlow(obl.status);

    body.appendChild(economicsSection);
    body.appendChild(lifecycleFlow);
  } else {
    // Technical Canton Ledger Provenance
    const cantonSection = createElement('div', { className: 'inspector-section' },
      createElement('div', { className: 'inspector-section-title' }, 'Canton Ledger State & Cryptographic References'),
      createElement('div', { className: 'inspector-grid' },
        createElement('span', { className: 'inspector-label' }, 'Contract ID:'),
        createElement('span', { className: 'inspector-value mono' }, obl.contractId || 'Pending ledger commitment'),
        createElement('span', { className: 'inspector-label' }, 'Template ID:'),
        createElement('span', { className: 'inspector-value mono' }, 'Obligation.Contract:Obligation'),
        createElement('span', { className: 'inspector-label' }, 'Source System:'),
        createElement('span', { className: 'inspector-value' }, obl.metadata?.sourceSystem || 'ObligaX Console'),
        createElement('span', { className: 'inspector-label' }, 'Source Reference:'),
        createElement('span', { className: 'inspector-value mono' }, obl.metadata?.sourceReference || '—'),
        createElement('span', { className: 'inspector-label' }, 'Business Unit:'),
        createElement('span', { className: 'inspector-value' }, obl.metadata?.businessUnit || 'Treasury'),
        createElement('span', { className: 'inspector-label' }, 'Created By Principal:'),
        createElement('span', { className: 'inspector-value mono' }, obl.metadata?.createdBy || 'NetworkOperator')
      )
    );

    body.appendChild(cantonSection);
  }

  // Footer Actions based on actual Canton state and participant authorization
  const footer = createElement('div', { className: 'drawer-footer' });
  const isDebtor = obl.debtor === state.currentParticipant || state.currentParticipant === 'NetworkOperator';
  const isCreditor = obl.creditor === state.currentParticipant || state.currentParticipant === 'NetworkOperator';

  if (obl.status === 'Proposed' && isDebtor) {
    footer.appendChild(createElement('button', {
      className: 'btn btn-primary',
      onClick: async () => {
        try {
          await api.acceptObligation(obl.obligationId);
          store.addNotification({
            type: 'success',
            title: 'Obligation Accepted',
            message: `Obligation ${obl.obligationId} accepted on Canton ledger.`
          });
          store.closeDrawer();
          store.refreshAll();
        } catch (err) {
          store.addNotification({ type: 'error', title: 'Accept Failed', message: err.message });
        }
      }
    }, createSvgIcon('check', 14), 'Accept Obligation'));
  }

  if (obl.status === 'Accepted' && isCreditor) {
    footer.appendChild(createElement('button', {
      className: 'btn btn-primary',
      onClick: async () => {
        try {
          await api.confirmObligation(obl.obligationId);
          store.addNotification({
            type: 'success',
            title: 'Obligation Confirmed',
            message: `Obligation ${obl.obligationId} confirmed. Now eligible for netting or settlement.`
          });
          store.closeDrawer();
          store.refreshAll();
        } catch (err) {
          store.addNotification({ type: 'error', title: 'Confirm Failed', message: err.message });
        }
      }
    }, createSvgIcon('check', 14), 'Confirm Obligation'));
  }

  if (obl.status === 'Confirmed') {
    if (isCreditor) {
      footer.appendChild(createElement('button', {
        className: 'btn btn-primary',
        onClick: () => {
          store.openModal({
            name: 'confirm-direct-settlement',
            obligation: obl
          });
        }
      }, createSvgIcon('settlement', 14), 'Initiate Settlement'));
    }

    if (isDebtor) {
      footer.appendChild(createElement('button', {
        className: 'btn btn-secondary',
        onClick: () => {
          store.openModal({
            name: 'raise-dispute',
            obligation: obl
          });
        }
      }, createSvgIcon('alertTriangle', 14), 'Raise Dispute'));
    }
  }

  if (['Proposed', 'Accepted', 'Confirmed'].includes(obl.status) && isCreditor) {
    footer.appendChild(createElement('button', {
      className: 'btn btn-danger',
      onClick: () => {
        store.openModal({
          name: 'cancel-obligation',
          obligation: obl
        });
      }
    }, 'Cancel Obligation'));
  }

  footer.appendChild(createElement('button', {
    className: 'btn btn-secondary',
    onClick: () => store.closeDrawer()
  }, 'Close'));

  drawer.appendChild(header);
  drawer.appendChild(tabs);
  drawer.appendChild(body);
  drawer.appendChild(footer);
}

function renderLifecycleFlow(status) {
  const steps = [
    { id: 'Proposed', label: 'Proposed' },
    { id: 'Accepted', label: 'Accepted' },
    { id: 'Confirmed', label: 'Confirmed' },
    { id: 'SettlementPending', label: 'In Settlement / Netting' },
    { id: 'Settled', label: 'Settled / Netted' }
  ];

  const currentIdx = steps.findIndex(s => {
    if (status === 'NettingPending' || status === 'SettlementPending') return s.id === 'SettlementPending';
    if (status === 'Settled' || status === 'Netted') return s.id === 'Settled';
    return s.id === status;
  });

  const timelineContainer = createElement('div', { className: 'inspector-section' },
    createElement('div', { className: 'inspector-section-title' }, 'Ledger Lifecycle Status Flow'),
    createElement('div', { className: 'timeline-stages' },
      ...steps.map((st, idx) => {
        let cls = '';
        if (currentIdx !== -1 && idx < currentIdx) cls = 'completed';
        else if (idx === currentIdx) cls = 'active';

        return createElement('div', { className: `timeline-stage ${cls}` },
          createElement('span', { className: 'timeline-stage-marker' }),
          createElement('span', { className: 'timeline-stage-title' }, st.label),
          createElement('span', { className: 'timeline-stage-desc' },
            idx < currentIdx ? 'Verified & Completed' : (idx === currentIdx ? 'Current Authoritative State' : 'Pending Transition')
          )
        );
      })
    )
  );

  return timelineContainer;
}

function renderSettlementDrawerContent(drawer, st, state) {
  const statusMeta = getStatusMeta(st.status);

  const header = createElement('div', { className: 'drawer-header' },
    createElement('div', { className: 'drawer-title-group' },
      createElement('span', { className: 'drawer-eyebrow' }, 'Settlement Instruction'),
      createElement('h3', { className: 'drawer-id' }, st.settlementId)
    ),
    createElement('button', {
      className: 'header-action-btn',
      title: 'Close inspector (Esc)',
      onClick: () => store.closeDrawer()
    }, createSvgIcon('x', 16))
  );

  const body = createElement('div', { className: 'drawer-body' },
    createElement('div', { className: 'inspector-section' },
      createElement('div', { className: 'inspector-section-title' }, 'Settlement Execution Details'),
      createElement('div', { className: 'inspector-grid' },
        createElement('span', { className: 'inspector-label' }, 'Settlement ID:'),
        createElement('span', { className: 'inspector-value mono' }, st.settlementId),
        createElement('span', { className: 'inspector-label' }, 'Obligation ID:'),
        createElement('span', { className: 'inspector-value mono' }, st.obligationId),
        createElement('span', { className: 'inspector-label' }, 'Net Amount:'),
        createElement('span', { className: 'inspector-value mono' }, formatCurrency(st.amount, st.currency)),
        createElement('span', { className: 'inspector-label' }, 'Settlement Rail:'),
        createElement('span', { className: 'inspector-value' }, st.requestMetadata?.settlementRail || 'RTGS'),
        createElement('span', { className: 'inspector-label' }, 'Execution State:'),
        createElement('span', { className: 'inspector-value' },
          createElement('span', { className: `badge ${statusMeta.class}` }, statusMeta.label)
        ),
        createElement('span', { className: 'inspector-label' }, 'Contract ID:'),
        createElement('span', { className: 'inspector-value mono' }, st.contractId || '—'),
        createElement('span', { className: 'inspector-label' }, 'External Tx ID:'),
        createElement('span', { className: 'inspector-value mono' }, st.executionMetadata?.externalTransactionId || 'Awaiting Rail Ack')
      )
    )
  );

  const footer = createElement('div', { className: 'drawer-footer' });
  if (st.status === 'SettlementCreated') {
    footer.appendChild(createElement('button', {
      className: 'btn btn-primary',
      onClick: async () => {
        try {
          await api.processSettlement(st.settlementId);
          store.addNotification({
            type: 'info',
            title: 'Settlement Dispatched',
            message: `Instruction ${st.settlementId} submitted to banking rail.`
          });
          store.closeDrawer();
          store.refreshAll();
        } catch (err) {
          store.addNotification({ type: 'error', title: 'Dispatch Failed', message: err.message });
        }
      }
    }, 'Dispatch to Rail'));
  }

  footer.appendChild(createElement('button', {
    className: 'btn btn-secondary',
    onClick: () => store.closeDrawer()
  }, 'Close'));

  drawer.appendChild(header);
  drawer.appendChild(body);
  drawer.appendChild(footer);
}
