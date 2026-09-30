/**
 * ObligaX Bilateral Netting Workbench
 * Flagship clearing operations screen: counterparty filtering, currency grouping,
 * eligible line selection, atomic compression preview, and proposal lifecycle execution.
 */

import { store } from '../state/store.js';
import { api } from '../services/api.js';
import { createElement, clearChildren } from '../utils/dom.js';
import { createSvgIcon } from '../utils/icons.js';
import { formatCurrency, formatTimestamp, getStatusMeta } from '../utils/formatters.js';

let selectedCounterparty = '';
let selectedCurrency = 'USD';
let selectedLineIds = new Set();

export function renderNetting(container) {
  const state = store.getState();
  const currentParty = state.currentParticipant;

  // Available counterparties from known participants excluding self
  const counterparties = state.participants
    .map(p => p.partyId || p.id || p.name)
    .filter(p => p && p !== currentParty);

  if (!selectedCounterparty && counterparties.length > 0) {
    selectedCounterparty = counterparties[0];
  }

  // Filter confirmed obligations between currentParticipant and selectedCounterparty in selectedCurrency
  const eligibleObligations = state.obligations.filter(o => {
    if (o.status !== 'Confirmed') return false;
    if (o.currency !== selectedCurrency) return false;
    const isBilateral =
      (o.creditor === currentParty && o.debtor === selectedCounterparty) ||
      (o.creditor === selectedCounterparty && o.debtor === currentParty);
    return isBilateral;
  });

  // Calculate live preview
  let grossReceivable = 0;
  let grossPayable = 0;
  let selectedCount = 0;

  for (const o of eligibleObligations) {
    if (selectedLineIds.has(o.obligationId)) {
      selectedCount++;
      const amt = Number(o.amount) || 0;
      if (o.creditor === currentParty) grossReceivable += amt;
      if (o.debtor === currentParty) grossPayable += amt;
    }
  }

  const grossVolume = grossReceivable + grossPayable;
  const netAmount = Math.abs(grossReceivable - grossPayable);
  const netPayor = grossPayable > grossReceivable ? currentParty : selectedCounterparty;
  const netPayee = grossPayable > grossReceivable ? selectedCounterparty : currentParty;
  const compressionSavings = grossVolume > 0 ? grossVolume - netAmount : 0;
  const compressionRatio = grossVolume > 0 ? ((compressionSavings / grossVolume) * 100).toFixed(1) : '0.0';

  // MAIN WRAPPER
  const wrapper = createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '24px' } });

  // 1. Controls Header
  const controlsHeader = createElement('div', { className: 'netting-controls-header' },
    createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flex: 1, flexWrap: 'wrap' } },
      createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
        createElement('label', { style: { fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: '600' } },
          'Bilateral Counterparty'
        ),
        createElement('select', {
          className: 'form-control',
          style: { minWidth: '220px' },
          value: selectedCounterparty,
          onChange: (e) => {
            selectedCounterparty = e.target.value;
            selectedLineIds.clear();
            renderNetting(container);
          }
        },
          ...counterparties.map(cp => createElement('option', { value: cp, selected: cp === selectedCounterparty }, cp))
        )
      ),

      createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
        createElement('label', { style: { fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: '600' } },
          'Clearing Currency'
        ),
        createElement('select', {
          className: 'form-control',
          style: { minWidth: '100px' },
          value: selectedCurrency,
          onChange: (e) => {
            selectedCurrency = e.target.value;
            selectedLineIds.clear();
            renderNetting(container);
          }
        },
          createElement('option', { value: 'USD', selected: selectedCurrency === 'USD' }, 'USD'),
          createElement('option', { value: 'EUR', selected: selectedCurrency === 'EUR' }, 'EUR'),
          createElement('option', { value: 'GBP', selected: selectedCurrency === 'GBP' }, 'GBP'),
          createElement('option', { value: 'SGD', selected: selectedCurrency === 'SGD' }, 'SGD')
        )
      )
    ),

    createElement('div', { style: { display: 'flex', gap: '8px' } },
      createElement('button', {
        className: 'btn btn-secondary',
        onClick: () => {
          if (selectedLineIds.size === eligibleObligations.length) {
            selectedLineIds.clear();
          } else {
            eligibleObligations.forEach(o => selectedLineIds.add(o.obligationId));
          }
          renderNetting(container);
        }
      }, selectedLineIds.size === eligibleObligations.length && eligibleObligations.length > 0 ? 'Deselect All' : 'Select All Eligible')
    )
  );
  wrapper.appendChild(controlsHeader);

  // 2. Workbench Split Grid: Candidates Matrix & Calculation Preview
  const workbenchLayout = createElement('div', { className: 'netting-workbench-layout' });

  // Left: Eligible Obligation Matrix
  const matrixPanel = createElement('div', { className: 'netting-candidates-box' },
    createElement('div', {
      style: {
        padding: '12px 16px',
        backgroundColor: 'var(--surface-secondary)',
        borderBottom: '1px solid var(--border-default)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }
    },
      createElement('div', { style: { fontWeight: '600', fontSize: '13px' } },
        `Eligible Confirmed Obligations (${eligibleObligations.length})`
      ),
      createElement('span', { className: 'mono', style: { fontSize: '11px', color: 'var(--text-tertiary)' } },
        `${selectedCount} lines selected for netting`
      )
    )
  );

  if (eligibleObligations.length === 0) {
    matrixPanel.appendChild(
      createElement('div', { style: { padding: '40px 20px', textAlign: 'center', color: 'var(--text-tertiary)' } },
        createSvgIcon('netting', 32, 'text-tertiary'),
        createElement('div', { style: { marginTop: '8px', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' } },
          'No Eligible Confirmed Obligations Found'
        ),
        createElement('div', { style: { fontSize: '11px', marginTop: '4px' } },
          `There are currently no Confirmed status bilateral obligations between ${currentParty} and ${selectedCounterparty} in ${selectedCurrency}.`
        )
      )
    );
  } else {
    const list = createElement('div', { style: { maxHeight: '420px', overflowY: 'auto' } });
    for (const o of eligibleObligations) {
      const isSelected = selectedLineIds.has(o.obligationId);
      const isReceivable = o.creditor === currentParty;

      const item = createElement('div', {
        className: `candidate-item ${isSelected ? 'selected' : ''}`,
        onClick: () => {
          if (isSelected) selectedLineIds.delete(o.obligationId);
          else selectedLineIds.add(o.obligationId);
          renderNetting(container);
        }
      },
        createElement('input', {
          type: 'checkbox',
          checked: isSelected,
          style: { cursor: 'pointer' },
          onChange: (e) => {
            e.stopPropagation();
            if (e.target.checked) selectedLineIds.add(o.obligationId);
            else selectedLineIds.delete(o.obligationId);
            renderNetting(container);
          }
        }),
        createElement('div', { className: 'candidate-info' },
          createElement('div', { className: 'candidate-parties' },
            createElement('span', { className: 'candidate-id' }, o.obligationId),
            createElement('span', { className: 'candidate-direction' },
              isReceivable ? `Receivable from ${selectedCounterparty}` : `Payable to ${selectedCounterparty}`,
              ` · Due: ${formatTimestamp(o.dueDate).split(' ')[0]}`
            )
          ),
          createElement('div', {
            className: 'candidate-amount',
            style: isReceivable ? { color: 'var(--state-success)' } : { color: 'var(--text-primary)' }
          }, isReceivable ? `+${formatCurrency(o.amount, o.currency)}` : `-${formatCurrency(o.amount, o.currency)}`)
        )
      );
      list.appendChild(item);
    }
    matrixPanel.appendChild(list);
  }
  workbenchLayout.appendChild(matrixPanel);

  // Right: Netting Calculation & Proposal Preview Panel
  const previewPanel = createElement('div', { className: 'netting-preview-panel' },
    createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      createElement('span', { style: { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' } },
        'Bilateral Netting Ledger'
      ),
      createElement('span', { className: 'badge badge-confirmed' }, 'DAML 2.10 PROVABLE')
    ),

    createElement('div', { className: 'calculation-ledger-box' },
      createElement('div', { className: 'calc-row' },
        createElement('span', { className: 'calc-label' }, 'Gross Receivables:'),
        createElement('span', { className: 'calc-val positive' }, `+${formatCurrency(grossReceivable, selectedCurrency)}`)
      ),
      createElement('div', { className: 'calc-row' },
        createElement('span', { className: 'calc-label' }, 'Gross Payables:'),
        createElement('span', { className: 'calc-val negative' }, `-${formatCurrency(grossPayable, selectedCurrency)}`)
      ),
      createElement('div', { className: 'calc-separator' }),
      createElement('div', { className: 'calc-row' },
        createElement('span', { className: 'calc-label' }, 'Gross Bilateral Volume:'),
        createElement('span', { className: 'calc-val' }, formatCurrency(grossVolume, selectedCurrency))
      ),
      createElement('div', { className: 'calc-row' },
        createElement('span', { className: 'calc-label' }, 'Liquidity Reduction:'),
        createElement('span', { className: 'calc-val positive' }, `-${formatCurrency(compressionSavings, selectedCurrency)} (${compressionRatio}%)`)
      ),
      createElement('div', { className: 'calc-separator' }),
      createElement('div', { className: 'calc-row net-total' },
        createElement('span', { className: 'calc-label', style: { color: 'var(--text-primary)' } }, 'Net Settlement Amount:'),
        createElement('span', { className: 'calc-val' }, formatCurrency(netAmount, selectedCurrency))
      )
    ),

    createElement('div', {
      style: {
        padding: '10px 12px',
        backgroundColor: 'var(--surface-secondary)',
        borderRadius: 'var(--radius-md)',
        fontSize: '12px',
        border: '1px solid var(--border-subtle)'
      }
    },
      createElement('div', { style: { color: 'var(--text-tertiary)', fontSize: '10px', textTransform: 'uppercase', fontWeight: '600' } },
        'Settlement Obligation Direction'
      ),
      createElement('div', { style: { marginTop: '4px', fontWeight: '600', color: 'var(--text-primary)' } },
        grossVolume === 0 ? 'No lines selected' : `${netPayor} pays ${formatCurrency(netAmount, selectedCurrency)} to ${netPayee}`
      )
    ),

    createElement('button', {
      className: 'btn btn-primary',
      disabled: selectedCount < 2,
      style: { width: '100%', padding: '10px', justifyContent: 'center' },
      onClick: () => {
        store.openModal('netting-proposal-review', {
          lineIds: Array.from(selectedLineIds),
          counterparty: selectedCounterparty,
          currency: selectedCurrency,
          grossReceivable,
          grossPayable,
          grossVolume,
          netAmount,
          netPayor,
          netPayee,
          compressionRatio
        });
      }
    }, createSvgIcon('netting', 16), `Generate Netting Proposal (${selectedCount} lines)`)
  );
  workbenchLayout.appendChild(previewPanel);
  wrapper.appendChild(workbenchLayout);

  // 3. Active Netting Proposals Table
  const proposalsSection = createElement('div', { className: 'panel-card', style: { padding: '16px 20px' } });
  const proposalsHeader = createElement('div', { className: 'panel-card-header' },
    createElement('span', { className: 'panel-card-title' },
      createSvgIcon('netting', 16),
      `Active Netting Proposals (${state.nettingProposals.length})`
    ),
    createElement('button', {
      className: 'btn btn-secondary',
      style: { padding: '4px 8px', fontSize: '11px' },
      onClick: () => store.refreshAll()
    }, createSvgIcon('refresh', 12), 'Refresh')
  );
  proposalsSection.appendChild(proposalsHeader);

  if (state.nettingProposals.length === 0) {
    proposalsSection.appendChild(
      createElement('div', { style: { padding: '24px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px' } },
        'No active or historical netting proposals found on the ledger.'
      )
    );
  } else {
    const pTable = createElement('table', { className: 'data-table', style: { marginTop: '8px' } });
    const pThead = createElement('thead', null,
      createElement('tr', null,
        createElement('th', null, 'Proposal ID'),
        createElement('th', null, 'Status'),
        createElement('th', null, 'Proposer'),
        createElement('th', null, 'Counterparty'),
        createElement('th', { style: { textAlign: 'right' } }, 'Net Amount'),
        createElement('th', null, 'CCY'),
        createElement('th', null, 'Lines'),
        createElement('th', { style: { textAlign: 'right' } }, 'Actions')
      )
    );
    pTable.appendChild(pThead);

    const pTbody = createElement('tbody');
    for (const p of state.nettingProposals) {
      const pStatus = getStatusMeta(p.status);
      const isMyActionNeeded = p.status === 'Proposed' && p.counterparty === currentParty;
      const isReadyToExecute = p.status === 'Accepted' && (p.proposer === currentParty || p.counterparty === currentParty);

      const tr = createElement('tr', null,
        createElement('td', { className: 'col-id' }, p.proposalId || p.id),
        createElement('td', null,
          createElement('span', { className: `badge ${pStatus.badgeClass}` }, pStatus.label)
        ),
        createElement('td', null, p.proposer),
        createElement('td', null, p.counterparty),
        createElement('td', { className: 'col-amount' }, formatCurrency(p.netAmount, p.currency)),
        createElement('td', { className: 'mono' }, p.currency || 'USD'),
        createElement('td', { className: 'mono' }, String((p.lines || p.obligationIds || []).length)),
        createElement('td', { className: 'col-actions' },
          createElement('div', { style: { display: 'flex', gap: '6px', justifyContent: 'flex-end' } },
            isMyActionNeeded ? createElement('button', {
              className: 'btn btn-primary',
              style: { padding: '2px 8px', fontSize: '11px' },
              onClick: async () => {
                try {
                  await api.acceptProposal(p.proposalId || p.id);
                  store.addNotification('info', `Netting proposal ${p.proposalId} accepted.`);
                  await store.refreshAll();
                } catch (err) {
                  store.addNotification('error', `Failed to accept proposal: ${err.message}`);
                }
              }
            }, 'Accept') : null,

            isMyActionNeeded ? createElement('button', {
              className: 'btn btn-secondary',
              style: { padding: '2px 8px', fontSize: '11px', color: 'var(--state-danger)' },
              onClick: async () => {
                try {
                  await api.rejectProposal(p.proposalId || p.id, 'Counterparty rejected');
                  store.addNotification('warning', `Netting proposal ${p.proposalId} rejected.`);
                  await store.refreshAll();
                } catch (err) {
                  store.addNotification('error', `Failed to reject proposal: ${err.message}`);
                }
              }
            }, 'Reject') : null,

            isReadyToExecute ? createElement('button', {
              className: 'btn btn-primary',
              style: { padding: '2px 8px', fontSize: '11px' },
              onClick: async () => {
                try {
                  await api.executeProposal(p.proposalId || p.id);
                  store.addNotification('success', `Netting proposal ${p.proposalId} successfully executed on ledger!`);
                  await store.refreshAll();
                } catch (err) {
                  store.addNotification('error', `Execution failed: ${err.message}`);
                }
              }
            }, 'Execute Netting') : null,

            !isMyActionNeeded && !isReadyToExecute ? createElement('span', {
              style: { fontSize: '11px', color: 'var(--text-tertiary)' }
            }, p.status === 'Executed' ? 'Ledger Finalized' : 'Pending') : null
          )
        )
      );
      pTbody.appendChild(tr);
    }
    pTable.appendChild(pTbody);
    proposalsSection.appendChild(pTable);
  }
  wrapper.appendChild(proposalsSection);

  clearChildren(container);
  container.appendChild(wrapper);
}
