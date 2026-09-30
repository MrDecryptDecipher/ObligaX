/**
 * ObligaX Obligations High-Density Financial Data Grid
 * Full-featured institutional data grid with saved views, multi-filters,
 * column sorting, selection, density toggle, and side-drawer inspection.
 */

import { store } from '../state/store.js';
import { createElement, clearChildren } from '../utils/dom.js';
import { createSvgIcon } from '../utils/icons.js';
import { formatCurrency, formatTimestamp, getStatusMeta } from '../utils/formatters.js';

let sortColumn = 'dueDate';
let sortDirection = 'asc'; // 'asc' | 'desc'
let densityMode = 'compact'; // 'compact' | 'comfortable'
let currentPage = 1;
let pageSize = 25;
let selectedIds = new Set();

export function renderObligations(container) {
  const state = store.getState();
  const currentParty = state.currentParticipant;
  const filter = state.obligationsFilter;

  // 1. Filter logic
  let items = [...state.obligations];

  // Saved view filter
  const activeSavedView = filter.savedView || 'all';
  if (activeSavedView === 'mine') {
    items = items.filter(o => o.creditor === currentParty || o.debtor === currentParty);
  } else if (activeSavedView === 'pending') {
    items = items.filter(o => o.status === 'Proposed' || o.status === 'Accepted');
  } else if (activeSavedView === 'confirmed') {
    items = items.filter(o => o.status === 'Confirmed');
  } else if (activeSavedView === 'netting_eligible') {
    items = items.filter(o => o.status === 'Confirmed');
  } else if (activeSavedView === 'settlement_pending') {
    items = items.filter(o => o.status === 'SettlementPending');
  } else if (activeSavedView === 'disputed') {
    items = items.filter(o => o.status === 'Disputed');
  } else if (activeSavedView === 'terminal') {
    items = items.filter(o => o.status === 'Settled' || o.status === 'Netted');
  }

  // Explicit status filter
  if (filter.status && filter.status !== 'ALL') {
    items = items.filter(o => o.status === filter.status);
  }

  // Currency filter
  if (filter.currency && filter.currency !== 'ALL') {
    items = items.filter(o => o.currency === filter.currency);
  }

  // Counterparty filter
  if (filter.counterparty && filter.counterparty !== 'ALL') {
    items = items.filter(o => o.creditor === filter.counterparty || o.debtor === filter.counterparty);
  }

  // Text search
  if (filter.search && filter.search.trim()) {
    const q = filter.search.trim().toLowerCase();
    items = items.filter(o =>
      (o.obligationId && o.obligationId.toLowerCase().includes(q)) ||
      (o.creditor && o.creditor.toLowerCase().includes(q)) ||
      (o.debtor && o.debtor.toLowerCase().includes(q)) ||
      (o.currency && o.currency.toLowerCase().includes(q)) ||
      (o.contractId && o.contractId.toLowerCase().includes(q))
    );
  }

  // 2. Sorting logic
  items.sort((a, b) => {
    let valA = a[sortColumn];
    let valB = b[sortColumn];

    if (sortColumn === 'amount') {
      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
    } else {
      valA = String(valA || '').toLowerCase();
      valB = String(valB || '').toLowerCase();
    }

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // 3. Pagination calculations
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  const startIndex = (currentPage - 1) * pageSize;
  const visibleItems = items.slice(startIndex, startIndex + pageSize);

  // BUILD GRID DOM
  const gridContainer = createElement('div', {
    className: `grid-container density-${densityMode}`
  });

  // Top Toolbar
  const toolbar = createElement('div', { className: 'grid-toolbar' });

  const toolbarTop = createElement('div', { className: 'grid-toolbar-top' });

  // Search input
  const searchBox = createElement('div', { className: 'grid-search-box' },
    createElement('span', { className: 'grid-search-icon' }, createSvgIcon('search', 14)),
    createElement('input', {
      type: 'text',
      className: 'grid-search-input',
      placeholder: 'Search obligations by ID, counterparty, Canton CID...',
      value: filter.search || '',
      onInput: (e) => {
        store.setObligationsFilter({ search: e.target.value });
        currentPage = 1;
        renderObligations(container);
      }
    })
  );

  // Right controls (density, refresh, propose)
  const controlsRight = createElement('div', { className: 'grid-controls-right' },
    // Currency filter dropdown
    createElement('select', {
      className: 'form-control',
      style: { width: 'auto', padding: '4px 8px', fontSize: '12px' },
      onChange: (e) => {
        store.setObligationsFilter({ currency: e.target.value });
        currentPage = 1;
        renderObligations(container);
      }
    },
      createElement('option', { value: 'ALL', selected: (!filter.currency || filter.currency === 'ALL') }, 'All Currencies'),
      createElement('option', { value: 'USD', selected: filter.currency === 'USD' }, 'USD'),
      createElement('option', { value: 'EUR', selected: filter.currency === 'EUR' }, 'EUR'),
      createElement('option', { value: 'GBP', selected: filter.currency === 'GBP' }, 'GBP'),
      createElement('option', { value: 'SGD', selected: filter.currency === 'SGD' }, 'SGD')
    ),

    // Density toggle
    createElement('button', {
      className: 'btn btn-secondary',
      title: `Switch density (Current: ${densityMode})`,
      style: { padding: '5px 8px' },
      onClick: () => {
        densityMode = densityMode === 'compact' ? 'comfortable' : 'compact';
        renderObligations(container);
      }
    }, densityMode === 'compact' ? 'Dense' : 'Relaxed'),

    // Propose Obligation primary CTA
    createElement('button', {
      className: 'btn btn-primary',
      onClick: () => store.openModal('create-obligation')
    }, createSvgIcon('plus', 14), 'Propose Obligation')
  );

  toolbarTop.appendChild(searchBox);
  toolbarTop.appendChild(controlsRight);
  toolbar.appendChild(toolbarTop);

  // Saved Views Tabs Row
  const savedViews = [
    { id: 'all', label: 'All' },
    { id: 'mine', label: 'My Obligations' },
    { id: 'confirmed', label: 'Confirmed' },
    { id: 'netting_eligible', label: 'Netting Eligible' },
    { id: 'pending', label: 'Pending Action' },
    { id: 'settlement_pending', label: 'Settlement Pending' },
    { id: 'disputed', label: 'Disputed' },
    { id: 'terminal', label: 'Terminal / Settled' }
  ];

  const savedViewsContainer = createElement('div', { className: 'saved-views-tabs' });
  for (const sv of savedViews) {
    const tab = createElement('div', {
      className: `saved-view-tab ${activeSavedView === sv.id ? 'active' : ''}`,
      onClick: () => {
        store.setObligationsFilter({ savedView: sv.id, status: 'ALL' });
        currentPage = 1;
        renderObligations(container);
      }
    }, sv.label);
    savedViewsContainer.appendChild(tab);
  }
  toolbar.appendChild(savedViewsContainer);

  gridContainer.appendChild(toolbar);

  // Selection Action Bar (if any rows selected)
  if (selectedIds.size > 0) {
    const selectionBar = createElement('div', { className: 'grid-selection-bar' },
      createElement('span', null, `${selectedIds.size} obligations selected`),
      createElement('div', { style: { display: 'flex', gap: '8px' } },
        createElement('button', {
          className: 'btn btn-secondary',
          style: { padding: '3px 8px', fontSize: '11px' },
          onClick: () => {
            selectedIds.clear();
            renderObligations(container);
          }
        }, 'Deselect All'),
        createElement('button', {
          className: 'btn btn-primary',
          style: { padding: '3px 8px', fontSize: '11px' },
          onClick: () => {
            store.setActiveView('netting');
          }
        }, createSvgIcon('netting', 12), 'Send to Netting Workbench')
      )
    );
    gridContainer.appendChild(selectionBar);
  }

  // Table Viewport
  const viewport = createElement('div', { className: 'table-viewport' });
  const table = createElement('table', { className: 'data-table' });

  // Table Header
  const thead = createElement('thead');
  const headerRow = createElement('tr');

  // Checkbox column
  const thSelect = createElement('th', { style: { width: '36px', textAlign: 'center' } },
    createElement('input', {
      type: 'checkbox',
      checked: visibleItems.length > 0 && visibleItems.every(o => selectedIds.has(o.obligationId)),
      onChange: (e) => {
        if (e.target.checked) {
          visibleItems.forEach(o => selectedIds.add(o.obligationId));
        } else {
          visibleItems.forEach(o => selectedIds.delete(o.obligationId));
        }
        renderObligations(container);
      }
    })
  );
  headerRow.appendChild(thSelect);

  // Column config
  const columns = [
    { id: 'obligationId', label: 'Obligation ID', sortable: true },
    { id: 'status', label: 'Status', sortable: true },
    { id: 'creditor', label: 'Creditor', sortable: true },
    { id: 'debtor', label: 'Debtor', sortable: true },
    { id: 'amount', label: 'Amount', sortable: true, align: 'right' },
    { id: 'currency', label: 'CCY', sortable: true },
    { id: 'dueDate', label: 'Due Date', sortable: true },
    { id: 'contractId', label: 'Canton CID', sortable: false },
    { id: 'actions', label: 'Actions', sortable: false, align: 'right' }
  ];

  for (const col of columns) {
    const th = createElement('th', {
      className: col.sortable ? 'sortable' : '',
      style: col.align ? { textAlign: col.align } : {}
    });

    if (col.sortable) {
      th.addEventListener('click', () => {
        if (sortColumn === col.id) {
          sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          sortColumn = col.id;
          sortDirection = 'asc';
        }
        renderObligations(container);
      });
    }

    const thContent = createElement('span', { className: 'th-content' }, col.label);
    if (col.sortable) {
      const isSorted = sortColumn === col.id;
      const iconName = isSorted ? (sortDirection === 'asc' ? 'chevronUp' : 'chevronDown') : 'chevronDown';
      const sortIcon = createSvgIcon(iconName, 12, `sort-icon ${isSorted ? 'active' : ''}`);
      thContent.appendChild(sortIcon);
    }

    th.appendChild(thContent);
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Table Body
  const tbody = createElement('tbody');

  if (visibleItems.length === 0) {
    const emptyRow = createElement('tr', null,
      createElement('td', {
        colSpan: columns.length + 1,
        style: { textAlign: 'center', padding: '40px 20px', color: 'var(--text-tertiary)' }
      },
        createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' } },
          createSvgIcon('obligations', 32, 'text-tertiary'),
          createElement('div', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' } },
            'No obligations match current criteria'
          ),
          createElement('div', { style: { fontSize: '11px' } },
            'Adjust search filters or propose a new bilateral obligation on the Canton ledger.'
          )
        )
      )
    );
    tbody.appendChild(emptyRow);
  } else {
    for (const o of visibleItems) {
      const isSelected = selectedIds.has(o.obligationId);
      const isMyCreditor = o.creditor === currentParty;
      const isMyDebtor = o.debtor === currentParty;
      const statusMeta = getStatusMeta(o.status);

      const tr = createElement('tr', {
        className: isSelected ? 'selected' : '',
        onClick: (e) => {
          // If clicking checkbox or action button, do not open drawer
          if (e.target.tagName === 'INPUT' || e.target.closest('button')) return;
          store.openDrawer(o);
        }
      });

      // Checkbox td
      const tdSelect = createElement('td', { style: { textAlign: 'center' } },
        createElement('input', {
          type: 'checkbox',
          checked: isSelected,
          onChange: (e) => {
            if (e.target.checked) selectedIds.add(o.obligationId);
            else selectedIds.delete(o.obligationId);
            renderObligations(container);
          }
        })
      );
      tr.appendChild(tdSelect);

      // Obligation ID
      const tdId = createElement('td', { className: 'col-id' },
        createElement('span', { style: { cursor: 'pointer', color: 'var(--accent-primary)' } }, o.obligationId)
      );
      tr.appendChild(tdId);

      // Status Badge
      const tdStatus = createElement('td', null,
        createElement('span', { className: `badge ${statusMeta.badgeClass}` }, statusMeta.label)
      );
      tr.appendChild(tdStatus);

      // Creditor
      const tdCreditor = createElement('td', null,
        createElement('span', {
          style: isMyCreditor ? { fontWeight: '700', color: 'var(--text-primary)' } : { color: 'var(--text-secondary)' }
        }, o.creditor, isMyCreditor ? ' (You)' : '')
      );
      tr.appendChild(tdCreditor);

      // Debtor
      const tdDebtor = createElement('td', null,
        createElement('span', {
          style: isMyDebtor ? { fontWeight: '700', color: 'var(--text-primary)' } : { color: 'var(--text-secondary)' }
        }, o.debtor, isMyDebtor ? ' (You)' : '')
      );
      tr.appendChild(tdDebtor);

      // Amount
      const tdAmount = createElement('td', { className: 'col-amount' },
        createElement('span', {
          style: isMyCreditor ? { color: 'var(--state-success)' } : (isMyDebtor ? { color: 'var(--text-primary)' } : {})
        }, formatCurrency(o.amount, o.currency))
      );
      tr.appendChild(tdAmount);

      // CCY
      const tdCcy = createElement('td', { className: 'mono' }, o.currency || 'USD');
      tr.appendChild(tdCcy);

      // Due Date
      const tdDueDate = createElement('td', { className: 'mono', style: { fontSize: '11px', color: 'var(--text-secondary)' } },
        formatTimestamp(o.dueDate).split(' ')[0]
      );
      tr.appendChild(tdDueDate);

      // Canton Contract ID
      const tdCid = createElement('td', { className: 'mono', style: { fontSize: '10px', color: 'var(--text-tertiary)' } },
        o.contractId ? `${o.contractId.slice(0, 10)}...` : 'Unassigned'
      );
      tr.appendChild(tdCid);

      // Contextual Actions
      const tdActions = createElement('td', { className: 'col-actions' });
      const actionBtn = createElement('button', {
        className: 'btn btn-secondary',
        style: { padding: '2px 6px', fontSize: '11px' },
        onClick: (e) => {
          e.stopPropagation();
          store.openDrawer(o);
        }
      }, createSvgIcon('chevronRight', 12), 'Inspect');
      tdActions.appendChild(actionBtn);
      tr.appendChild(tdActions);

      tbody.appendChild(tr);
    }
  }

  table.appendChild(tbody);
  viewport.appendChild(table);
  gridContainer.appendChild(viewport);

  // Pagination Footer
  const footer = createElement('div', { className: 'grid-footer' },
    createElement('div', { className: 'page-info' },
      `Showing ${totalItems === 0 ? 0 : startIndex + 1}–${Math.min(startIndex + pageSize, totalItems)} of ${totalItems} obligations`
    ),
    createElement('div', { className: 'pagination-controls' },
      createElement('div', { className: 'page-size-selector' },
        createElement('span', null, 'Rows:'),
        createElement('select', {
          onChange: (e) => {
            pageSize = Number(e.target.value);
            currentPage = 1;
            renderObligations(container);
          }
        },
          createElement('option', { value: '25', selected: pageSize === 25 }, '25'),
          createElement('option', { value: '50', selected: pageSize === 50 }, '50'),
          createElement('option', { value: '100', selected: pageSize === 100 }, '100')
        )
      ),
      createElement('button', {
        className: 'btn btn-secondary',
        disabled: currentPage <= 1,
        style: { padding: '3px 8px', fontSize: '11px' },
        onClick: () => {
          if (currentPage > 1) {
            currentPage--;
            renderObligations(container);
          }
        }
      }, 'Prev'),
      createElement('span', { className: 'mono', style: { fontSize: '11px', padding: '0 4px' } }, `${currentPage} / ${totalPages}`),
      createElement('button', {
        className: 'btn btn-secondary',
        disabled: currentPage >= totalPages,
        style: { padding: '3px 8px', fontSize: '11px' },
        onClick: () => {
          if (currentPage < totalPages) {
            currentPage++;
            renderObligations(container);
          }
        }
      }, 'Next')
    )
  );
  gridContainer.appendChild(footer);

  clearChildren(container);
  container.appendChild(gridContainer);
}
