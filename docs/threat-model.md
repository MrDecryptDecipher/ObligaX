# ObligaX Institutional Threat Model & Security Architecture

## 1. Executive Summary & Scope

ObligaX is an institutional distributed obligation lifecycle, bilateral netting, and settlement platform. Because ObligaX orchestrates wholesale interbank liabilities and high-value clearing workflows, security, cryptographic non-repudiation, strict privacy preservation, and fault isolation are paramount.

This threat model documents the security boundaries, STRIDE threat classifications, attack surfaces, and defensive countermeasures across all tiers of the ObligaX architecture:
1. **DAML/Canton Distributed Ledger Tier** (Authoritative Contractual & Economic State)
2. **Backend Application & Orchestration Tier** (Node.js/TypeScript REST API & Workflow Services)
3. **Database Projection Tier** (PostgreSQL Read Model, Idempotency Store & Audit Trail)
4. **Institutional Gateway & Transport Tier** (mTLS, JWT, RBAC & Rate Limiting)
5. **External Settlement Rails Integration** (Real-Time Gross Settlement / RTGS, Fedwire, SWIFT)

---

## 2. System Architecture & Trust Boundaries

```
+-----------------------------------------------------------------------------------------+
|                                INSTITUTIONAL BOUNDARY (BANK A)                          |
|  +--------------------+                                                                 |
|  | Bank A Client / UI |                                                                 |
|  +---------+----------+                                                                 |
+------------|----------------------------------------------------------------------------+
             | TLS 1.3 + mTLS + JWT Bearer
             v
+=========================================================================================+
| TRUST BOUNDARY 1: API Gateway & Security Perimeter                                      |
|  - Token Verification (RS256/ES256)                                                     |
|  - Institutional Identity Mapping (Claims -> Canton Party ID)                           |
|  - Rate Limiting (Token Bucket per IP/Participant)                                      |
|  - Strict Request Body Validation (Zod Schemas)                                         |
|  - Idempotency Key Lock & Fingerprint Verification                                      |
+=========================================================================================+
             |
             v
+-----------------------------------------------------------------------------------------+
| TRUST BOUNDARY 2: ObligaX Backend Application Core                                      |
|  - ObligationStateMachine / Domain Invariants                                            |
|  - NettingCalculator (Deterministic SafeDecimal Arithmetic)                             |
|  - Audit Logging (HMAC/SHA-256 Tamper-Evident Chaining)                                 |
+------------+-----------------------------------+----------------------------------------+
             |                                   |
             | Canton Ledger API (gRPC/mTLS)      | SQL (Prepared Statements / Prisma)
             v                                   v
+================================+ +======================================================+
| TRUST BOUNDARY 3: Canton/DAML  | | TRUST BOUNDARY 4: Operational Data Store (PostgreSQL)|
| - Sub-transaction privacy      | | - Projections only (NOT source of truth)             |
| - Multi-party cryptographic    | | - Idempotency records & response cache               |
|   authorization                | | - Audit event ledger                                 |
| - Immutable UTXO contract model| | - Reconciliation & anomaly logs                      |
+================================+ +======================================================+
             ^
             |
+=========================================================================================+
| TRUST BOUNDARY 5: External Settlement Rails (Fedwire / SWIFT / RTGS)                    |
|  - Asynchronous Settlement Execution                                                    |
|  - Webhook Signature Verification (HMAC-SHA256)                                         |
|  - Idempotent Reconciliation Engine with Replay Detection                               |
+=========================================================================================+
```

---

## 3. STRIDE Threat Analysis & Countermeasures

### 3.1. Spoofing (Identity & Authenticity)

| Threat ID | Threat Description | Attack Vector | Impact | Mitigations & Countermeasures |
| :--- | :--- | :--- | :--- | :--- |
| **S-01** | **Participant Impersonation at API Layer** | Attacker crafts API requests pretending to be Bank B to accept obligations or propose bogus settlements. | High | **mTLS + JWT Claims Enforcement**: API Gateway validates institutional mTLS client certificates. JWT tokens signed with institutional asymmetric keys (RS256) are validated; `TokenVerifier` enforces that `sub` or `institutionId` matches the authenticated party. |
| **S-02** | **Canton Party Impersonation** | Compromised backend worker tries to sign ledger commands on behalf of an unassigned participant. | Critical | **Canton Cryptographic Party Delegation**: Every DAML command submitted to Canton requires explicit participant node authorization and cryptographic signatures. Participant nodes only sign for parties allocated to their specific Canton domain namespace. |
| **S-03** | **Settlement Rail Callback Spoofing** | Attacker sends fake `SETTLED` HTTP webhook callbacks pretending to be an external settlement rail. | Critical | **Webhook HMAC-SHA256 Signatures**: Rail webhooks require shared-secret HMAC signatures in HTTP headers (`X-Signature-SHA256`). Reconciled against known pending instruction IDs before state transition. |

---

### 3.2. Tampering (Data Integrity)

| Threat ID | Threat Description | Attack Vector | Impact | Mitigations & Countermeasures |
| :--- | :--- | :--- | :--- | :--- |
| **T-01** | **Obligation Value Tampering in Transit** | Man-in-the-middle or malicious proxy modifies monetary amounts or currency codes. | Critical | **TLS 1.3 Mandatory Encryption + Ledger Invariants**: End-to-end encryption. In DAML, amounts must be positive, currencies validated against ISO-4217, and signatures from both parties are verified before confirmation. |
| **T-02** | **PostgreSQL Projection Tampering** | Attacker with read/write database access modifies `amount` or `status` in the PostgreSQL database. | Medium | **Canton Authoritative Source of Truth**: The database is strictly a read projection. The backend state machine rejects any operation whose contract ID or version does not match the active, unconsumed contract on Canton. Any drift is flagged immediately by the `SettlementReconciliationService`. |
| **T-03** | **Floating Point Drift in Netting Calculations** | Exploiting IEEE 754 floating point arithmetic precision errors to siphon fractional amounts during netting. | High | **Arbitrary Precision SafeDecimal**: All financial calculations use `decimal.js` with 28 decimal places of precision, round-half-even banking rounding, and zero-sum conservation invariants ($\sum grossPayable - \sum grossReceivable = Net$). |
| **T-04** | **Replay Attacks via Idempotency Tampering** | Replaying creation or settlement requests with altered parameters under the same idempotency key. | High | **Request Fingerprint Hash Validation**: `IdempotencyRepository` calculates a SHA-256 fingerprint over `HTTP Method + Path + JSON Payload`. If an incoming request reuses an idempotency key with a mismatched payload, the server returns `409 Conflict`. |

---

### 3.3. Repudiation (Accountability & Auditability)

| Threat ID | Threat Description | Attack Vector | Impact | Mitigations & Countermeasures |
| :--- | :--- | :--- | :--- | :--- |
| **R-01** | **Repudiation of Obligation Inception** | Debtor claims they never agreed to an obligation created by the creditor. | High | **Bilateral State Machine (Propose-Accept-Confirm)**: An obligation proposed by a creditor cannot reach `Confirmed` status without an explicit cryptographic exercise of `Accept` signed by the debtor, followed by `Confirm` signed by the creditor. Both parties are signatories on the final contract. |
| **R-02** | **Repudiation of Netting Execution** | Participant claims netting agreement was executed without its explicit consent. | Critical | **Atomic Dual-Party Netting Proposal**: DAML `NettingProposal` requires counterparty acceptance. The resulting `NettingSettlement` contract requires multi-party authorization, atomically archiving the underlying obligations. |
| **R-03** | **Audit Trail Truncation or Deletion** | Malicious administrator deletes or alters audit logs to cover unauthorized actions. | High | **Cryptographically Chained Audit Events**: Every `AuditEvent` in PostgreSQL includes a SHA-256 hash computed over the previous event's hash, timestamp, actor, and payload, forming an immutable hash chain. |

---

### 3.4. Information Disclosure (Confidentiality & Privacy)

| Threat ID | Threat Description | Attack Vector | Impact | Mitigations & Countermeasures |
| :--- | :--- | :--- | :--- | :--- |
| **I-01** | **Cross-Institution Obligation Leakage** | Bank C inspects bilateral transactions between Bank A and Bank B. | Critical | **Canton Sub-Transaction Privacy**: Unlike public blockchains or transparent shared ledgers, Canton ledger synchronization strictly restricts transaction views to contract stakeholders (signatories and observers). Bank C's node never receives sub-transactions or contracts to which it is not a party. |
| **I-02** | **PII and Financial Data Leakage in Logs** | Sensitive financial metadata, account numbers, or counterparty identities dumped into log files. | Medium | **Structured Log Sanitization**: Winston logger filters and masks sensitive financial parameters, API keys, JWT tokens, and account numbers prior to emitting log records. |
| **I-03** | **Timing and Traffic Analysis on Sequencer** | Eavesdropper monitors Canton sequencer traffic patterns to infer trading or netting volumes. | Medium | **Canton Envelope Encryption**: Sequencer payloads are encrypted end-to-end with the recipient participant's public key; metadata visible to sequencers is minimized. |

---

### 3.5. Denial of Service (Availability & Resilience)

| Threat ID | Threat Description | Attack Vector | Impact | Mitigations & Countermeasures |
| :--- | :--- | :--- | :--- | :--- |
| **D-01** | **API Flooding & Resource Exhaustion** | Rapid burst of API calls overwhelms the Node.js backend. | Medium | **Distributed Rate Limiting**: `rate-limit.middleware.ts` enforces configurable sliding window request limits per participant ID and IP address, returning `429 Too Many Requests`. |
| **D-02** | **Large Netting Package Computational Exhaustion** | Submitting a netting package with tens of thousands of obligations to cause CPU starvation. | Medium | **Batch Size Thresholds & Complexity Caps**: Netting engine enforces maximum obligation limits per bilateral package (e.g., 500 items) and enforces maximum execution timeouts. |
| **D-03** | **Canton Contention & Double-Spend DoS** | Submitting concurrent conflicting settlement transactions on the same active contract ID. | Medium | **UTXO Concurrency Controls & Retry Policy**: In DAML, contract consumption is atomic. If two requests attempt to consume the same contract, one commits and the second fails with a contention error. The backend catches this via `CantonRetryPolicy` and either re-reads the latest projection or rejects the stale request. |

---

### 3.6. Elevation of Privilege (Authorization & Access Control)

| Threat ID | Threat Description | Attack Vector | Impact | Mitigations & Countermeasures |
| :--- | :--- | :--- | :--- | :--- |
| **E-01** | **Horizontal Privilege Escalation** | Bank A requests `/api/v1/obligations/:id` where the obligation belongs exclusively to Bank B and Bank C. | High | **Domain Authorization Filter**: Application controllers enforce that the authenticated participant (`req.user.institutionId`) must match either `creditor` or `debtor` on the obligation projection. Non-stakeholder requests return `404 Not Found` (to prevent enumeration). |
| **E-02** | **Operator Privilege Escalation** | Regular participant attempts to invoke `/api/v1/reconciliation/run` or `/api/v1/policy` administrative functions. | High | **Role-Based Access Control (RBAC)**: Dedicated policies ensure only tokens bearing the `Role: Operator` or `Role: Regulator` claim can access administrative and governance routes. |
| **E-03** | **Direct Contract Transition Bypass** | Attacker invokes settlement completion without going through `SettlementPending`. | Critical | **DAML Strict Transition Guards**: Smart contract choices enforce preconditions. `CompleteSettlement` can only be exercised on a contract in `SettlementPending` status with valid settlement reference IDs. |

---

## 4. Cryptographic Controls & Key Management

### 4.1. Key Hierarchy & Algorithms
1. **Transport Layer**: TLS 1.3 with forward secrecy (ECDHE-RSA-AES256-GCM-SHA384 or ECDHE-ECDSA-AES256-GCM-SHA384).
2. **Identity & Authentication**: Asymmetric RS256/ES256 keys for institutional JWT signing; keys rotated quarterly.
3. **Canton Participant Signatures**: ED25519 / Secp256k1 curves managed inside Hardware Security Modules (HSMs) or AWS/GCP KMS.
4. **Audit Log Chaining**: SHA-256 cryptographic digests with HMAC-SHA256 signatures per log block.

### 4.2. Sensitive Parameter Storage
- Passwords and secret keys are never committed to version control.
- Configuration injected via environment variables (`.env`) with validation against `config.ts`.
- KMS envelope encryption used for institutional private keys.

---

## 5. Settlement Rail Fault Modes & Circuit Breakers

1. **Failure Isolation**: An external rail outage (e.g., Fedwire downtime) halts settlement processing without corrupting ledger state. Obligations remain in `SettlementPending` until timeout or failure is signaled.
2. **Settlement Retry Protocol**: If a settlement fails externally, the contract transitions to `Confirmed` status via `FailSettlement` with an incremented retry counter. It is never left in an unrecoverable indeterminate state.
3. **Reconciliation Drift Alarms**: `SettlementReconciliationService` continuously compares Canton settled states, database projections, and external rail confirmation logs. If any discrepancy exceeds threshold $\tau = 0$, automated circuit breakers suspend automated settlement pipelines and alert operations.

---

## 6. Security Verification & Continuous Assurance

- **Static Code Analysis**: TypeScript strict mode (`noImplicitAny`, `strictNullChecks`, `exactOptionalPropertyTypes`).
- **DAML Formal Verification**: Contract state invariants and multi-party authorization properties verified via Daml Script tests (`daml test`).
- **Automated Security Tests**: Unit, integration, and E2E regression tests cover:
  - Unauthorized access rejection (401/403)
  - Duplicate idempotency key collision rejection (409)
  - Invalid state transition rejection (400)
  - Non-stakeholder data isolation
