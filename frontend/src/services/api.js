/**
 * ObligaX Centralized Institutional API Client
 * Enforces correlation IDs, security headers, timeout management,
 * and unified error normalization.
 */

const API_BASE = '/api/v1';

class ApiClient {
  constructor() {
    this.currentParticipant = 'BankA';
    this.timeoutMs = 15000;
  }

  setParticipant(partyId) {
    this.currentParticipant = partyId;
  }

  getParticipant() {
    return this.currentParticipant;
  }

  generateTraceId() {
    return 'trace-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36);
  }

  generateNonce() {
    return Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async request(endpoint, options = {}) {
    const traceId = options.traceId || this.generateTraceId();
    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method || 'GET');

    const headers = {
      'Content-Type': 'application/json',
      'x-party-id': this.currentParticipant,
      'x-trace-id': traceId,
      ...(options.headers || {})
    };

    // If mutating high-value operation, attach anti-replay headers
    if (isMutating && (endpoint.includes('/settlement') || endpoint.includes('/netting') || endpoint.includes('/governance'))) {
      headers['x-timestamp'] = String(Date.now());
      headers['x-nonce'] = this.generateNonce();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || this.timeoutMs);

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal
      });

      clearTimeout(timeout);

      const contentType = response.headers.get('content-type') || '';
      let body = null;
      if (contentType.includes('application/json')) {
        body = await response.json();
      } else {
        body = await response.text();
      }

      if (!response.ok) {
        const errorObj = (typeof body === 'object' && body !== null) ? body : {};
        const message = errorObj.error?.message || errorObj.message || `HTTP ${response.status}: Request failed`;
        const code = errorObj.error?.code || errorObj.code || 'ERR_HTTP_' + response.status;
        const error = new Error(message);
        error.code = code;
        error.status = response.status;
        error.details = errorObj;
        throw error;
      }

      // ObligaX API returns { success: true, data: ..., meta: ... }
      if (typeof body === 'object' && body !== null && 'data' in body) {
        return body.data;
      }
      return body;
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        const timeoutError = new Error(`Request timed out after ${this.timeoutMs}ms: ${endpoint}`);
        timeoutError.code = 'ERR_TIMEOUT';
        throw timeoutError;
      }
      throw err;
    }
  }

  // Health & Telemetry
  async getHealth() {
    return this.request('/health');
  }

  // Obligations
  async getObligations(filters = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value));
      }
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/obligations${query}`);
  }

  async getObligation(id) {
    return this.request(`/obligations/${encodeURIComponent(id)}`);
  }

  async createObligation(dto) {
    return this.request('/obligations', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  }

  async acceptObligation(id) {
    return this.request(`/obligations/${encodeURIComponent(id)}/accept`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  }

  async confirmObligation(id) {
    return this.request(`/obligations/${encodeURIComponent(id)}/confirm`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  }

  async cancelObligation(id, cancellationReason) {
    return this.request(`/obligations/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ cancellationReason })
    });
  }

  async proposeAmendment(id, amendmentDto) {
    return this.request(`/obligations/${encodeURIComponent(id)}/amendments`, {
      method: 'POST',
      body: JSON.stringify(amendmentDto)
    });
  }

  async raiseDispute(id, disputeDto) {
    return this.request(`/obligations/${encodeURIComponent(id)}/disputes`, {
      method: 'POST',
      body: JSON.stringify(disputeDto)
    });
  }

  // Netting
  async getNettingProposals(filters = {}) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.append(k, String(v));
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/netting/proposals${query}`);
  }

  async getNettingProposal(id) {
    return this.request(`/netting/proposals/${encodeURIComponent(id)}`);
  }

  async proposeNetting(dto) {
    return this.request('/netting/proposals', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  }

  async acceptNetting(id) {
    return this.request(`/netting/proposals/${encodeURIComponent(id)}/accept`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  }

  async rejectNetting(id, reason) {
    return this.request(`/netting/proposals/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  async executeNetting(id) {
    return this.request(`/netting/proposals/${encodeURIComponent(id)}/execute`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  }

  // Settlements
  async getSettlements(filters = {}) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.append(k, String(v));
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/settlements${query}`);
  }

  async getSettlement(id) {
    return this.request(`/settlements/${encodeURIComponent(id)}`);
  }

  async initiateSettlement(dto) {
    return this.request('/settlements', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  }

  async processSettlement(id) {
    return this.request(`/settlements/${encodeURIComponent(id)}/process`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  }

  async retrySettlement(dto) {
    return this.request('/settlements/retry', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  }

  // Complete a processing settlement (confirm finality on ledger)
  async completeSettlement(id) {
    return this.request(`/settlements/${encodeURIComponent(id)}/callback`, {
      method: 'POST',
      body: JSON.stringify({
        status: 'SettlementCompleted',
        externalReference: `FIN-${id}`,
        message: 'Finality confirmed by operations'
      })
    });
  }

  // Mark settlement as failed (exception workflow)
  async failSettlement(id, reason) {
    return this.request(`/settlements/${encodeURIComponent(id)}/callback`, {
      method: 'POST',
      body: JSON.stringify({
        status: 'SettlementFailed',
        reason: reason || 'Rail adapter rejection',
        message: 'Settlement failed'
      })
    });
  }

  // Netting alias methods used by netting.js view
  async acceptProposal(id) {
    return this.acceptNetting(id);
  }

  async rejectProposal(id, reason) {
    return this.rejectNetting(id, reason);
  }

  async executeProposal(id) {
    return this.executeNetting(id);
  }

  // Reconciliation
  async runReconciliation() {
    return this.request('/reconciliation/run', {
      method: 'POST',
      body: JSON.stringify({})
    });
  }

  // Governance & Participants
  async getParticipants() {
    return this.request('/governance/participants');
  }

  async getParticipantById(id) {
    return this.request(`/governance/participants/${encodeURIComponent(id)}`);
  }

  async getPolicy() {
    return this.request('/governance/policy');
  }

  async setPolicy(policyDto) {
    return this.request('/governance/policy', {
      method: 'POST',
      body: JSON.stringify(policyDto)
    });
  }

  // Audit
  async getAuditLogs(filters = {}) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.append(k, String(v));
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/governance/audit${query}`);
  }

  async verifyAuditChain() {
    return this.request('/governance/audit/verify');
  }
}

export const api = new ApiClient();
