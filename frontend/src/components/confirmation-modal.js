/**
 * ObligaX Action Modals & Financial Confirmation Workflows
 * Enforces explicit confirmations for high-value operations without generic alert() or confirm()
 */

import { store } from '../state/store.js';
import { api } from '../services/api.js';
import { createElement, trapFocus } from '../utils/dom.js';
import { createSvgIcon } from '../utils/icons.js';
import { formatCurrency } from '../utils/formatters.js';

let cleanupFocusTrap = null;

export function renderModal(container) {
  const state = store.getState();
  const modalConfig = state.activeModal;

  if (!modalConfig) {
    if (cleanupFocusTrap) {
      cleanupFocusTrap();
      cleanupFocusTrap = null;
    }
    container.innerHTML = '';
    return;
  }

  const backdrop = createElement('div', {
    className: 'modal-backdrop open',
    onClick: (e) => {
      if (e.target === backdrop) store.closeModal();
    }
  });

  const dialog = createElement('div', {
    className: 'modal-dialog',
    role: 'dialog',
    'aria-modal': 'true'
  });

  const modalName = typeof modalConfig === 'string' ? modalConfig : modalConfig.name;

  if (modalName === 'create-obligation') {
    renderCreateObligationModal(dialog, state);
  } else if (modalName === 'confirm-direct-settlement') {
    renderDirectSettlementModal(dialog, modalConfig.obligation, state);
  } else if (modalName === 'raise-dispute') {
    renderDisputeModal(dialog, modalConfig.obligation, state);
  } else if (modalName === 'cancel-obligation') {
    renderCancelModal(dialog, modalConfig.obligation, state);
  } else if (modalName === 'netting-proposal-review') {
    renderNettingReviewModal(dialog, modalConfig.proposalData, state);
  }

  backdrop.appendChild(dialog);
  container.innerHTML = '';
  container.appendChild(backdrop);

  cleanupFocusTrap = trapFocus(dialog);
}

// 1. Propose New Obligation Modal
function renderCreateObligationModal(dialog, state) {
  const header = createElement('div', { className: 'modal-header' },
    createElement('h3', { className: 'modal-title' },
      createSvgIcon('plus', 16),
      'Propose Financial Obligation'
    ),
    createElement('button', {
      className: 'header-action-btn',
      title: 'Close modal',
      onClick: () => store.closeModal()
    }, createSvgIcon('x', 14))
  );

  const form = createElement('form', {
    onSubmit: async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting to Canton...';

      const obligationId = form.elements['obligationId'].value.trim();
      const creditor = form.elements['creditor'].value;
      const debtor = form.elements['debtor'].value;
      const amount = form.elements['amount'].value.trim();
      const currency = form.elements['currency'].value;
      const dueDate = form.elements['dueDate'].value;
      const description = form.elements['description'].value.trim();

      if (creditor === debtor) {
        store.addNotification({
          type: 'error',
          title: 'Validation Error',
          message: 'Creditor and Debtor must be different financial institutions.'
        });
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit to Ledger';
        return;
      }

      const today = new Date().toISOString().split('T')[0];

      try {
        await api.createObligation({
          obligationId,
          creditor,
          debtor,
          amount,
          currency,
          createdDate: today,
          dueDate,
          description,
          sourceSystem: 'ObligaX Console',
          sourceReference: `REF-${Date.now().toString(36).toUpperCase()}`,
          businessUnit: 'Institutional Clearing'
        });

        store.addNotification({
          type: 'success',
          title: 'Obligation Proposed',
          message: `Obligation ${obligationId} successfully submitted to Canton ledger in Proposed state.`
        });
        store.closeModal();
        store.refreshAll();
      } catch (err) {
        store.addNotification({
          type: 'error',
          title: 'Creation Failed',
          message: err.message
        });
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit to Ledger';
      }
    }
  });

  const body = createElement('div', { className: 'modal-body' },
    createElement('div', { className: 'form-group' },
      createElement('label', { className: 'form-label' }, 'Business Obligation Identifier'),
      createElement('input', {
        type: 'text',
        name: 'obligationId',
        className: 'form-control mono',
        placeholder: `OBL-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        required: true,
        defaultValue: `OBL-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
      }),
      createElement('span', { className: 'form-hint' }, 'Globally unique business reference for tracking')
    ),

    createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } },
      createElement('div', { className: 'form-group' },
        createElement('label', { className: 'form-label' }, 'Creditor (Payee)'),
        createElement('select', { name: 'creditor', className: 'form-control', required: true },
          createElement('option', { value: 'BankB' }, 'Bank B (Institutional Markets)'),
          createElement('option', { value: 'BankA' }, 'Bank A (Global Custody)'),
          createElement('option', { value: 'BankC' }, 'Bank C (Securities Clearing)')
        )
      ),
      createElement('div', { className: 'form-group' },
        createElement('label', { className: 'form-label' }, 'Debtor (Payer)'),
        createElement('select', { name: 'debtor', className: 'form-control', required: true },
          createElement('option', { value: 'BankA', selected: true }, 'Bank A (Global Custody)'),
          createElement('option', { value: 'BankB' }, 'Bank B (Institutional Markets)'),
          createElement('option', { value: 'BankC' }, 'Bank C (Securities Clearing)')
        )
      )
    ),

    createElement('div', { style: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' } },
      createElement('div', { className: 'form-group' },
        createElement('label', { className: 'form-label' }, 'Notional Amount (Decimal)'),
        createElement('input', {
          type: 'text',
          name: 'amount',
          className: 'form-control mono',
          placeholder: '1000000.00',
          required: true,
          pattern: '^\\d+(\\.\\d{1,4})?$'
        }),
        createElement('span', { className: 'form-hint' }, 'Lossless financial decimal notation')
      ),
      createElement('div', { className: 'form-group' },
        createElement('label', { className: 'form-label' }, 'Currency'),
        createElement('select', { name: 'currency', className: 'form-control' },
          createElement('option', { value: 'USD' }, 'USD'),
          createElement('option', { value: 'EUR' }, 'EUR'),
          createElement('option', { value: 'GBP' }, 'GBP'),
          createElement('option', { value: 'CHF' }, 'CHF')
        )
      )
    ),

    createElement('div', { className: 'form-group' },
      createElement('label', { className: 'form-label' }, 'Maturity / Due Date'),
      createElement('input', {
        type: 'date',
        name: 'dueDate',
        className: 'form-control',
        required: true,
        defaultValue: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0]
      })
    ),

    createElement('div', { className: 'form-group' },
      createElement('label', { className: 'form-label' }, 'Description & Economic Purpose'),
      createElement('input', {
        type: 'text',
        name: 'description',
        className: 'form-control',
        placeholder: 'FX Forward bilateral settlement tranche #42',
        required: true
      })
    )
  );

  const footer = createElement('div', { className: 'modal-footer' },
    createElement('button', {
      type: 'button',
      className: 'btn btn-secondary',
      onClick: () => store.closeModal()
    }, 'Cancel'),
    createElement('button', {
      type: 'submit',
      className: 'btn btn-primary'
    }, createSvgIcon('check', 14), 'Submit to Ledger')
  );

  form.appendChild(body);
  form.appendChild(footer);
  dialog.appendChild(header);
  dialog.appendChild(form);
}

// 2. Direct Settlement High-Stakes Confirmation Modal
function renderDirectSettlementModal(dialog, obl, state) {
  const settlementId = `SETTLE-${obl.obligationId}-${Date.now().toString(36).toUpperCase()}`;

  const header = createElement('div', { className: 'modal-header' },
    createElement('h3', { className: 'modal-title' },
      createSvgIcon('settlement', 16),
      'Initiate Direct Settlement'
    ),
    createElement('button', {
      className: 'header-action-btn',
      onClick: () => store.closeModal()
    }, createSvgIcon('x', 14))
  );

  const body = createElement('div', { className: 'modal-body' },
    createElement('p', { style: { marginBottom: '16px' } },
      'You are initiating a direct, binding settlement instruction for obligation ',
      createElement('strong', { className: 'mono' }, obl.obligationId),
      '. This moves the obligation to ',
      createElement('span', { className: 'badge badge-settlementpending' }, 'SettlementPending'),
      ' on Canton and dispatches an execution order to the external settlement rail.'
    ),

    createElement('div', {
      style: {
        backgroundColor: 'var(--surface-primary)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: '14px',
        display: 'grid',
        gridTemplateColumns: '130px 1fr',
        gap: '8px 12px',
        fontSize: '12px',
        marginBottom: '16px'
      }
    },
      createElement('span', { style: { color: 'var(--text-secondary)' } }, 'Settlement ID:'),
      createElement('span', { className: 'mono' }, settlementId),
      createElement('span', { style: { color: 'var(--text-secondary)' } }, 'Settlement Amount:'),
      createElement('span', { className: 'mono', style: { fontWeight: '700', color: '#fff' } }, formatCurrency(obl.amount, obl.currency)),
      createElement('span', { style: { color: 'var(--text-secondary)' } }, 'Payer (Debtor):'),
      createElement('span', null, obl.debtor),
      createElement('span', { style: { color: 'var(--text-secondary)' } }, 'Payee (Creditor):'),
      createElement('span', null, obl.creditor),
      createElement('span', { style: { color: 'var(--text-secondary)' } }, 'Settlement Rail:'),
      createElement('span', null, 'RTGS (Central Bank Real-Time Gross Settlement)')
    ),

    createElement('div', {
      style: {
        padding: '10px',
        borderRadius: 'var(--radius-sm)',
        backgroundColor: 'var(--state-warning-bg)',
        border: '1px solid var(--state-warning-border)',
        fontSize: '11px',
        color: 'var(--state-warning)'
      }
    }, '⚠️ IRREVERSIBLE DISPATCH: Once submitted, the ledger contract will be locked for independent modification until acknowledged or retried.')
  );

  const footer = createElement('div', { className: 'modal-footer' },
    createElement('button', {
      className: 'btn btn-secondary',
      onClick: () => store.closeModal()
    }, 'Cancel'),
    createElement('button', {
      className: 'btn btn-primary',
      onClick: async () => {
        try {
          await api.initiateSettlement({
            settlementId,
            obligationId: obl.obligationId,
            settlementRail: 'RTGS',
            sourceSystem: 'ObligaX Console',
            sourceReference: `DISPATCH-${settlementId}`
          });
          store.addNotification({
            type: 'success',
            title: 'Settlement Initiated',
            message: `Instruction ${settlementId} successfully locked and submitted to settlement queue.`
          });
          store.closeModal();
          store.closeDrawer();
          store.setActiveView('settlement');
          store.refreshAll();
        } catch (err) {
          store.addNotification({
            type: 'error',
            title: 'Settlement Initiation Failed',
            message: err.message
          });
        }
      }
    }, createSvgIcon('settlement', 14), 'Confirm & Dispatch Settlement')
  );

  dialog.appendChild(header);
  dialog.appendChild(body);
  dialog.appendChild(footer);
}

// 3. Raise Dispute Modal
function renderDisputeModal(dialog, obl, state) {
  const header = createElement('div', { className: 'modal-header' },
    createElement('h3', { className: 'modal-title' },
      createSvgIcon('alertTriangle', 16),
      'Raise Commercial Dispute'
    ),
    createElement('button', {
      className: 'header-action-btn',
      onClick: () => store.closeModal()
    }, createSvgIcon('x', 14))
  );

  const form = createElement('form', {
    onSubmit: async (e) => {
      e.preventDefault();
      const reason = form.elements['reason'].value;
      const details = form.elements['details'].value.trim();

      try {
        await api.raiseDispute(obl.obligationId, { reason, details });
        store.addNotification({
          type: 'warning',
          title: 'Dispute Raised',
          message: `Obligation ${obl.obligationId} has transitioned to Disputed status on Canton.`
        });
        store.closeModal();
        store.closeDrawer();
        store.refreshAll();
      } catch (err) {
        store.addNotification({ type: 'error', title: 'Dispute Failed', message: err.message });
      }
    }
  });

  const body = createElement('div', { className: 'modal-body' },
    createElement('div', { className: 'form-group' },
      createElement('label', { className: 'form-label' }, 'Dispute Reason Code'),
      createElement('select', { name: 'reason', className: 'form-control', required: true },
        createElement('option', { value: 'IncorrectAmount' }, 'Incorrect Amount'),
        createElement('option', { value: 'IncorrectCurrency' }, 'Incorrect Currency'),
        createElement('option', { value: 'IncorrectDueDate' }, 'Incorrect Due Date'),
        createElement('option', { value: 'DuplicateObligation' }, 'Duplicate Obligation Recorded'),
        createElement('option', { value: 'SettlementFailure' }, 'Settlement Rail Failure / Rejection'),
        createElement('option', { value: 'ContractualDisagreement' }, 'Contractual Terms Disagreement'),
        createElement('option', { value: 'OtherReason' }, 'Other Commercial Exception')
      )
    ),
    createElement('div', { className: 'form-group' },
      createElement('label', { className: 'form-label' }, 'Dispute Particulars & Evidence Details'),
      createElement('textarea', {
        name: 'details',
        className: 'form-control input-textarea',
        rows: 4,
        placeholder: 'Specify the contractual discrepancies, conflicting references, or trade confirmation notes...',
        required: true
      })
    )
  );

  const footer = createElement('div', { className: 'modal-footer' },
    createElement('button', {
      type: 'button',
      className: 'btn btn-secondary',
      onClick: () => store.closeModal()
    }, 'Cancel'),
    createElement('button', {
      type: 'submit',
      className: 'btn btn-danger'
    }, 'Submit Dispute to Ledger')
  );

  form.appendChild(body);
  form.appendChild(footer);
  dialog.appendChild(header);
  dialog.appendChild(form);
}

// 4. Cancel Obligation Modal
function renderCancelModal(dialog, obl, state) {
  const header = createElement('div', { className: 'modal-header' },
    createElement('h3', { className: 'modal-title' }, 'Cancel Obligation'),
    createElement('button', {
      className: 'header-action-btn',
      onClick: () => store.closeModal()
    }, createSvgIcon('x', 14))
  );

  const form = createElement('form', {
    onSubmit: async (e) => {
      e.preventDefault();
      const reason = form.elements['reason'].value.trim();

      try {
        await api.cancelObligation(obl.obligationId, reason);
        store.addNotification({
          type: 'info',
          title: 'Obligation Cancelled',
          message: `Obligation ${obl.obligationId} marked as Cancelled (terminal state).`
        });
        store.closeModal();
        store.closeDrawer();
        store.refreshAll();
      } catch (err) {
        store.addNotification({ type: 'error', title: 'Cancellation Failed', message: err.message });
      }
    }
  });

  const body = createElement('div', { className: 'modal-body' },
    createElement('p', { style: { marginBottom: '12px' } },
      'Are you sure you want to cancel obligation ',
      createElement('strong', null, obl.obligationId),
      '? Cancelled is a terminal state on the Canton ledger.'
    ),
    createElement('div', { className: 'form-group' },
      createElement('label', { className: 'form-label' }, 'Cancellation Justification'),
      createElement('input', {
        type: 'text',
        name: 'reason',
        className: 'form-control',
        placeholder: 'Trade cancelled by bilateral mutual agreement / superseded by ref #882',
        required: true
      })
    )
  );

  const footer = createElement('div', { className: 'modal-footer' },
    createElement('button', {
      type: 'button',
      className: 'btn btn-secondary',
      onClick: () => store.closeModal()
    }, 'Keep Active'),
    createElement('button', {
      type: 'submit',
      className: 'btn btn-danger'
    }, 'Confirm Cancellation')
  );

  form.appendChild(body);
  form.appendChild(footer);
  dialog.appendChild(header);
  dialog.appendChild(form);
}

// 5. Dedicated Atomic Netting Proposal Review Modal (Mandate Section 12)
function renderNettingReviewModal(dialog, pData, state) {
  const header = createElement('div', { className: 'modal-header' },
    createElement('h3', { className: 'modal-title' },
      createSvgIcon('netting', 16),
      'Review & Submit Bilateral Netting Proposal'
    ),
    createElement('button', {
      className: 'header-action-btn',
      onClick: () => store.closeModal()
    }, createSvgIcon('x', 14))
  );

  const body = createElement('div', { className: 'modal-body' },
    createElement('div', {
      style: {
        backgroundColor: 'var(--surface-primary)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        marginBottom: '16px'
      }
    },
      createElement('div', { className: 'calc-row' },
        createElement('span', { className: 'calc-label' }, 'Netting Run ID:'),
        createElement('span', { className: 'calc-val mono' }, pData.nettingId)
      ),
      createElement('div', { className: 'calc-row' },
        createElement('span', { className: 'calc-label' }, 'Counterparty Institution:'),
        createElement('span', { className: 'calc-val' }, pData.counterparty)
      ),
      createElement('div', { className: 'calc-row' },
        createElement('span', { className: 'calc-label' }, 'Participating Obligation Legs:'),
        createElement('span', { className: 'calc-val mono' }, `${pData.obligationIds.length} obligations`)
      ),
      createElement('div', { className: 'calc-row' },
        createElement('span', { className: 'calc-label' }, 'Gross Receivable:'),
        createElement('span', { className: 'calc-val positive mono' }, formatCurrency(pData.grossReceivable, pData.currency))
      ),
      createElement('div', { className: 'calc-row' },
        createElement('span', { className: 'calc-label' }, 'Gross Payable:'),
        createElement('span', { className: 'calc-val negative mono' }, formatCurrency(pData.grossPayable, pData.currency))
      ),
      createElement('div', { className: 'calc-separator' }),
      createElement('div', { className: 'calc-row net-total' },
        createElement('span', { className: 'calc-label' }, 'Resulting Net Exposure:'),
        createElement('span', { className: 'calc-val mono' }, formatCurrency(pData.netAmount, pData.currency))
      ),
      createElement('div', { className: 'calc-row' },
        createElement('span', { className: 'calc-label' }, 'Economic Direction:'),
        createElement('span', { className: 'badge badge-confirmed' }, pData.directionText)
      )
    ),

    // Authoritative Eligibility Checklist
    createElement('div', {
      style: {
        backgroundColor: 'var(--surface-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '12px',
        fontSize: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }
    },
      createElement('span', { style: { fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' } }, 'Bilateral Eligibility Pre-Flight:'),
      createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--state-success)' } },
        createSvgIcon('check', 14), 'All selected obligations are Confirmed on ledger'
      ),
      createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--state-success)' } },
        createSvgIcon('check', 14), `Single matching bilateral counterparty pair (${state.currentParticipant} ↔ ${pData.counterparty})`
      ),
      createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--state-success)' } },
        createSvgIcon('check', 14), `Uniform currency corridor (${pData.currency})`
      ),
      createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--state-success)' } },
        createSvgIcon('check', 14), 'Zero active commercial disputes or amendments on selected set'
      )
    )
  );

  const footer = createElement('div', { className: 'modal-footer' },
    createElement('button', {
      className: 'btn btn-secondary',
      onClick: () => store.closeModal()
    }, 'Cancel'),
    createElement('button', {
      className: 'btn btn-primary',
      onClick: async () => {
        try {
          await api.proposeNetting({
            nettingId: pData.nettingId,
            counterparty: pData.counterparty,
            obligationIds: pData.obligationIds,
            currency: pData.currency,
            sourceSystem: 'ObligaX Console',
            sourceReference: `RUN-${pData.nettingId}`,
            businessUnit: 'ClearingOps'
          });

          store.addNotification({
            type: 'success',
            title: 'Netting Proposal Created',
            message: `Bilateral netting proposal ${pData.nettingId} submitted to counterparty on Canton.`
          });
          store.closeModal();
          store.clearObligationSelection();
          store.refreshAll();
        } catch (err) {
          store.addNotification({
            type: 'error',
            title: 'Netting Proposal Failed',
            message: err.message
          });
        }
      }
    }, createSvgIcon('netting', 14), 'Submit Proposal to Canton')
  );

  dialog.appendChild(header);
  dialog.appendChild(body);
  dialog.appendChild(footer);
}
