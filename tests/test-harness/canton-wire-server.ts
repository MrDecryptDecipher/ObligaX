import express, { Request, Response } from 'express';
import http from 'http';
import { CantonContractRecord } from '../../backend/src/types/canton.types';

export class CantonWireServer {
  private app: express.Express;
  private server?: http.Server;
  private contracts: Map<string, CantonContractRecord> = new Map();
  private contractCounter = 1000;
  private txCounter = 1;
  private updateListeners: ((update: Record<string, unknown>) => void)[] = [];

  constructor() {
    this.app = express();
    this.app.use(express.json());
    this.setupEndpoints();
  }

  public seedContract(contract: CantonContractRecord): void {
    this.contracts.set(contract.contractId, contract);
  }

  public clear(): void {
    this.contracts.clear();
    this.contractCounter = 1000;
    this.txCounter = 1;
  }

  private setupEndpoints(): void {
    // Health check
    this.app.get('/v2/health', (req: Request, res: Response) => {
      res.status(200).json({
        status: 'SERVING',
        participantId: 'participant1',
        synchronizerId: 'synchronizer1',
        ledgerApiVersion: 'v2'
      });
    });

    // Submit and wait
    this.app.post('/v2/commands/submit-and-wait', (req: Request, res: Response) => {
      const { commands, commandId, actAs, workflowId } = req.body;
      const txId = `tx-${this.txCounter++}-${Date.now()}`;
      const effectiveTime = new Date().toISOString();
      const createdContractIds: string[] = [];
      const archivedContractIds: string[] = [];
      const events: Record<string, unknown>[] = [];

      for (const cmd of (commands || [])) {
        if (cmd.create) {
          const cid = `#c-${this.contractCounter++}`;
          const payload = cmd.create.payload || {};
          const sigs = new Set<string>(actAs || ['NetworkOperator']);
          if (payload.debtor) sigs.add(payload.debtor);
          if (payload.initiator) sigs.add(payload.initiator);

          const obs = new Set<string>();
          if (payload.creditor) obs.add(payload.creditor);
          if (payload.counterparty) obs.add(payload.counterparty);

          const record: CantonContractRecord = {
            contractId: cid,
            templateId: cmd.create.templateId,
            payload,
            signatories: Array.from(sigs),
            observers: Array.from(obs),
            createdAt: effectiveTime
          };
          this.contracts.set(cid, record);
          createdContractIds.push(cid);
          events.push({
            created: {
              contractId: cid,
              templateId: cmd.create.templateId,
              payload: cmd.create.payload,
              signatories: record.signatories,
              observers: record.observers,
              createdAt: effectiveTime
            },
            offset: String(this.txCounter)
          });
        } else if (cmd.exercise) {
          const existing = this.contracts.get(cmd.exercise.contractId);
          if (!existing) {
            res.status(404).json({ error: 'NOT_FOUND', message: `Contract ${cmd.exercise.contractId} not found.` });
            return;
          }

          // Canton authorization boundary: check actAs party rights
          const callers = actAs || ['NetworkOperator'];
          if (cmd.exercise.choice === 'AcceptObligation') {
            const debtor = existing.payload.debtor;
            const isAuthorized = callers.some(
              (p: string) => p === debtor || p.split('::')[0] === String(debtor).split('::')[0] || p === 'NetworkOperator'
            );
            if (!isAuthorized) {
              res.status(403).json({
                error: 'PERMISSION_DENIED',
                message: `Party ${callers.join(', ')} is not authorized to exercise ${cmd.exercise.choice} on ${cmd.exercise.contractId}`
              });
              return;
            }
          }

          if (existing) {
            this.contracts.delete(cmd.exercise.contractId);
            archivedContractIds.push(cmd.exercise.contractId);
            events.push({
              archived: {
                contractId: cmd.exercise.contractId,
                templateId: existing.templateId
              },
              offset: String(this.txCounter)
            });

            // If choice produces new state contract
            const newCid = `#c-${this.contractCounter++}`;
            const newPayload = { ...existing.payload, ...cmd.exercise.argument };
            if (cmd.exercise.choice === 'AcceptObligation') {
              newPayload['status'] = 'Accepted';
              newPayload['version'] = Number(newPayload['version'] || 1) + 1;
            } else if (cmd.exercise.choice === 'ConfirmObligation') {
              newPayload['status'] = 'Confirmed';
              newPayload['version'] = Number(newPayload['version'] || 1) + 1;
            } else if (cmd.exercise.choice === 'EnterSettlementPending') {
              newPayload['status'] = 'SettlementPending';
              newPayload['version'] = Number(newPayload['version'] || 1) + 1;
            } else if (cmd.exercise.choice === 'FinalizeSettlement') {
              newPayload['status'] = 'Settled';
              newPayload['version'] = Number(newPayload['version'] || 1) + 1;
            }

            const newRecord: CantonContractRecord = {
              contractId: newCid,
              templateId: existing.templateId,
              payload: newPayload,
              signatories: existing.signatories,
              observers: existing.observers,
              createdAt: effectiveTime
            };
            this.contracts.set(newCid, newRecord);
            createdContractIds.push(newCid);
            events.push({
              created: {
                contractId: newCid,
                templateId: existing.templateId,
                payload: newPayload,
                signatories: newRecord.signatories,
                observers: newRecord.observers,
                createdAt: effectiveTime
              },
              offset: String(this.txCounter)
            });
          }
        }
      }

      const updateObj = {
        transactionId: txId,
        commandId,
        workflowId,
        effectiveTime,
        offset: String(this.txCounter),
        events,
        createdContractIds,
        archivedContractIds
      };

      for (const listener of this.updateListeners) {
        listener(updateObj);
      }

      res.status(200).json(updateObj);
    });

    // Query active contracts
    this.app.get('/v2/state/active-contracts', (req: Request, res: Response) => {
      const templateId = req.query.template_id as string;
      const party = (req.query.party as string) || (req.headers['x-party-id'] as string);

      let list = Array.from(this.contracts.values());
      if (templateId) {
        list = list.filter(c => c.templateId === templateId);
      }
      if (party && party !== 'NetworkOperator') {
        const partyPrefix = party.split('::')[0];
        list = list.filter(c => {
          const stakeholders = [...(c.signatories || []), ...(c.observers || [])];
          return stakeholders.some(s => s === party || s.split('::')[0] === partyPrefix);
        });
      }
      res.status(200).json({ contracts: list });
    });

    // Fetch contract by ID
    this.app.get('/v2/state/contracts/:id', (req: Request, res: Response): void => {
      const contract = this.contracts.get(req.params.id);
      if (!contract) {
        res.status(404).json({ error: 'NOT_FOUND', message: `Contract ${req.params.id} not found.` });
        return;
      }
      const party = (req.query.party as string) || (req.headers['x-party-id'] as string);
      if (party && party !== 'NetworkOperator') {
        const partyPrefix = party.split('::')[0];
        const stakeholders = [...(contract.signatories || []), ...(contract.observers || [])];
        const isStakeholder = stakeholders.some(s => s === party || s.split('::')[0] === partyPrefix);
        if (!isStakeholder) {
          res.status(403).json({ error: 'PERMISSION_DENIED', message: `Party ${party} is not a stakeholder of contract ${req.params.id}.` });
          return;
        }
      }
      res.status(200).json({ contract });
    });

    // Admin endpoints
    this.app.post('/api/v1/admin/parties', (req: Request, res: Response) => {
      const { partyIdHint, displayName } = req.body;
      const hex = Buffer.from(partyIdHint || 'Party').toString('hex').padEnd(64, '0').slice(0, 64);
      const party = `${partyIdHint}::1220${hex}`;
      res.status(200).json({
        partyDetails: {
          party,
          displayName: displayName || partyIdHint,
          isLocal: true,
          participantId: 'participant1'
        }
      });
    });

    this.app.post('/api/v1/admin/packages', (req: Request, res: Response) => {
      res.status(200).json({
        packageId: 'd3b4f6a1e8c9b2d4e7f0a1b3c5d7e9f1a2b4c6d8e0f2a4b6c8d0e2f4a6b8c0d2'
      });
    });

    this.app.post('/api/v1/admin/topology/vetted-packages', (req: Request, res: Response) => {
      res.status(200).json({ vetted: true });
    });
  }

  public listen(port = 5011): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, () => {
        resolve();
      });
      this.server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          // Port already in use by real Canton or another test worker
          resolve();
        } else {
          reject(err);
        }
      });
    });
  }

  public close(): Promise<void> {
    return new Promise(resolve => {
      if (this.server && this.server.listening) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

export const defaultCantonWireServer = new CantonWireServer();
