# ObligaX System Architecture

## 1. Executive Summary

**ObligaX** is an institutional-grade, privacy-preserving distributed obligation management, bilateral netting, settlement, and governance platform built on **DAML / Canton** with a **PostgreSQL** read-model projection layer and a high-throughput **TypeScript/Node.js** enterprise integration tier.

The platform provides financial institutions (banks, prime brokers, asset managers, central clearing counterparts) with a verifiable distributed ledger for representing contractual obligations while maintaining strict Canton sub-transaction privacy between participants.

---

## 2. Fundamental Architectural Principle

> **DAML / Canton is the authoritative source of truth for all economic and contractual state.**

Neither the PostgreSQL database, the backend cache, nor external rails possess authority over obligation status or contract validity. 

```
                       INSTITUTIONAL CLIENTS
                 (Web Console / Treasury Systems)
                                |
                                v
                   [ REST / JSON API Tier ]
                                |
       +------------------------+------------------------+
       |                                                 |
       v                                                 v
[ PostgreSQL 15+ ]                              [ Canton Ledger API ]
  - Read Projections (CQRS)                       - Authoritative State
  - Exact-Once Idempotency Store                  - Sub-Transaction Privacy
  - Audit Trail Archive                           - Multi-Party Authorization
  - Operational Reconciliation Data               - Immutable Contracts
       ^                                                 |
       |                                                 |
       +----------- [ Active Sync & Reconciliation ] ----+
                                |
                                v
                   [ External Settlement Rails ]
                  (RTGS, Fedwire, Tokenized Cash)
```

- **Canton/DAML**: Authoritative ledger state, immutable contract lifecycle, non-repudiation, bilateral multi-party authorization.
- **PostgreSQL**: High-speed relational query projections, idempotency deduplication cache, query filtering, and audit log storage.
- **Backend Tier**: API validation boundary, authentication (JWT/mTLS), RBAC policy enforcement, and external rail integration.
- **Reconciliation Engine**: Automated divergence detection verifying active Canton contracts against local relational projections.

---

## 3. Core Subsystems

### 3.1 Obligation Lifecycle Engine
Maintains the authoritative state transitions of financial obligations:
- `Proposed`: Created by an authorized participant or operator. Signatory: creator; Observers: creditor, debtor.
- `Accepted`: Counterparty debtor commits to legal validity. Signatories: creator, debtor.
- `Confirmed`: Creditor confirms receivable. Signatories: creditor, debtor.
- `SettlementPending`: Obligation locked for direct settlement.
- `Settled`: Terminal state upon confirmed payment on external rails.
- `NettingPending`: Obligation locked for bilateral netting execution.
- `Netted`: Terminal state upon atomic consumption and netting execution.
- `Disputed`: Contract flagged for resolution; returns to Confirmed once resolved.
- `AmendmentPending`: Commercial terms under negotiation; updates terms upon bilateral acceptance.

### 3.2 Bilateral Netting Engine
Allows two institutions to aggregate opposing obligations and calculate net settlement obligations:
- **Atomicity (No Partial Netting)**: Every obligation in the netting set must be in `Confirmed` state. The DAML smart contract atomically exercises and consumes all participating contracts in a single transaction. If any contract is invalid or unavailable, the entire netting transaction aborts with zero ledger mutations.
- **Direction Determination**:
  $$\text{Net Amount} = |\text{Gross Receivable} - \text{Gross Payable}|$$
  - $\text{Gross Receivable} \ge \text{Gross Payable} \implies \text{CounterpartyPays}$
  - $\text{Gross Receivable} < \text{Gross Payable} \implies \text{InitiatorPays}$

### 3.3 Settlement Engine & Rail Adapter
Decouples ledger commitment from external rail execution:
- Moves confirmed obligations to `SettlementPending`.
- Creates a `SettlementInstruction` with external rail dispatch metadata.
- Executes payment across RTGS / Fedwire / Tokenized rails.
- **Success**: Transitions obligation to `Settled` and records execution proof.
- **Failure**: Records failure details, and **safely reopens the obligation to Confirmed**, allowing retries or amendments.

### 3.4 Idempotency & Exact-Once Execution
Every mutating API request requires an `x-idempotency-key` header:
- Computes SHA-256 hash of canonicalized JSON request payload.
- Acquires an atomic lock in the repository.
- Replays cached HTTP status code and response payload if the same key is submitted with identical payload.
- Rejects conflicting requests with `409 Conflict`.

### 3.5 Automated Reconciliation
The reconciliation service periodically compares active Canton contracts against local PostgreSQL projections:
- Discrepancy detection: `MISSING_ON_LEDGER`, `MISSING_IN_DB`, `STATE_MISMATCH`, `AMOUNT_MISMATCH`.
- Provides central clearing operators with real-time audit verification.
