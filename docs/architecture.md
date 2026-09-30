# ObligaX Enterprise System Architecture & Truthfulness Specification

## 1. Executive Summary

**ObligaX** is an institutional-grade, privacy-preserving distributed obligation management, bilateral netting, settlement, and governance platform built on **DAML / Canton Distributed Ledger**, **PostgreSQL**, **Apache Kafka / Redpanda**, and a high-throughput **TypeScript / Node.js** enterprise tier.

The platform provides financial institutions (central clearing counterparties, commercial banks, prime brokers, asset managers) with mathematical and cryptographic certainty for contractual liabilities while maintaining Canton sub-transaction privacy between participants.

---

## 2. Implementation Truthfulness Table

In accordance with strict enterprise governance, every system capability is explicitly classified below:

| Capability / Subsystem | Status | Details & Verification Evidence |
| :--- | :---: | :--- |
| **Canton Ledger API v2 Adapter** | `TESTED` & `INTEGRATED` | Real HTTP/HTTPS/TLS client for `/v2/commands/submit-and-wait`, `/v2/state/active-contracts`, `/v2/state/contracts/:id`. Zero in-memory Maps or choice simulation. |
| **Canton Admin API Client** | `TESTED` & `INTEGRATED` | Party allocation, package upload, and vetted package topology management. |
| **Multi-Participant Topology & Privacy** | `TESTED` & `INTEGRATED` | Distinct participant nodes (Participant 1, 2, 3), cryptographic party namespaces (`BankA::1220...`), and stakeholder sub-transaction privacy enforcement verified by test suite. |
| **OIDC / JWKS Asymmetric Auth** | `TESTED` & `INTEGRATED` | JWKS key rotation, strict claim validation (`iss`, `aud`, `sub`, `exp`, `nbf`, `iat`), explicit rejection of `alg=none`. |
| **Enterprise Identity Mapping** | `TESTED` & `INTEGRATED` | Identity $\rightarrow$ Organization $\rightarrow$ Role $\rightarrow$ Canton Party mapping with anti-impersonation `validateActAs` checks. |
| **Defense-in-Depth Authorization** | `TESTED` & `INTEGRATED` | `AuthorizationService` enforcing DAML-aligned role capabilities before submission. |
| **Package Manifest & DAR Vetting** | `TESTED` & `INTEGRATED` | `package-manifest.json` recording DAR SHA-256 hash, vetting approval, dependencies, and compiler version. |
| **Deterministic Bilateral Netting** | `TESTED` & `INTEGRATED` | Canonical input sorting, currency precision, Banker's rounding, atomic zero-sum validation, and SHA-256 output hashes. Verified by `fast-check` property tests. |
| **Two-Way Complete Reconciliation** | `TESTED` & `INTEGRATED` | Compares Canton ACS $\leftrightarrow$ PostgreSQL $\leftrightarrow$ External Settlement Rail. Detects 11 distinct discrepancy types with immutable audit runs. |
| **Transactional Outbox & Kafka** | `TESTED` & `INTEGRATED` | Database outbox table with background relay to Kafka / Redpanda partitioned by tenant/party. |
| **Canton Event Stream & Projection Worker** | `TESTED` & `INTEGRATED` | Consumes `/v2/updates` stream with resumable `ledger_offset` checkpoints to update PostgreSQL read models. |
| **External Settlement Rails & Gateway** | `TESTED` & `INTEGRATED` | Concrete rails (`RTGS`, `BankPayment`, `TokenizedDeposit`, `Stablecoin`, `SecuritiesSettlement`) with HMAC-SHA256 signatures and async webhook callbacks. |
| **Anti-Replay Nonce Engine** | `TESTED` & `INTEGRATED` | Header validation (`X-Nonce`, `X-Timestamp`) with sliding freshness window and duplicate rejection. |
| **Cryptographic Chained Audit Trail** | `TESTED` & `INTEGRATED` | SHA-256 chained hash ($H_n = \text{SHA256}(\dots \parallel H_{n-1})$) using RFC 8785 canonical JSON serializer. Verified by `fast-check`. |
| **Dynamic Secrets Rotation & KMS** | `TESTED` & `INTEGRATED` | Multi-provider KMS (`LocalKmsProvider` with HKDF/AES-256-GCM rotation, `AwsKmsProvider`, `VaultKmsProvider`). |
| **Observability (Prometheus & OpenTelemetry)** | `TESTED` & `INTEGRATED` | Prometheus metrics endpoint (`/metrics`), latency histograms, error rates, and OpenTelemetry trace propagation with Canton correlation. |
| **Docker Compose Multi-Node Topology** | `TESTED` & `INTEGRATED` | Full multi-participant topology (Participant A, B, C, Synchronizer, Postgres, Redis, Redpanda, API, Worker, Gateway, Prometheus, Grafana, Jaeger). |
| **Kubernetes Production Deployment** | `TESTED` & `INTEGRATED` | Non-root containers, read-only root FS, HPA, NetworkPolicies, and zero-downtime rolling update specifications in `deploy/k8s/`. |
| **Cross-Synchronizer Global Settlement** | `DESIGNED` / `PLANNED` | Inter-synchronizer routing across federated Canton sub-networks. |

---

## 3. High-Level Enterprise Architecture

```
                             OIDC / Enterprise IdP
                                       │
                                       ▼ (Signed JWT with kid)
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ObligaX API Gateway Tier                           │
│  - Anti-Replay Nonce Verification (X-Nonce, X-Timestamp)                    │
│  - Tiered Rate Limiting (tenant:party:operation:ip)                         │
│  - OIDC / JWKS Claim Validation (iss, aud, sub, exp, nbf, iat)              │
│  - Identity Mapping (Enterprise Identity -> Organization -> Role -> Party)   │
│  - Defense-in-Depth Authorization Boundary                                  │
│  - Exact-Once Distributed Idempotency (Composite tenant:key:endpoint)       │
└───────────────────────┬─────────────────────────────┬───────────────────────┘
                        │                             │
       Authoritative    │                             │  Read-Model / Outbox
       Command Dispatch │                             │  Relational Storage
                        ▼                             ▼
┌─────────────────────────────────┐         ┌─────────────────────────────────┐
│      Canton Ledger Client       │         │        PostgreSQL 15+           │
│  - Command Builder (ATTEMPT-01) │         │  - Relational Projections (CQRS)│
│  - Exponential Backoff & Jitter │         │  - Transactional Outbox Table   │
│  - mTLS / TLS Security          │         │  - Idempotency State Store      │
│  - Strict Error Normalization   │         │  - Chained Audit Log Archive    │
└───────────────┬─────────────────┘         └────────────────┬────────────────┘
                │                                            ▲
                ▼ (gRPC / JSON API v2)                       │  Projection
┌─────────────────────────────────┐                          │  Worker
│    Canton Participant Node      │                          │
│  - Local Private Contract Store │                          │
│  - Sub-Transaction Privacy      │──────────────────────────┘
│  - Multi-Party Signatures       │   (Resumable Transaction Stream
│  - Admin API (Party & Package)  │    via Ledger Offsets)
└───────────────┬─────────────────┘
                │
                ▼ (Synchronizer Protocol)
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Canton Network Synchronizer                          │
│     - Sequencer Node (Ordering & Timestamping)                              │
│     - Mediator Node (Bilateral Confirmation & Commit)                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Key Subsystem Specifications

### 4.1 Authoritative State vs. Relational Read Projection (CQRS)
Canton is strictly authoritative. No business data is committed to PostgreSQL prior to confirmation on the Canton ledger. Upon transaction confirmation on Canton, the **Canton Event Stream Consumer** receives transaction events and updates PostgreSQL read projections with persistent `ledger_offset` checkpoints.

### 4.2 Deterministic Netting Engine
The netting engine takes an arbitrary set of confirmed bilateral obligations and processes them under mathematical constraints:
- Input sorting: Canonical alphanumeric sort by `obligationId` ascending.
- Arithmetic: Arbitrary-precision decimal arithmetic using Banker's rounding (`ROUND_HALF_EVEN`).
- Directionality: Net balance direction determined by gross balance comparison; net zero balance is rejected.
- Cryptographic seal: Canonical JSON payload hashed via SHA-256 to provide non-repudiable netting terms.

### 4.3 External Banking Rails & Async Webhook Architecture
Direct settlement does not assume synchronous cash movement. When a settlement instruction is initiated:
1. Obligation transitions to `SettlementPending`.
2. Settlement Instruction is dispatched to the external rail (`RTGS`, `Fedwire`, `TokenizedDeposit`, `Stablecoin`, `SecuritiesSettlement`) with HMAC-SHA256 signature.
3. The rail processes the transfer asynchronously and notifies ObligaX via `/api/v1/settlements/callback`.
4. If payment completes: `CompleteSettlement` choice is exercised on Canton, transitioning obligation to `Settled`.
5. If payment fails: `FailSettlement` choice is exercised on Canton, which safely reopens the obligation to `Confirmed` status.
