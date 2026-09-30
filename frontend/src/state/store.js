/**
 * ObligaX Central Reactive State Store
 * Event-driven publish/subscribe architecture.
 */

import { api } from '../services/api.js';

class Store {
  constructor() {
    this.listeners = new Set();
    this.state = {
      activeView: 'overview',
      currentParticipant: 'BankA',
      participants: [
        { participantId: 'BankA', participantName: 'Bank A (Global Custody)', party: 'BankA' },
        { participantId: 'BankB', participantName: 'Bank B (Institutional Markets)', party: 'BankB' },
        { participantId: 'BankC', participantName: 'Bank C (Securities Clearing)', party: 'BankC' },
        { participantId: 'NetworkOperator', participantName: 'Clearinghouse & Network Operator', party: 'NetworkOperator' }
      ],
      health: {
        status: 'UNKNOWN',
        connected: false,
        lastCheck: null,
        uptimeSeconds: 0,
        services: null
      },
      lastSyncTime: null,
      obligations: [],
      obligationsLoading: false,
      obligationsError: null,
      obligationsFilter: {
        search: '',
        status: '',
        currency: '',
        counterparty: '',
        savedView: 'all'
      },
      obligationsDensity: 'compact',
      selectedObligationIds: new Set(),
      nettingProposals: [],
      nettingLoading: false,
      settlements: [],
      settlementsLoading: false,
      settlementsFilter: {
        status: '',
        rail: '',
        search: ''
      },
      reconciliationReport: null,
      reconciliationLoading: false,
      auditLogs: [],
      auditTipHash: '',
      auditChainValid: null,
      auditLoading: false,
      activeDrawer: null, // { type: 'obligation'|'settlement', data: {...} }
      activeDrawerTab: 'business', // 'business' | 'canton'
      activeModal: null, // modal name or object
      commandPaletteOpen: false,
      notifications: [],
      isRefreshing: false
    };
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('Store listener error:', err);
      }
    }
  }

  setState(patch) {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  // Views & Shell Navigation
  setActiveView(viewName) {
    this.setState({ activeView: viewName, activeDrawer: null });
  }

  setParticipant(partyId) {
    api.setParticipant(partyId);
    this.setState({ currentParticipant: partyId, selectedObligationIds: new Set() });
    this.refreshAll();
  }

  setDensity(density) {
    this.setState({ obligationsDensity: density });
  }

  // Drawer & Modals
  // Accepts either openDrawer(obligationObject) or openDrawer('obligation', data)
  openDrawer(typeOrData, data) {
    let drawerType = 'obligation';
    let drawerData = typeOrData;
    if (typeof typeOrData === 'string') {
      drawerType = typeOrData;
      drawerData = data;
    }
    this.setState({
      activeDrawer: { type: drawerType, data: drawerData },
      activeDrawerTab: 'business'
    });
  }

  closeDrawer() {
    this.setState({ activeDrawer: null });
  }

  setDrawerTab(tabName) {
    this.setState({ activeDrawerTab: tabName });
  }

  openModal(modalConfig) {
    this.setState({ activeModal: modalConfig });
  }

  closeModal() {
    this.setState({ activeModal: null });
  }

  toggleCommandPalette(forceState) {
    const nextState = forceState !== undefined ? forceState : !this.state.commandPaletteOpen;
    this.setState({ commandPaletteOpen: nextState });
  }

  // Toast Notifications — supports both:
  //   addNotification('success', 'My message')
  //   addNotification({ type: 'error', title: 'Title', message: 'Body', durationMs: 7000 })
  addNotification(typeOrObj, messageStr) {
    let type = 'info';
    let title = '';
    let message = '';
    let durationMs = 5000;

    if (typeof typeOrObj === 'string') {
      type = typeOrObj;
      message = messageStr || '';
    } else if (typeOrObj && typeof typeOrObj === 'object') {
      type = typeOrObj.type || 'info';
      title = typeOrObj.title || '';
      message = typeOrObj.message || '';
      durationMs = typeOrObj.durationMs ?? 5000;
    }

    const id = 'notif-' + Math.random().toString(36).substring(2, 9);
    const notif = { id, type, title, message, createdAt: new Date() };
    const notifications = [notif, ...this.state.notifications].slice(0, 20);
    this.setState({ notifications });

    if (durationMs > 0) {
      setTimeout(() => {
        this.dismissNotification(id);
      }, durationMs);
    }
    return id;
  }

  dismissNotification(id) {
    const notifications = this.state.notifications.filter(n => n.id !== id);
    this.setState({ notifications });
  }

  // Data Loading Operations
  async refreshAll() {
    this.setState({ isRefreshing: true });
    try {
      await Promise.allSettled([
        this.fetchHealth(),
        this.fetchParticipants(),
        this.fetchObligations(),
        this.fetchNettingProposals(),
        this.fetchSettlements(),
        this.fetchAuditLogs()
      ]);
      this.setState({ lastSyncTime: new Date() });
    } finally {
      this.setState({ isRefreshing: false });
    }
  }

  async fetchHealth() {
    try {
      const data = await api.getHealth();
      this.setState({
        health: {
          status: data.status || 'UP',
          connected: data.services?.cantonLedger?.connected ?? true,
          lastCheck: new Date(),
          uptimeSeconds: data.uptimeSeconds || 0,
          services: data.services,
          metrics: data.metrics
        }
      });
    } catch (err) {
      this.setState({
        health: {
          status: 'OFFLINE',
          connected: false,
          lastCheck: new Date(),
          uptimeSeconds: 0,
          services: null,
          metrics: null
        }
      });
    }
  }

  async fetchParticipants() {
    try {
      const data = await api.getParticipants();
      if (Array.isArray(data) && data.length > 0) {
        this.setState({ participants: data });
      }
    } catch (err) {
      // Retain existing default topology on error
    }
  }

  async fetchObligations() {
    this.setState({ obligationsLoading: true, obligationsError: null });
    try {
      const data = await api.getObligations();
      const list = Array.isArray(data) ? data : (data?.data || []);
      this.setState({ obligations: list, obligationsLoading: false });
    } catch (err) {
      this.setState({ obligationsError: err.message, obligationsLoading: false });
    }
  }

  async fetchNettingProposals() {
    this.setState({ nettingLoading: true });
    try {
      const data = await api.getNettingProposals();
      const list = Array.isArray(data) ? data : [];
      this.setState({ nettingProposals: list, nettingLoading: false });
    } catch (err) {
      this.setState({ nettingLoading: false });
    }
  }

  async fetchSettlements() {
    this.setState({ settlementsLoading: true });
    try {
      const data = await api.getSettlements();
      const list = Array.isArray(data) ? data : [];
      this.setState({ settlements: list, settlementsLoading: false });
    } catch (err) {
      this.setState({ settlementsLoading: false });
    }
  }

  async fetchAuditLogs() {
    this.setState({ auditLoading: true });
    try {
      const [auditData, verifyData] = await Promise.allSettled([
        api.getAuditLogs(),
        api.verifyAuditChain()
      ]);
      const logs = auditData.status === 'fulfilled' ? (auditData.value?.logs || auditData.value || []) : [];
      const tipHash = auditData.status === 'fulfilled' ? (auditData.value?.tipHash || '') : '';
      const chainValid = verifyData.status === 'fulfilled' ? verifyData.value?.isValid : null;

      this.setState({
        auditLogs: Array.isArray(logs) ? logs : [],
        auditTipHash: tipHash,
        auditChainValid: chainValid,
        auditLoading: false
      });
    } catch (err) {
      this.setState({ auditLoading: false });
    }
  }

  async runReconciliation() {
    this.setState({ reconciliationLoading: true });
    try {
      const rep = await api.runReconciliation();
      this.setState({ reconciliationReport: rep, reconciliationLoading: false });
      this.addNotification({
        type: rep.isBalanced ? 'success' : 'warning',
        title: rep.isBalanced ? 'Reconciliation Balanced' : 'Discrepancies Detected',
        message: rep.isBalanced
          ? 'PostgreSQL read-projections match Canton active contracts.'
          : `${rep.discrepancies?.length || 0} discrepancy items require operational attention.`
      });
      return rep;
    } catch (err) {
      this.setState({ reconciliationLoading: false });
      this.addNotification({
        type: 'error',
        title: 'Reconciliation Run Failed',
        message: err.message
      });
      throw err;
    }
  }

  // Row selection in grid
  toggleObligationSelection(id) {
    const nextSet = new Set(this.state.selectedObligationIds);
    if (nextSet.has(id)) {
      nextSet.delete(id);
    } else {
      nextSet.add(id);
    }
    this.setState({ selectedObligationIds: nextSet });
  }

  selectAllObligations(ids) {
    this.setState({ selectedObligationIds: new Set(ids) });
  }

  clearObligationSelection() {
    this.setState({ selectedObligationIds: new Set() });
  }

  // Filter setters
  setObligationsFilter(patch) {
    this.setState({
      obligationsFilter: { ...this.state.obligationsFilter, ...patch }
    });
  }

  setSettlementsFilter(patch) {
    this.setState({
      settlementsFilter: { ...this.state.settlementsFilter, ...patch }
    });
  }

  // Convenience setters used by view modules
  setHealth(healthData) {
    this.setState({
      health: {
        status: healthData.status || 'UP',
        connected: healthData.services?.cantonLedger?.connected ?? true,
        lastCheck: new Date(),
        uptime: healthData.uptime || healthData.uptimeSeconds || 0,
        services: healthData.services,
        metrics: healthData.metrics,
        timestamp: healthData.timestamp || new Date().toISOString()
      }
    });
  }

  setReconciliationReport(report) {
    this.setState({ reconciliationReport: report });
  }

  // Computed aliases for views that use state.filters.obligations or state.proposals
  get filters() {
    return {
      obligations: this.state.obligationsFilter,
      settlements: this.state.settlementsFilter
    };
  }

  get proposals() {
    return this.state.nettingProposals;
  }
}

export const store = new Store();
