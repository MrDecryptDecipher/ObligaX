# ObligaX

> **Enterprise-Grade Privacy-Preserving Obligation, Bilateral Netting & Settlement Platform**  
> Built with **DAML / Canton**, **TypeScript / Node.js**, and **PostgreSQL**.

---

## 1. Overview

**ObligaX** is an institutional-grade distributed financial infrastructure platform designed for wholesale interbank obligations, bilateral netting, automated settlement execution, and governance.

By leveraging **DAML** and the **Canton Distributed Ledger**, ObligaX enforces strict cryptographic multi-party authorization and sub-transaction privacy boundaries. Cross-institutional bilateral liabilities remain completely private between the participating counterparties and designated regulators, eliminating counterparty leakage while guaranteeing mathematical and contractual non-repudiation.

---

## 2. Core Architectural Principles

```
                  +----------------------------------------------+
                  |           INSTITUTIONAL FRONTEND             |
                  |     Clearing & Settlement Operations (SPA)   |
                  +----------------------+-----------------------+
                                         |
                                         v
                  +----------------------------------------------+
                  |             REST API GATEWAY                 |
                  |   Auth / Rate Limiting / Idempotency / Zod   |
                  +----------------------+-----------------------+
                                         |
                        +----------------+---------------+
                        |                                |
                        v                                v
         +-----------------------------+  +-----------------------------+
         |    POSTGRESQL PROJECTION    |  |     CANTON DISTRIBUTED      |
         |         READ MODEL          |  |           LEDGER            |
         |                             |  |                             |
         |  - Operational Read Cache   |  |  * Authoritative Contract   |
         |  - Idempotency Hash Locks   |  |    & Economic State Truth   |
         |  - Chained Audit Logs       |  |  * Multi-Party Signatures   |
         |  - Reconciliation Analytics |  |  * Sub-Transaction Privacy  |
         +-----------------------------+  +--------------+--------------+
                                                         |
                                                         v
                                          +-----------------------------+
                                          |   EXTERNAL SETTLEMENT RAILS |
                                          |   (Fedwire / SWIFT / RTGS)  |
                                          +-----------------------------+
```

1. **Canton/DAML is the Authoritative Source of Truth**:
   The backend, database, and frontend are never authoritative for economic or contractual state. All lifecycle transitions, netting operations, and settlement completions are executed as atomic UTXO smart contracts on Canton.
2. **PostgreSQL as an Operational Read Model**:
   Fast query projections, idempotency locks, cryptographically chained audit events, and settlement reconciliation data are managed in PostgreSQL.
3. **Strict Separation of Netting and Settlement**:
   `NettingPending` $\rightarrow$ `Netted` (bilateral compression) is architecturally and economically distinct from `SettlementPending` $\rightarrow$ `Settled` (cash disbursement).
4. **Arbitrary Precision Safe Decimal Arithmetic**:
   Eliminates all IEEE-754 binary floating-point rounding errors by using `SafeDecimal` (`decimal.js`) with 28 decimal places of precision, round-half-even banking rules, and strict zero-sum conservation checks.

---

## 3. Obligation Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> Proposed: Propose (Creditor or Debtor)
    Proposed --> Accepted: Accept (Counterparty)
    Accepted --> Confirmed: Confirm (Creator)
    
    Confirmed --> SettlementPending: InitiateSettlement (Creditor)
    SettlementPending --> Settled: CompleteSettlement (Dual Auth / Rail Callback)
    SettlementPending --> Confirmed: FailSettlement (External Failure Retry)
    
    Confirmed --> NettingPending: MarkNettingPending (Dual Auth)
    NettingPending --> Netted: FinalizeNetting (Atomic Archive)
    NettingPending --> Confirmed: ReopenObligation (Netting Rejection)
    
    Confirmed --> AmendmentPending: ProposeAmendment (Either Party)
    AmendmentPending --> Confirmed: Accept / Reject Amendment
    
    Confirmed --> Disputed: RaiseDispute (Either Party)
    Disputed --> Confirmed: ResolveDispute (Agreed Settlement)
    
    Proposed --> Cancelled: Cancel (Creator)
    Settled --> [*]
    Netted --> [*]
    Cancelled --> [*]
```

---

## 4. Key Subsystems & Features

### 4.1. Bilateral Netting Engine
- **Two-Phase Commit Protocol**: `NettingProposal` $\rightarrow$ `AcceptedNettingProposal` $\rightarrow$ `NettingSettlement`.
- **Atomic Execution (No Partial Netting)**: Either all obligations in the bilateral package are atomically consumed and netted, or the entire transaction aborts with zero side effects.
- **Directional Netting**: Automatically resolves net payable/receivable direction (`InitiatorPays` vs `CounterpartyPays`) and rejects zero-sum cancels.

### 4.2. Direct Settlement & Resilient Retry
- Dispatches `SettlementInstruction` to external payment rails (Fedwire, CHIPS, RTGS, SWIFT).
- Supports external rail failure handling: failed settlements safely return the obligation to `Confirmed` status with an incremented `retryCount` rather than becoming stuck in an indeterminate state.

### 4.3. Distributed Idempotency Engine
- Protects all mutating endpoints with SHA-256 fingerprint validation `(Method + URL + Body)`.
- Concurrent in-flight requests return `409 Conflict`.
- Identical completed requests replay the original response payload from the idempotency cache.
- Mismatched payloads using the same idempotency key are rejected.

### 4.4. Tamper-Evident Chained Audit Logging

Every state transition produces a cryptographically hashed audit entry:

$$
\text{Hash}_n = \text{SHA-256}(\text{Hash}_{n-1} + \text{Timestamp} + \text{EventType} + \text{Actor} + \text{Payload})
$$

Provides mathematical non-repudiation for regulatory audits and compliance verification.

### 4.5. Settlement Reconciliation & Drift Detection
- Compares active Canton ledger contracts against PostgreSQL read projections and external rail settlement logs.
- Detects state drift, balance mismatches, and orphan instructions with automated operational circuit breakers.

---

## 5. Repository Structure

```
ObligaX/
├── daml/                           # DAML Smart Contracts (Canton Ledger Tier)
│   ├── Obligation/
│   │   ├── Types.daml              # Shared domain types, statuses & metadata
│   │   ├── Contract.daml           # Authoritative Obligation template & invariants
│   │   ├── Workflow.daml           # Amendment, dispute & proposal workflows
│   │   └── Netting.daml            # Bilateral netting proposals & atomic settlements
│   ├── Settlement/
│   │   └── Settlement.daml         # Settlement instructions, failure & retries
│   ├── Governance/
│   │   ├── Participant.daml        # Institutional identity & clearing status
│   │   └── Policy.daml             # Risk limits, netting caps & currency rules
│   ├── Main.daml                   # Package exports
│   └── Test.daml                   # Formal verification test scripts
├── backend/                        # TypeScript / Node.js Engine
│   └── src/
│       ├── api/                    # Express REST API, controllers & routes
│       │   ├── controllers/        # Obligation, netting, settlement controllers
│       │   ├── middleware/         # Auth, validation, idempotency, rate-limit, error
│       │   └── routes/             # Versioned API routes (/api/v1)
│       ├── application/            # Application services (orchestration)
│       │   ├── obligations/        # Obligation, amendment, dispute services
│       │   ├── netting/            # Netting orchestration service
│       │   └── settlement/         # Settlement & reconciliation services
│       ├── domain/                 # Domain logic & mathematical rules
│       │   ├── obligation/         # Obligation state machine & domain rules
│       │   ├── netting/            # Netting calculator & invariants
│       │   ├── settlement/         # Settlement domain rules
│       │   ├── governance/         # Participant & policy domain rules
│       │   └── utils/              # SafeDecimal arbitrary precision math
│       ├── infrastructure/         # External integrations & adapters
│       │   ├── canton/             # Canton gRPC client, queries, retry policy
│       │   ├── database/           # Prisma database client & repositories
│       │   ├── security/           # Token verification & KMS integration
│       │   ├── settlement/         # External rail client & reconciliation service
│       │   └── observability/      # Chained audit logger & metrics collector
│       └── schemas/                # Zod request validation schemas
├── frontend/                       # Operations & Clearing Console (Vanilla JS SPA)
│   ├── index.html                  # Dashboard, Netting Workbench & Settlement Monitor
│   ├── styles.css                  # Institutional dark-mode design system
│   └── app.js                      # Client application logic & mock API integration
├── prisma/                         # Database schema & migrations
│   └── schema.prisma               # PostgreSQL models & relational mapping
├── docs/                           # Architecture & Security Documentation
│   ├── architecture.md             # Complete system architecture specification
│   ├── domain-model.md             # Formal domain models & entity relationships
│   └── threat-model.md             # Institutional STRIDE threat analysis & mitigations
├── tests/                          # Test suites
│   ├── unit/                       # Unit tests (state machine, netting, decimal, idempotency)
│   ├── integration/                # Integration tests (reconciliation, ledger queries)
│   └── e2e/                        # End-to-end API tests (obligation, netting, settlement)
├── daml.yaml                       # DAML project manifest
├── package.json                    # Node.js project manifest & dependencies
└── tsconfig.json                   # TypeScript strict compiler configuration
```

---

## 6. Getting Started & Verification Runbook

### Prerequisites
- **Node.js**: v20+ LTS
- **Java**: OpenJDK 17 LTS
- **DAML SDK**: v2.10.x+
- **PostgreSQL**: v14+ (or compatible cloud instance)

### 1. Build and Test DAML Smart Contracts
```powershell
# Set environment variables if needed
daml build
daml test
```
*Output: 16 templates compiled to `.daml/dist/obligax-0.1.0.dar`, 8/8 formal test scripts passed.*

### 2. Install Dependencies & Generate Database Client
```powershell
npm install
npx prisma generate
```

### 3. Build Backend TypeScript
```powershell
npm run build
```
*Compiles cleanly with 0 errors to `dist/`.*

### 4. Execute Full Verification Test Suite
```powershell
npm test
```
*Runs all 8 test suites (31 unit, integration, and E2E tests) with 100% pass rate.*

### 5. Launch the Platform
```powershell
# Start backend server
npm start

# Access Operations Console
# Open frontend/index.html in your browser or serve via any static HTTP server.
```

---

## 7. Security & Compliance

ObligaX is designed to comply with institutional security standards:
- **Confidentiality**: Protected by Canton sub-transaction privacy; non-stakeholders never observe bilateral obligations.
- **Integrity**: Enforced via multi-party cryptographic signatures on DAML contracts and SHA-256 audit chaining.
- **Availability**: Sliding-window rate limiting, distributed locking, and resilient circuit breakers prevent resource exhaustion.
- **Auditability**: Complete non-repudiation with immutable ledger history and cryptographically verified event logs.

For detailed analysis, refer to [docs/threat-model.md](docs/threat-model.md).

---

## 8. License

Copyright (c) 2026 ObligaX Contributors. Institutional Proprietary & Confidential.
