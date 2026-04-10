import { logger } from '@autamedica/shared';
import type {
  DispensationOrderInsert,
  DispensationOrderId,
  DispensationOrder,
} from '../domain/pharmacy.models';
import {
  isValidTransition,
  getRequiredValidations,
  areAllValidationsPassed,
} from '../domain/pharmacy.models';
import type {
  IDispensationRepository,
  DispensationValidationInsert,
  DispensationEventInsert,
  DispensationClarificationInsert,
} from '../domain/pharmacy.ports';

// ══════════════════════════════════════════════
// Use Case: Create Dispensation Order
// ══════════════════════════════════════════════

export class CreateDispensationOrderUseCase {
  constructor(private readonly repo: IDispensationRepository) {}

  async execute(
    input: DispensationOrderInsert,
    actorId: string,
    context: { ip: string }
  ): Promise<DispensationOrderId> {
    logger.info(`[CreateDispensationOrder] Creating order for prescription ${input.prescriptionId}`);

    // Determine initial status based on clinical semaphore
    let initialStatus: 'pending' | 'blocked' = 'pending';
    if (input.clinicalSemaphore === 'red') {
      initialStatus = 'blocked';
      logger.warn(`[CreateDispensationOrder] Red semaphore — order created as BLOCKED`);
    }

    const orderId = await this.repo.createOrder({
      ...input,
    });

    // Log audit event
    await this.repo.logAuditEvent({
      orderId,
      eventType: 'order_created',
      actorId,
      actorRole: 'system',
      details: {
        prescriptionType: input.prescriptionType,
        clinicalSemaphore: input.clinicalSemaphore,
        extraordinaryDoseFlag: input.extraordinaryDoseFlag,
        initialStatus,
      },
      ipAddress: context.ip,
    });

    // Additional audit for special flags
    if (input.prescriptionType === 'transition_bridge') {
      await this.repo.logAuditEvent({
        orderId,
        eventType: 'bridge_protocol_activated',
        actorId,
        actorRole: 'system',
        details: {
          durationDays: input.durationDays,
          quantityUnits: input.quantityUnits,
        },
        ipAddress: context.ip,
      });
    }

    if (input.extraordinaryDoseFlag) {
      await this.repo.logAuditEvent({
        orderId,
        eventType: 'extraordinary_dose_flagged',
        actorId,
        actorRole: 'system',
        details: {
          doseMgPerDay: input.doseMgPerDay,
          medication: input.medication,
        },
        ipAddress: context.ip,
      });
    }

    logger.info(`[CreateDispensationOrder] Order ${orderId} created with status ${initialStatus}`);
    return orderId;
  }
}

// ══════════════════════════════════════════════
// Use Case: Validate Dispensation Order
// ══════════════════════════════════════════════

export class ValidateDispensationUseCase {
  constructor(private readonly repo: IDispensationRepository) {}

  async execute(
    validation: DispensationValidationInsert,
    actorId: string,
    context: { ip: string }
  ): Promise<{ allPassed: boolean; remainingValidations: string[] }> {
    logger.info(`[ValidateDispensation] Recording ${validation.validationType} for order ${validation.orderId}`);

    const order = await this.repo.findOrderById(validation.orderId);
    if (!order) throw new Error(`Order ${validation.orderId} not found`);

    if (order.status !== 'under_review' && order.status !== 'clarification_provided') {
      throw new Error(
        `Cannot validate order in status "${order.status}". Expected "under_review" or "clarification_provided".`
      );
    }

    // Record the validation
    await this.repo.recordValidation(validation);

    // Audit
    await this.repo.logAuditEvent({
      orderId: validation.orderId,
      eventType: 'validation_performed',
      actorId,
      actorRole: 'pharmacist',
      details: {
        validationType: validation.validationType,
        result: validation.result,
        overrideReason: validation.overrideReason,
      },
      ipAddress: context.ip,
    });

    // Check if all validations are now complete
    const allValidations = await this.repo.getValidationsForOrder(validation.orderId);
    const allPassed = areAllValidationsPassed(order, allValidations);
    const required = getRequiredValidations(order);
    const completed = allValidations
      .filter(v => v.result === 'pass' || v.result === 'overridden')
      .map(v => v.validationType);
    const remaining = required.filter(r => !completed.includes(r));

    // If validation failed, block the order
    if (validation.result === 'fail') {
      await this.repo.updateOrderStatus(validation.orderId, 'blocked');
      await this.repo.logAuditEvent({
        orderId: validation.orderId,
        eventType: 'order_blocked',
        actorId,
        actorRole: 'pharmacist',
        details: {
          reason: `Validation "${validation.validationType}" failed`,
          details: validation.details,
        },
        ipAddress: context.ip,
      });
    }

    // If all passed, approve for dispensation
    if (allPassed) {
      await this.repo.updateOrderStatus(validation.orderId, 'approved_for_dispensation');
      await this.repo.logAuditEvent({
        orderId: validation.orderId,
        eventType: 'dispensation_approved',
        actorId,
        actorRole: 'pharmacist',
        details: { completedValidations: completed },
        ipAddress: context.ip,
      });
    }

    return { allPassed, remainingValidations: remaining };
  }
}

// ══════════════════════════════════════════════
// Use Case: Execute Dispensation
// ══════════════════════════════════════════════

export class ExecuteDispensationUseCase {
  constructor(private readonly repo: IDispensationRepository) {}

  async execute(
    event: DispensationEventInsert,
    actorId: string,
    context: { ip: string }
  ): Promise<void> {
    logger.info(`[ExecuteDispensation] Dispensing for order ${event.orderId}`);

    const order = await this.repo.findOrderById(event.orderId);
    if (!order) throw new Error(`Order ${event.orderId} not found`);

    if (
      order.status !== 'approved_for_dispensation' &&
      order.status !== 'partially_dispensed'
    ) {
      throw new Error(
        `Cannot dispense order in status "${order.status}". Expected "approved_for_dispensation" or "partially_dispensed".`
      );
    }

    // HARD RULE: Bridge prescription — formulation and quantity must match exactly
    if (order.prescriptionType === 'transition_bridge') {
      if (event.dispensedFormulation !== order.formulation) {
        throw new Error(
          `Bridge prescription: formulation mismatch. Expected "${order.formulation}", got "${event.dispensedFormulation}". Use clarification workflow to request changes.`
        );
      }
      if (event.dispensedQuantity !== order.quantityUnits) {
        throw new Error(
          `Bridge prescription: quantity mismatch. Expected ${order.quantityUnits}, got ${event.dispensedQuantity}. Use clarification workflow to request changes.`
        );
      }
    }

    // Record the dispensation event
    await this.repo.recordDispensation(event);

    // Determine new order status
    const allEvents = await this.repo.getDispensationsForOrder(event.orderId);
    const totalDispensed = allEvents.reduce((sum, e) => sum + e.dispensedQuantity, 0);
    const newStatus: 'dispensed' | 'partially_dispensed' =
      totalDispensed >= order.quantityUnits ? 'dispensed' : 'partially_dispensed';

    await this.repo.updateOrderStatus(event.orderId, newStatus);

    // Audit
    await this.repo.logAuditEvent({
      orderId: event.orderId,
      eventType: 'dispensation_executed',
      actorId,
      actorRole: 'pharmacist',
      details: {
        dispensedMedication: event.dispensedMedication,
        dispensedFormulation: event.dispensedFormulation,
        dispensedQuantity: event.dispensedQuantity,
        totalDispensed,
        targetQuantity: order.quantityUnits,
        newStatus,
        substitutionType: event.substitutionType,
        batchNumber: event.dispensedBatchNumber,
      },
      ipAddress: context.ip,
    });

    logger.info(
      `[ExecuteDispensation] Order ${event.orderId} → ${newStatus} (${totalDispensed}/${order.quantityUnits})`
    );
  }
}

// ══════════════════════════════════════════════
// Use Case: Request Clarification
// ══════════════════════════════════════════════

export class RequestClarificationUseCase {
  constructor(private readonly repo: IDispensationRepository) {}

  async execute(
    clarification: DispensationClarificationInsert,
    actorId: string,
    context: { ip: string }
  ): Promise<string> {
    logger.info(`[RequestClarification] Pharmacist requesting clarification for order ${clarification.orderId}`);

    const order = await this.repo.findOrderById(clarification.orderId);
    if (!order) throw new Error(`Order ${clarification.orderId} not found`);

    const validSourceStates = ['under_review', 'blocked'];
    if (!validSourceStates.includes(order.status)) {
      throw new Error(
        `Cannot request clarification for order in status "${order.status}". Expected "under_review" or "blocked".`
      );
    }

    // Create clarification
    const clarificationId = await this.repo.createClarification(clarification);

    // Transition order to clarification_requested
    if (isValidTransition(order.status, 'clarification_requested')) {
      await this.repo.updateOrderStatus(order.id, 'clarification_requested');
    }

    // Audit
    await this.repo.logAuditEvent({
      orderId: clarification.orderId,
      eventType: 'clarification_requested',
      actorId,
      actorRole: 'pharmacist',
      details: {
        question: clarification.question,
        category: clarification.questionCategory,
        clarificationId,
      },
      ipAddress: context.ip,
    });

    return clarificationId;
  }
}
