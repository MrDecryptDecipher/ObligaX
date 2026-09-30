// ObligaX Institutional Console Client Application
const API_BASE = '/api/v1';

let currentParticipant = 'BankA';
let cachedObligations = [];
let selectedNettingObligationIds = new Set();

// DOM Elements
const participantSelect = document.getElementById('activeParticipant');
const navTabs = document.querySelectorAll('.nav-tab');
const tabPanes = document.querySelectorAll('.tab-pane');

const obligationsTableBody = document.getElementById('obligationsTableBody');
const refreshObligationsBtn = document.getElementById('refreshObligationsBtn');
const openCreateModalBtn = document.getElementById('openCreateObligationModalBtn');
const closeCreateModalBtn = document.getElementById('closeCreateObligationModalBtn');
const cancelCreateModalBtn = document.getElementById('cancelCreateModalBtn');
const createModal = document.getElementById('createObligationModal');
const createForm = document.getElementById('createObligationForm');

const metricConfirmedVolume = document.getElementById('metricConfirmedVolume');
const metricPendingCount = document.getElementById('metricPendingCount');
const metricInFlightCount = document.getElementById('metricInFlightCount');
const metricTerminalCount = document.getElementById('metricTerminalCount');

const nettingCandidatesList = document.getElementById('nettingCandidatesList');
const nettingGrossReceivable = document.getElementById('nettingGrossReceivable');
const nettingGrossPayable = document.getElementById('nettingGrossPayable');
const nettingNetAmount = document.getElementById('nettingNetAmount');
const nettingDirection = document.getElementById('nettingDirection');
const proposeNettingBtn = document.getElementById('proposeNettingBtn');
const nettingRunIdInput = document.getElementById('nettingRunId');
const nettingTableBody = document.getElementById('nettingTableBody');

const settlementTableBody = document.getElementById('settlementTableBody');

const runReconciliationBtn = document.getElementById('runReconciliationBtn');
const reconciliationResultBox = document.getElementById('reconciliationResultBox');
const recTimestamp = document.getElementById('recTimestamp');
const recDbCount = document.getElementById('recDbCount');
const recLedgerCount = document.getElementById('recLedgerCount');
const recStatusBadge = document.getElementById('recStatusBadge');
const discrepancyList = document.getElementById('discrepancyList');

// API helper injecting actor party
async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-party-id': currentParticipant,
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const body = await response.json();
  if (!response.ok) {
    const errorMsg = body?.error?.message || `HTTP ${response.status}: Request failed`;
    throw new Error(errorMsg);
  }
  return body.data;
}

// Format Currency
function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(Number(amount));
}

// Tab Switching
navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    navTabs.forEach(t => t.classList.remove('active'));
    tabPanes.forEach(p => p.classList.remove('active'));

    tab.classList.add('active');
    const targetPane = document.getElementById(`tab-${tab.dataset.tab}`);
    if (targetPane) targetPane.classList.add('active');

    if (tab.dataset.tab === 'netting') {
      updateNettingCandidates();
    }
  });
});

// Participant Switching
participantSelect.addEventListener('change', (e) => {
  currentParticipant = e.target.value;
  loadObligations();
});

// Load Obligations
async function loadObligations() {
  try {
    const data = await apiRequest('/obligations');
    cachedObligations = data || [];
    renderObligationsTable(cachedObligations);
    updateMetrics(cachedObligations);
    updateNettingCandidates();
  } catch (err) {
    obligationsTableBody.innerHTML = `<tr><td colspan="9" class="empty-state">Error loading obligations: ${err.message}</td></tr>`;
  }
}

function updateMetrics(obligations) {
  let confirmedVol = 0;
  let pending = 0;
  let inFlight = 0;
  let terminal = 0;

  for (const o of obligations) {
    if (o.status === 'Confirmed') {
      confirmedVol += Number(o.amount);
    } else if (['Proposed', 'Accepted'].includes(o.status)) {
      pending++;
    } else if (['SettlementPending', 'NettingPending', 'AmendmentPending', 'Disputed'].includes(o.status)) {
      inFlight++;
    } else if (['Settled', 'Netted', 'Cancelled'].includes(o.status)) {
      terminal++;
    }
  }

  metricConfirmedVolume.textContent = formatCurrency(confirmedVol);
  metricPendingCount.textContent = pending;
  metricInFlightCount.textContent = inFlight;
  metricTerminalCount.textContent = terminal;
}

function renderObligationsTable(obligations) {
  if (!obligations.length) {
    obligationsTableBody.innerHTML = '<tr><td colspan="9" class="empty-state">No obligations found on ledger.</td></tr>';
    return;
  }

  obligationsTableBody.innerHTML = obligations.map(o => {
    let actions = '';

    if (o.status === 'Proposed' && o.debtor === currentParticipant) {
      actions += `<button class="btn btn-primary btn-sm" onclick="acceptObligation('${o.obligationId}')">Accept</button> `;
    }

    if (o.status === 'Accepted' && o.creditor === currentParticipant) {
      actions += `<button class="btn btn-primary btn-sm" onclick="confirmObligation('${o.obligationId}')">Confirm</button> `;
    }

    if (o.status === 'Confirmed') {
      if (o.creditor === currentParticipant) {
        actions += `<button class="btn btn-secondary btn-sm" onclick="directSettleObligation('${o.obligationId}')">Settle</button> `;
      }
      actions += `<button class="btn btn-secondary btn-sm" onclick="raiseDispute('${o.obligationId}')">Dispute</button> `;
    }

    if (!actions) {
      actions = `<span class="text-muted">—</span>`;
    }

    return `
      <tr>
        <td><strong>${o.obligationId}</strong></td>
        <td>${o.creditor}</td>
        <td>${o.debtor}</td>
        <td>${formatCurrency(o.amount, o.currency)}</td>
        <td>${o.currency}</td>
        <td><span class="badge badge-${o.status}">${o.status}</span></td>
        <td>${new Date(o.dueDate).toISOString().split('T')[0]}</td>
        <td>v${o.version}</td>
        <td>${actions}</td>
      </tr>
    `;
  }).join('');
}

// Obligation Actions
window.acceptObligation = async function(id) {
  try {
    await apiRequest(`/obligations/${id}/accept`, { method: 'POST', body: JSON.stringify({}) });
    loadObligations();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
};

window.confirmObligation = async function(id) {
  try {
    await apiRequest(`/obligations/${id}/confirm`, { method: 'POST', body: JSON.stringify({}) });
    loadObligations();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
};

window.directSettleObligation = async function(obligationId) {
  try {
    const settlementId = `SETTLE-${obligationId}-${Date.now().toString().slice(-4)}`;
    await apiRequest('/settlements', {
      method: 'POST',
      body: JSON.stringify({
        settlementId,
        obligationId,
        settlementRail: 'RTGS',
        sourceSystem: 'Console',
        sourceReference: `REF-${settlementId}`
      })
    });
    alert(`Settlement instruction ${settlementId} initiated on Canton! Moving to settlement monitor.`);
    loadObligations();
  } catch (err) {
    alert(`Error initiating settlement: ${err.message}`);
  }
};

// Netting Workbench
function updateNettingCandidates() {
  const confirmed = cachedObligations.filter(o => o.status === 'Confirmed');
  if (!confirmed.length) {
    nettingCandidatesList.innerHTML = '<div class="empty-state">No Confirmed obligations available for netting.</div>';
    recalculateNetting();
    return;
  }

  nettingCandidatesList.innerHTML = confirmed.map(o => `
    <div style="display:flex; align-items:center; gap:0.75rem; padding: 0.5rem 0; border-bottom: 1px solid var(--border-color);">
      <input type="checkbox" id="net-chk-${o.obligationId}" value="${o.obligationId}" onchange="toggleNettingCandidate('${o.obligationId}')" ${selectedNettingObligationIds.has(o.obligationId) ? 'checked' : ''}>
      <label for="net-chk-${o.obligationId}" style="flex:1; cursor:pointer;">
        <strong>${o.obligationId}</strong> (${o.creditor} ← ${o.debtor}): ${formatCurrency(o.amount, o.currency)}
      </label>
    </div>
  `).join('');

  recalculateNetting();
}

window.toggleNettingCandidate = function(id) {
  if (selectedNettingObligationIds.has(id)) {
    selectedNettingObligationIds.delete(id);
  } else {
    selectedNettingObligationIds.add(id);
  }
  recalculateNetting();
};

function recalculateNetting() {
  let grossRec = 0;
  let grossPay = 0;

  for (const id of selectedNettingObligationIds) {
    const obl = cachedObligations.find(o => o.obligationId === id);
    if (!obl) continue;

    const amt = Number(obl.amount);
    if (obl.creditor === currentParticipant) {
      grossRec += amt;
    } else if (obl.debtor === currentParticipant) {
      grossPay += amt;
    }
  }

  const net = Math.abs(grossRec - grossPay);
  const dir = grossRec >= grossPay ? 'CounterpartyPays' : 'InitiatorPays';

  nettingGrossReceivable.textContent = formatCurrency(grossRec);
  nettingGrossPayable.textContent = formatCurrency(grossPay);
  nettingNetAmount.textContent = formatCurrency(net);
  nettingDirection.textContent = selectedNettingObligationIds.size > 0 ? dir : 'N/A';
}

proposeNettingBtn.addEventListener('click', async () => {
  if (selectedNettingObligationIds.size === 0) {
    alert('Please select at least one Confirmed obligation for netting.');
    return;
  }

  const counterparty = currentParticipant === 'BankA' ? 'BankB' : 'BankA';
  const nettingId = nettingRunIdInput.value.trim() || `NET-${Date.now()}`;

  try {
    const proposal = await apiRequest('/netting/proposals', {
      method: 'POST',
      body: JSON.stringify({
        nettingId,
        counterparty,
        obligationIds: Array.from(selectedNettingObligationIds),
        currency: 'USD',
        sourceSystem: 'Console',
        sourceReference: `RUN-${nettingId}`,
        businessUnit: 'ClearingOps'
      })
    });

    alert(`Netting proposal ${nettingId} successfully created on Canton!`);
    selectedNettingObligationIds.clear();
    loadObligations();
  } catch (err) {
    alert(`Netting Proposal Error: ${err.message}`);
  }
});

// Reconciliation
runReconciliationBtn.addEventListener('click', async () => {
  try {
    const rep = await apiRequest('/reconciliation/run', { method: 'POST', body: JSON.stringify({}) });
    reconciliationResultBox.classList.remove('hidden');

    recTimestamp.textContent = new Date(rep.timestamp).toLocaleString();
    recDbCount.textContent = rep.totalDbRecords;
    recLedgerCount.textContent = rep.totalLedgerContracts;

    recStatusBadge.textContent = rep.isBalanced ? 'BALANCED' : 'DISCREPANCY DETECTED';
    recStatusBadge.className = rep.isBalanced ? 'badge badge-Confirmed' : 'badge badge-Disputed';

    if (rep.discrepancies.length === 0) {
      discrepancyList.innerHTML = '<div style="color: var(--accent-green); font-size: 0.9rem;">✓ All PostgreSQL projections perfectly match active Canton ledger contracts.</div>';
    } else {
      discrepancyList.innerHTML = rep.discrepancies.map(d => `
        <div style="background-color: var(--bg-tertiary); padding: 0.75rem; border-radius: 4px; margin-bottom: 0.5rem; font-family: var(--font-mono); font-size: 0.8rem;">
          [${d.type}] Obligation: <strong>${d.obligationId}</strong> | DB: ${JSON.stringify(d.dbValue)} | Ledger: ${JSON.stringify(d.ledgerValue)}
        </div>
      `).join('');
    }
  } catch (err) {
    alert(`Reconciliation error: ${err.message}`);
  }
});

// Modal handlers
openCreateModalBtn.addEventListener('click', () => createModal.classList.remove('hidden'));
closeCreateModalBtn.addEventListener('click', () => createModal.classList.add('hidden'));
cancelCreateModalBtn.addEventListener('click', () => createModal.classList.add('hidden'));

createForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    obligationId: document.getElementById('newOblId').value.trim(),
    creditor: document.getElementById('newCreditor').value,
    debtor: document.getElementById('newDebtor').value,
    amount: document.getElementById('newAmount').value.trim(),
    currency: document.getElementById('newCurrency').value,
    createdDate: new Date().toISOString().split('T')[0],
    dueDate: document.getElementById('newDueDate').value,
    description: document.getElementById('newDescription').value.trim(),
    sourceSystem: 'Console',
    sourceReference: `REF-${Date.now().toString().slice(-4)}`,
    businessUnit: 'Treasury'
  };

  try {
    await apiRequest('/obligations', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    createModal.classList.add('hidden');
    createForm.reset();
    loadObligations();
  } catch (err) {
    alert(`Error creating obligation: ${err.message}`);
  }
});

refreshObligationsBtn.addEventListener('click', loadObligations);

// Initial load
loadObligations();
