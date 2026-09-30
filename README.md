# ObligaX

**Institutional Clearing, Bilateral Netting & Settlement Operations Platform**

Built on Canton/DAML 2.10 · PostgreSQL 16 · Express/TypeScript · Native ES Modules

---

[![Tests](https://img.shields.io/badge/Tests-54%20Passed-22c55e?style=flat-square&logo=jest)](https://github.com/MrDecryptDecipher/ObligaX)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![DAML](https://img.shields.io/badge/DAML-2.10-6366f1?style=flat-square)](https://docs.daml.com/)
[![Canton](https://img.shields.io/badge/Canton-2.10-0ea5e9?style=flat-square)](https://docs.daml.com/canton/)
[![License](https://img.shields.io/badge/License-Apache_2.0-f59e0b?style=flat-square)](LICENSE)

---

## What Is ObligaX?

ObligaX is an **institutional financial operations platform** designed for clearing houses, bilateral netting agents, treasury operations, and settlement infrastructure teams. It is **not** a generic admin dashboard, analytics tool, or portfolio project.

ObligaX manages the complete lifecycle of bilateral financial obligations — from initial proposal through acceptance, confirmation, multilateral netting compression, payment rail settlement, cryptographic audit chaining, and real-time ACS reconciliation — all enforced on-ledger by DAML smart contracts running on the Canton distributed ledger.

### Core Domain

| Domain | Responsibility |
|--------|----------------|
| **Obligation Management** | Propose, accept, confirm, amend, and dispute bilateral payment obligations |
| **Bilateral Netting** | Atomically compress multilateral confirmed obligations into single net instructions |
| **Settlement Gateway** | Dispatch net settlement instructions to external payment rails (RTGS, dvP adapters) |
| **ACS Reconciliation** | Two-way integrity verification between Canton Active Contract Set and PostgreSQL projections |
| **Cryptographic Audit** | SHA-256 hash-chained immutable audit ledger with mathematical chain verification |
| **Governance** | Policy-as-code enforcement for exposure limits, netting rules, and participant authorizations |

---

## Architecture

### System Overview

```mermaid
graph TB
    subgraph UI["ObligaX Console (Browser)"]
        direction LR
        Shell["App Shell<br/>Header · Sidebar · Drawer · ⌘K"]
        Views["11 Operational Views"]
        Store["Reactive State Store"]
        Shell --> Views
        Views <--> Store
    end

    subgraph API["Express / TypeScript API"]
        direction TB
        Auth["JWT / OIDC Auth Middleware"]
        Router["Route Handlers"]
        AppLayer["Application Services"]
        Auth --> Router --> AppLayer
    end

    subgraph Ledger["Canton Distributed Ledger"]
        direction TB
        CantonNode["Canton Participant Node"]
        DAML["DAML 2.10 Smart Contracts"]
        ACS["Active Contract Set (ACS)"]
        CantonNode --> DAML --> ACS
    end

    subgraph Data["Data Layer"]
        direction LR
        PG["PostgreSQL 16<br/>Read Projections"]
        Kafka["Kafka / Outbox<br/>Event Publisher"]
        AuditDB["Audit Chain Store"]
    end

    UI <-->|"REST / JSON"| API
    API <-->|"Ledger API v2"| Ledger
    Ledger -->|"Projection Worker"| PG
    AppLayer -->|"Domain Events"| Kafka
    AppLayer -->|"SHA-256 Hash Chain"| AuditDB
    AppLayer <-->|"Read Queries"| PG
```

### Obligation Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Proposed : proposeObligation()

    Proposed --> Accepted : acceptObligation()\n[Counterparty]
    Proposed --> Cancelled : cancel()\n[Any Party]

    Accepted --> Confirmed : confirmObligation()\n[Both Parties]
    Accepted --> Cancelled : cancel()\n[Any Party]

    Confirmed --> NettingPending : proposeNetting()\n[Initiator]
    Confirmed --> SettlementPending : initiateSettlement()\n[Debtor]
    Confirmed --> AmendmentPending : proposeAmendment()\n[Any Party]
    Confirmed --> Disputed : raiseDispute()\n[Any Party]

    AmendmentPending --> Confirmed : acceptAmendment()\n[Counterparty]
    Disputed --> Confirmed : resolveDispute()\n[Network Operator]

    NettingPending --> Netted : executeNetting()\n[Canton Atomic]
    SettlementPending --> Settled : completeSettlement()\n[Rail Adapter]

    Netted --> [*]
    Settled --> [*]
    Cancelled --> [*]
```

### Netting & Settlement Flow

```mermaid
sequenceDiagram
    autonumber
    participant BankA
    participant ObligaX as ObligaX API
    participant DAML as Canton / DAML
    participant BankB
    participant Rail as Payment Rail

    BankA->>ObligaX: POST /netting/proposals<br/>{obligationIds[], currency}
    ObligaX->>DAML: createNettingProposal(lines)
    DAML-->>ObligaX: proposalContractId
    ObligaX-->>BankA: 201 {proposalId, netAmount}

    BankB->>ObligaX: POST /netting/proposals/:id/accept
    ObligaX->>DAML: acceptProposal(contractId)
    DAML-->>ObligaX: accepted

    BankA->>ObligaX: POST /netting/proposals/:id/execute
    ObligaX->>DAML: validateAndConsumeLines()
    Note over DAML: Atomic: all obligations<br/>consumed in one transaction
    DAML-->>ObligaX: netSettlementContractId

    ObligaX->>Rail: dispatch(netAmount, currency)
    Rail-->>ObligaX: POST /settlements/callback {HMAC-SHA256}
    ObligaX->>DAML: completeSettlement()
    DAML-->>BankA: ObligationStatus → Netted
    DAML-->>BankB: ObligationStatus → Netted
```

### ACS Reconciliation

```mermaid
flowchart LR
    subgraph Canton["Canton Active Contract Set"]
        ACS["Active Contracts\n(Source of Truth)"]
    end

    subgraph Worker["Projection Worker"]
        Scanner["ACS Scanner\n(Ledger API v2)"]
        Differ["Two-Way Differ"]
    end

    subgraph DB["PostgreSQL Read Model"]
        Proj["obligations table\nsettlements table\nnetting_proposals table"]
    end

    subgraph Report["Reconciliation Report"]
        Balanced["✓ BALANCED\nAll contracts match"]
        Discrepancy["⚠ DISCREPANCY\nState · Amount · Party mismatch"]
    end

    ACS --> Scanner
    Proj --> Differ
    Scanner --> Differ
    Differ --> Balanced
    Differ --> Discrepancy
```

### Cryptographic Audit Chain

```mermaid
flowchart LR
    G["Genesis\nHash: 0000"]
    A["Entry #1\nEvent: OBLIGATION_PROPOSED\nHash: SHA256(prev + type + payload)"]
    B["Entry #2\nEvent: OBLIGATION_ACCEPTED\nHash: SHA256(prev + type + payload)"]
    C["Entry #3\nEvent: NETTING_EXECUTED\nHash: SHA256(prev + type + payload)"]
    T["Tip\nLive chain head"]

    G -->|prevHash| A -->|prevHash| B -->|prevHash| C -->|...| T
    style T fill:#1d4ed8,color:#fff
    style G fill:#374151,color:#fff
```

---

## Domain Model

### Core Entities

```mermaid
erDiagram
    OBLIGATION {
        string obligationId PK
        string creditor
        string debtor
        decimal amount
        string currency
        date dueDate
        enum status
        string contractId
        string transactionId
        int version
        timestamp createdAt
    }

    NETTING_PROPOSAL {
        string proposalId PK
        string proposer
        string counterparty
        string currency
        decimal netAmount
        enum status
        string[] obligationIds
        string contractId
    }

    SETTLEMENT_INSTRUCTION {
        string settlementId PK
        string obligationId FK
        string creditor
        string debtor
        decimal amount
        string currency
        enum status
        string settlementRail
        string externalReference
        int retryCount
    }

    AUDIT_ENTRY {
        int sequenceNumber PK
        string eventType
        string actor
        string entityId
        string previousHash
        string currentHash
        json payload
        timestamp createdAt
    }

    RECONCILIATION_REPORT {
        string reportId PK
        bool isBalanced
        int ledgerCount
        int dbCount
        int matchedCount
        json discrepancies
        timestamp timestamp
    }

    OBLIGATION ||--o{ NETTING_PROPOSAL : "consumed by"
    OBLIGATION ||--o| SETTLEMENT_INSTRUCTION : "settled via"
    OBLIGATION ||--o{ AUDIT_ENTRY : "generates"
```

---

## Application Shell

ObligaX ships with an 11-screen institutional operations console built entirely in native ES modules — no bundler, no framework, no build step.

```mermaid
flowchart TD
    Shell["Application Shell\n(index.html + main.js)"]

    Shell --> Header["Top Bar\nEnvironment · Canton Sync · ⌘K · Participant"]
    Shell --> Sidebar["Navigation Sidebar\n11 Operational Views"]
    Shell --> Workspace["Main Workspace\nView Router"]
    Shell --> Drawer["Detail Inspector Drawer\nRight-side slide-over"]
    Shell --> Modal["Confirmation Modals\nFinancial action verification"]
    Shell --> Notifications["Toast Notifications\nNon-blocking alerts"]
    Shell --> CmdPalette["Command Palette ⌘K\nSearch · Jump · Actions"]

    Workspace --> OV["Overview\nNetwork status · KPI exposure"]
    Workspace --> OBL["Obligations\nHigh-density data grid"]
    Workspace --> NET["Netting Workbench\nBilateral compression engine"]
    Workspace --> SET["Settlement Queue\nRail dispatch · Exception ops"]
    Workspace --> REC["Reconciliation\nACS vs DB investigation"]
    Workspace --> ACT["Activity Feed\nEvent stream · Provenance"]
    Workspace --> NTW["Network Topology\nCanton participant nodes"]
    Workspace --> PAR["Participants\nInstitutional directory"]
    Workspace --> POL["Governance Policies\nClearing ruleset"]
    Workspace --> AUD["Audit Explorer\nSHA-256 hash chain"]
    Workspace --> HLT["System Health\nLive diagnostics"]
```

---

## Project Structure

```
ObligaX/
├── backend/                         # Express / TypeScript API server
│   ├── src/
│   │   ├── api/
│   │   │   ├── controllers/         # HTTP route handlers
│   │   │   ├── middleware/          # Auth, validation, rate-limit, CORS
│   │   │   └── routes/              # Express router definitions
│   │   ├── application/             # Domain application services
│   │   │   ├── governance/          # Participant registry, policy engine
│   │   │   ├── netting/             # Netting proposal lifecycle
│   │   │   ├── obligation/          # Obligation state machine
│   │   │   └── settlement/          # Settlement rail adapter
│   │   ├── domain/                  # Core domain models & invariants
│   │   ├── infrastructure/
│   │   │   ├── canton/              # Ledger API v2 client
│   │   │   ├── database/            # PostgreSQL repositories
│   │   │   └── kafka/               # Event outbox publisher
│   │   └── utils/                   # SafeDecimal, hash chain, logger
│   └── tests/
│       ├── unit/                    # 54 deterministic unit tests
│       └── integration/             # Canton ledger integration tests
│
├── frontend/                        # Institutional operations console
│   ├── index.html                   # Application shell (ES module entry)
│   ├── styles.css                   # Master stylesheet import
│   ├── styles/
│   │   ├── tokens.css               # Design system tokens
│   │   ├── base.css                 # Resets, tabular numerals
│   │   ├── shell.css                # Header, sidebar, workspace layout
│   │   ├── components.css           # Buttons, badges, drawers, modals
│   │   ├── data-grid.css            # High-density institutional data grid
│   │   ├── views.css                # View-specific layouts
│   │   └── responsive.css           # Breakpoints
│   └── src/
│       ├── main.js                  # Bootstrap, router, keyboard shortcuts
│       ├── state/
│       │   └── store.js             # Reactive pub/sub state store
│       ├── services/
│       │   └── api.js               # Centralized API client (trace IDs, anti-replay)
│       ├── components/
│       │   ├── header.js            # Top bar
│       │   ├── sidebar.js           # Navigation
│       │   ├── drawer.js            # Detail inspector
│       │   ├── confirmation-modal.js # Financial action modals
│       │   ├── command-palette.js   # ⌘K search
│       │   └── notifications.js     # Toast stack
│       ├── views/                   # 11 operational view modules
│       └── utils/
│           ├── dom.js               # XSS-safe DOM helpers
│           ├── formatters.js        # Currency, timestamp, hash formatters
│           └── icons.js             # Curated SVG institutional icon set
│
├── daml/                            # DAML 2.10 smart contract source
└── docker-compose.yml               # Canton + PostgreSQL + Kafka stack
```

---

## Design System

ObligaX uses a restrained institutional design language — precision financial infrastructure, not cyberpunk SaaS.

```mermaid
flowchart LR
    subgraph Tokens["Design Tokens"]
        direction TB
        Colors["Surface Palette\n--surface-canvas → elevated\nDeep graphite #0a0c0f → #1e2535"]
        Borders["Border Scale\nSubtle → Default → Strong"]
        Type["Typography\nInter UI + JetBrains Mono\nTabular numeric rendering"]
        States["Semantic States\nSuccess · Warning · Danger · Info · Neutral\nOnly used where state matters"]
        Space["Spacing Scale\n2px → 4 → 8 → 12 → 16 → 24 → 32"]
    end

    Tokens --> Components["Components"]
    Components --> Views["Views"]

    subgraph Components
        direction TB
        Grid["High-density Data Grid\nCompact · Comfortable density modes"]
        Drawer["Detail Drawer\nLevel 1 Business · Level 2 Canton Provenance"]
        Badges["Lifecycle Badges\nProposed · Accepted · Confirmed · Netted · Settled"]
        Modal["Financial Modals\nDouble-confirm destructive actions"]
    end
```

### Design Principles

| Principle | Implementation |
|-----------|---------------|
| **No fake states** | Every value comes from backend or is explicitly marked `Unknown / Not configured` |
| **No browser dialogs** | Zero `alert()` / `confirm()` / `prompt()` — all replaced by modal UI |
| **No inline styles** | All styles via design system tokens in CSS files |
| **No XSS vectors** | All DOM construction via `createElement()` — never `innerHTML` with data |
| **Tabular numerals** | `font-feature-settings: "tnum" 1` on all financial values |
| **Keyboard-first** | `⌘K` command palette, `Escape` to dismiss, arrow navigation |

---

## Security Architecture

```mermaid
flowchart TB
    subgraph Client["Browser Client"]
        CSP["Content-Security-Policy\nno inline scripts · no external fetch"]
        NoInline["Zero inline event handlers\nZero unsafe innerHTML"]
        AntiReplay["Anti-Replay Headers\nx-nonce · x-timestamp on mutations"]
    end

    subgraph API["API Layer"]
        JWT["JWT / OIDC Bearer Auth\nRS256 signature verification"]
        Validation["Zod Schema Validation\nAll request bodies"]
        RateLimit["Rate Limiting\nPer-IP + per-party"]
        CORS["CORS Policy\nAllowlist only"]
    end

    subgraph Ledger["Canton Ledger"]
        DAML["DAML Authorization\nParty-level read/write guards"]
        Privacy["Sub-transaction Privacy\nVisibility scoped to signatories + observers"]
    end

    subgraph Audit["Audit Trail"]
        SHA["SHA-256 Hash Chain\nEvery operation recorded + chained"]
        HMAC["HMAC-SHA256\nSettlement callback webhook verification"]
    end

    Client --> API --> Ledger
    API --> Audit
```

---

## Getting Started

### Prerequisites

| Component | Version |
|-----------|---------|
| Node.js | ≥ 20 LTS |
| DAML SDK | 2.10.x |
| Canton | 2.10.x |
| PostgreSQL | 16 |
| Docker | ≥ 24 (for full stack) |

### Quick Start (Local Development)

```bash
# 1. Clone the repository
git clone https://github.com/MrDecryptDecipher/ObligaX.git
cd ObligaX

# 2. Install backend dependencies
cd backend && npm install

# 3. Set environment variables
cp .env.example .env
# Edit .env with your PostgreSQL connection string and Canton API settings

# 4. Run database migrations
npm run migrate

# 5. Start the development server (serves both API + frontend)
npm run dev

# 6. Open the console
open http://localhost:3000
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://localhost:5432/obligax` |
| `CANTON_LEDGER_API_HOST` | Canton Ledger API host | `localhost` |
| `CANTON_LEDGER_API_PORT` | Canton Ledger API port | `5011` |
| `CANTON_PARTY_ID` | Default operator party ID | `NetworkOperator` |
| `JWT_SECRET` | OIDC/JWT signing secret | Required |
| `SETTLEMENT_WEBHOOK_SECRET` | HMAC secret for rail callbacks | Required |
| `PORT` | Express server port | `3000` |

### Docker Compose (Full Stack)

```bash
# Spin up Canton + PostgreSQL + Kafka + ObligaX
docker-compose up -d

# View logs
docker-compose logs -f obligax-api
```

---

## API Reference

### Base URL

```
http://localhost:3000/api/v1
```

### Authentication

All requests require:
```
Authorization: Bearer <jwt_token>
x-party-id: <party_id>
```

Mutating requests (POST/PUT) also require anti-replay headers:
```
x-timestamp: <unix_ms>
x-nonce: <24_hex_chars>
```

### Key Endpoints

#### Obligations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/obligations` | List obligations (filterable by status, party, currency) |
| `POST` | `/obligations` | Propose a new bilateral obligation |
| `GET` | `/obligations/:id` | Fetch obligation detail |
| `POST` | `/obligations/:id/accept` | Accept a proposed obligation |
| `POST` | `/obligations/:id/confirm` | Confirm an accepted obligation |
| `POST` | `/obligations/:id/cancel` | Cancel an obligation |
| `POST` | `/obligations/:id/disputes` | Raise a dispute |
| `POST` | `/obligations/:id/amendments` | Propose an amendment |

#### Netting

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/netting/proposals` | List netting proposals |
| `POST` | `/netting/proposals` | Create bilateral netting proposal |
| `POST` | `/netting/proposals/:id/accept` | Accept netting proposal |
| `POST` | `/netting/proposals/:id/reject` | Reject netting proposal |
| `POST` | `/netting/proposals/:id/execute` | Execute atomic netting (Canton transaction) |

#### Settlement

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/settlements` | List settlement instructions |
| `POST` | `/settlements` | Initiate direct settlement |
| `POST` | `/settlements/:id/process` | Dispatch to payment rail |
| `POST` | `/settlements/retry` | Retry failed settlement |
| `POST` | `/settlements/callback` | External rail callback (HMAC-authenticated) |

#### Governance & Audit

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/governance/participants` | List registered clearing participants |
| `GET` | `/governance/policy` | Retrieve active network policy |
| `GET` | `/governance/audit` | Query cryptographic audit log |
| `GET` | `/governance/audit/verify` | Verify SHA-256 chain integrity |

#### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | System health (Canton, PostgreSQL, Kafka) |
| `POST` | `/reconciliation/run` | Execute ACS vs DB reconciliation |

---

## Testing

```bash
# Run all 54 deterministic unit tests
cd backend && npm test

# TypeScript compile check (zero errors)
npx tsc --noEmit

# Watch mode during development
npm run test:watch
```

### Test Coverage

```mermaid
xychart-beta
    title "Test Suite Coverage (54 Tests)"
    x-axis ["Obligation State Machine", "Netting Engine", "Settlement Service", "Audit Chain", "Policy Engine", "SafeDecimal", "Reconciliation", "Canton Adapter"]
    y-axis "Tests" 0 --> 12
    bar [12, 8, 7, 6, 5, 4, 8, 4]
```

### Test Suites

| Suite | Tests | Description |
|-------|-------|-------------|
| Obligation State Machine | 12 | All lifecycle transitions, authorization guards, illegal skip rejection |
| Netting Engine | 8 | Bilateral pair matching, atomic compression, currency segregation |
| Settlement Service | 7 | Rail dispatch, callback HMAC verification, retry logic |
| Cryptographic Audit | 6 | Hash chain construction, genesis block, tampering detection |
| Policy Engine | 5 | Exposure limits, currency corridors, daily gross caps |
| SafeDecimal | 4 | IEEE-754 avoidance, institutional precision, division guards |
| Reconciliation | 8 | ACS drift detection, mismatch types, balanced state |
| Canton Adapter | 4 | Multi-participant topology, ACS projection, ledger API v2 |

---

## DAML Contracts

### Contract Hierarchy

```mermaid
flowchart TB
    subgraph Obligation["Obligation.daml"]
        OBL["Obligation\nsignatories: creditor, debtor\nobservers: networkOperator"]
        OBL_ACC["AcceptedObligation"]
        OBL_CONF["ConfirmedObligation"]
        OBL --> OBL_ACC --> OBL_CONF
    end

    subgraph Netting["NettingProposal.daml"]
        NET["NettingProposal\nsignatories: proposer\nobservers: counterparty"]
        NET_ACC["AcceptedNettingProposal"]
        NET_EXEC["NettingExecution\nconsumes all input obligations atomically"]
        NET --> NET_ACC --> NET_EXEC
    end

    subgraph Settlement["Settlement.daml"]
        SET["SettlementInstruction\nsignatories: debtor\nobservers: creditor, operator"]
        SET_COMP["CompletedSettlement"]
        SET --> SET_COMP
    end

    OBL_CONF --> NET
    OBL_CONF --> SET
```

---

## Network Topology

ObligaX operates with a multi-participant Canton topology:

```mermaid
flowchart TB
    subgraph Domain["Canton Synchronizer Domain"]
        SEQ["BFT Sequencer\nOrdering Service"]
        MED["Mediator\nTransaction Confirmation"]
    end

    subgraph Participants["Clearing Participants"]
        OP["NetworkOperator\nGovernance · Mediator · Sequencer"]
        BA["BankA Participant\nClearing Member — Port 5011"]
        BB["BankB Participant\nClearing Member — Port 5021"]
        BC["BankC Participant\nSettlement Bank — Port 5031"]
    end

    subgraph API_Layer["ObligaX API Layer (Express)"]
        GW["API Gateway\n:3000"]
    end

    OP <-->|"Admin API"| Domain
    BA <-->|"Ledger API v2"| Domain
    BB <-->|"Ledger API v2"| Domain
    BC <-->|"Ledger API v2"| Domain

    GW <-->|"Canton Ledger API v2"| BA
    GW <-->|"PostgreSQL 16"| DB[(Read Model)]
```

---

## Governance Policy (Default)

| Policy | Value |
|--------|-------|
| Maximum single obligation amount | USD 100,000,000 |
| Default daily gross exposure ceiling | USD 50,000,000 |
| Settlement bank daily limit | USD 100,000,000 |
| Minimum netting compression lines | 2 obligations |
| Netting cutoff window | 16:00 UTC daily |
| Netting proposal expiry | 24 hours |
| Dispute response SLA | 4 business hours |
| Supported clearing currencies | USD, EUR, GBP, SGD |
| Maximum settlement retry attempts | 3 |
| Adapter timeout threshold | 30,000 ms |
| Delivery mode | dvP (Delivery vs Payment) |

---

## What This Is Not

ObligaX deliberately avoids the following patterns:

- ❌ Generic admin dashboard UI
- ❌ Hardcoded fake network states (`"CONNECTED"`, `"MAINNET"`, `"FEDWIRE ENABLED"`)
- ❌ Browser `alert()` / `confirm()` / `prompt()`
- ❌ Inline styles or inline event handlers
- ❌ Client-side floating-point arithmetic for financial values
- ❌ `innerHTML` string interpolation (XSS vector)
- ❌ Mock/simulated operational state presented as real
- ❌ AI-generated cyberpunk / glassmorphism / gradient dashboard aesthetics
- ❌ Fake Canton contract IDs or fabricated transaction hashes

---

## Contributing

1. Fork and create a feature branch: `git checkout -b feat/your-feature`
2. Ensure 54/54 tests pass: `npm test`
3. Ensure TypeScript compiles: `npx tsc --noEmit`
4. Submit a pull request with a clear description of the domain change

---

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.

---

*ObligaX is a demonstration of institutional-grade financial infrastructure engineering on the Canton/DAML stack. It is not production-certified financial software.*
