# ObligaX High Availability & Disaster Recovery (HA/DR) Runbook

## 1. Architecture Overview & Failure Domains

ObligaX is designed with clear architectural decoupling between the **Authoritative Ledger (Canton Network)**, the **Relational Read Model (PostgreSQL)**, the **Message Broker (Kafka / Redpanda)**, and the **Application Tier (ObligaX API & Workers)**.

| Component | Authoritative Role | RPO (Recovery Point Objective) | RTO (Recovery Time Objective) | HA Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **Canton Synchronizer** | Ordering & Sequencer State | RPO = 0 (BFT / Raft Consensus) | < 30 seconds | Multi-node Sequencer & Mediator cluster |
| **Canton Participant** | Private Contract Store | RPO = 0 (Participant DB WAL) | < 1 minute | Active-passive with shared storage or replicated participant DB |
| **PostgreSQL Projection** | Read-model CQRS Cache | RPO = 0 (Rebuildable from Canton) | < 5 minutes | Streaming replication (Patroni/Stolon) + Canton ACS Catchup |
| **Kafka / Redpanda** | Outbox Event Streaming | RPO = 0 (min.insync.replicas=2) | < 10 seconds | 3-node distributed broker cluster |
| **ObligaX API Tier** | Stateless REST & Ledger Adapter| RPO = 0 | < 5 seconds | K8s Horizontal Pod Autoscaler (3-15 replicas) |

---

## 2. Standard Operating Procedures (SOP)

### SOP-01: Participant Node Failure & Failover
**Trigger**: Participant node health check (`/v2/health`) fails or gRPC connection drops.

1. **Verify Ledger State**:
   ```bash
   curl -s http://canton-participant-a:5011/v2/health | jq .
   ```
2. **Traffic Re-routing**:
   If Participant A is unrecoverable, update `CANTON_LEDGER_HOST` in ConfigMap to standby Participant A replica or alternative hosted participant.
3. **Identity & Party Migration**:
   If moving parties to a new participant, execute Canton topology party hosting transaction:
   ```bash
   canton --config infra/canton/participant.conf \
     "participant1.topology.party_to_participant_mappings.propose_delta(party = 'BankA::1220...', ...)"
   ```
4. **Vetted Package Verification**:
   Ensure all DAML DARs from `package-manifest.json` are vetted on the new node before resuming command traffic.

---

### SOP-02: PostgreSQL Read Model Rebuild from Canton ACS
**Trigger**: PostgreSQL corruption, hardware loss, or unrecoverable projection drift.

> [!IMPORTANT]
> Because Canton is the authoritative source of truth, the entire PostgreSQL database projection can be reconstructed from scratch without data loss.

1. **Wipe or Provision New Database**:
   ```bash
   npx prisma migrate deploy
   ```
2. **Execute Full ACS Re-projection**:
   Start the projection worker with `--from-beginning`:
   ```bash
   node dist/backend/src/infrastructure/projection/projection-worker.js --rebuild-from-acs
   ```
   The worker queries all active contracts via `/v2/state/active-contracts`, decodes templates, inserts canonical records into PostgreSQL, and initializes the `ledger_offset` checkpoint to the latest transaction offset.
3. **Verify Reconciliation Zero-Drift**:
   ```bash
   curl -X POST http://localhost:3000/api/v1/reconciliation/run \
     -H "Authorization: Bearer $OPERATOR_TOKEN"
   ```

---

### SOP-03: External Settlement Rail Disconnection & Reconnection
**Trigger**: External banking rail (Fedwire, RTGS, CHIPS) unreachable or returning consecutive timeouts.

1. **Automatic Circuit Breaker**:
   - The Settlement Adapter automatically intercepts network failures and rejects new settlement submissions with `503 Service Unavailable`.
   - In-flight settlements remain in `SettlementProcessing` until either webhook callback arrives or manual status query succeeds.
2. **Post-Reconnection Reconciliation**:
   Once rail connectivity is restored, trigger two-way reconciliation:
   ```bash
   curl -X POST http://localhost:3000/api/v1/reconciliation/settlements \
     -H "Authorization: Bearer $OPERATOR_TOKEN"
   ```
3. **Resolution of Hanging Instructions**:
   - For settlements confirmed on the rail but missing in ObligaX: The adapter consumes the rail execution report and executes `CompleteSettlement` on Canton.
   - For settlements rejected on the rail: The adapter executes `FailSettlement` on Canton, which safely reopens the underlying obligation to `Confirmed` status.

---

### SOP-04: Cryptographic Audit Trail Verification
**Trigger**: Regulatory compliance audit or security anomaly detection.

1. **Verify Full Cryptographic Chain**:
   ```bash
   node -e "
     const { AuditRepository } = require('./dist/backend/src/infrastructure/database/repositories/audit.repository');
     const repo = new AuditRepository();
     const res = repo.verifyChainIntegrity();
     if (!res.isValid) {
       console.error('TAMPERING DETECTED at sequence ' + res.brokenAtSequence + ': ' + res.reason);
       process.exit(1);
     }
     console.log('Audit chain verified clean from genesis to tip: ' + repo.getTipHash());
   "
   ```
2. **Export Signed Audit Package**:
   Generate canonical JSON export with SHA-256 chain manifests for external auditors.
