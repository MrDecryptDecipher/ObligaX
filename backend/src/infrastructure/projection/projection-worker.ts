import {
  CantonEventStream,
  DecodedTransactionEvent
} from '../canton/canton-event-stream';
import { TEMPLATES } from '../canton/canton-command-builder';
import { ObligationRepository } from '../database/repositories/obligation.repository';
import { SettlementRepository } from '../database/repositories/settlement.repository';
import { NettingRepository } from '../database/repositories/netting.repository';
import { AuditLogger } from '../observability/audit-logger';
import { SafeDecimal } from '../../utils/decimal';
import { DateUtils } from '../../utils/dates';
import { ObligationStatus } from '../../domain/obligation/obligation.types';

export interface OffsetCheckpoint {
  subscriberId: string;
  lastOffset: string;
  lastTransactionId: string;
  updatedAt: Date;
}

export class ProjectionWorker {
  private static checkpoint: OffsetCheckpoint = {
    subscriberId: 'obligax-postgres-projection',
    lastOffset: '0',
    lastTransactionId: 'genesis',
    updatedAt: new Date()
  };

  private isRunning = false;

  constructor(
    private readonly eventStream: CantonEventStream,
    private readonly obligationRepo: ObligationRepository,
    private readonly settlementRepo: SettlementRepository,
    private readonly nettingRepo: NettingRepository
  ) {}

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Set resumption offset
    this.eventStream.setOffset(ProjectionWorker.checkpoint.lastOffset);

    // Register event consumer
    this.eventStream.onEvent(async event => {
      await this.processEvent(event);
    });

    this.eventStream.start();
    AuditLogger.info(
      `ProjectionWorker started. Resuming Canton event projection from offset '${ProjectionWorker.checkpoint.lastOffset}'.`
    );
  }

  public stop(): void {
    this.isRunning = false;
    this.eventStream.stop();
  }

  public async processEvent(event: DecodedTransactionEvent): Promise<void> {
    try {
      if (event.eventType === 'created' && event.payload) {
        await this.handleCreatedEvent(event);
      } else if (event.eventType === 'archived') {
        await this.handleArchivedEvent(event);
      }

      // Checkpoint offset
      ProjectionWorker.checkpoint = {
        subscriberId: 'obligax-postgres-projection',
        lastOffset: event.offset,
        lastTransactionId: event.transactionId,
        updatedAt: new Date()
      };
    } catch (err: unknown) {
      AuditLogger.error(
        `Failed to project Canton transaction ${event.transactionId} on contract ${event.contractId}:`,
        err
      );
    }
  }

  private async handleCreatedEvent(event: DecodedTransactionEvent): Promise<void> {
    const payload = event.payload || {};

    if (event.templateId === TEMPLATES.OBLIGATION) {
      const obligationId = String(payload['obligationId'] || '');
      if (!obligationId) return;

      const amount = SafeDecimal.from(String(payload['amount'] || '0'));
      const status = (payload['status'] as ObligationStatus) || 'Proposed';
      const createdDate = DateUtils.parse(String(payload['createdDate'] || new Date().toISOString()));
      const dueDate = DateUtils.parse(String(payload['dueDate'] || new Date().toISOString()));
      const meta = (payload['metadata'] as Record<string, unknown>) || {};

      await this.obligationRepo.save({
        contractId: event.contractId,
        obligationId,
        creditor: String(payload['creditor'] || ''),
        debtor: String(payload['debtor'] || ''),
        description: String(payload['description'] || ''),
        amount,
        currency: (payload['currency'] as any) || 'USD',
        status,
        createdDate,
        dueDate,
        priority: (payload['priority'] as any) || 'Normal',
        version: Number(payload['version'] || 1),
        metadata: {
          sourceSystem: String(meta['sourceSystem'] || 'ObligaX'),
          sourceReference: String(meta['sourceReference'] || obligationId),
          businessUnit: String(meta['businessUnit'] || 'Treasury'),
          createdBy: String(meta['createdBy'] || ''),
          createdAt: new Date(),
          version: Number(meta['version'] || 1)
        }
      });
    } else if (event.templateId === TEMPLATES.SETTLEMENT_INSTRUCTION) {
      const settlementId = String(payload['settlementId'] || '');
      if (!settlementId) return;

      const existing = await this.settlementRepo.findBySettlementId(settlementId);
      if (existing) {
        existing.contractId = event.contractId;
        existing.status = (payload['status'] as any) || existing.status;
        await this.settlementRepo.save(existing);
      }
    } else if (event.templateId === TEMPLATES.NETTING_PROPOSAL) {
      const nettingId = String(payload['nettingId'] || '');
      if (!nettingId) return;

      const existing = await this.nettingRepo.findProposalById(nettingId);
      if (existing) {
        existing.contractId = event.contractId;
        existing.status = (payload['status'] as any) || existing.status;
        await this.nettingRepo.saveProposal(existing);
      }
    }
  }

  private async handleArchivedEvent(event: DecodedTransactionEvent): Promise<void> {
    // When a contract is archived in Canton, we update contract reference
    // Read model retains lifecycle history with status progression
  }

  public static getCheckpoint(): OffsetCheckpoint {
    return { ...ProjectionWorker.checkpoint };
  }
}
