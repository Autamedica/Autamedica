import type { SupabaseClient } from '@supabase/supabase-js';
import {
  IssuePrescriptionUseCase,
  SupabasePrescriptionRepository,
  RctaVendorAdapter,
  SupabaseIdentityValidator,
  SupabaseDispensationRepository,
  SupabasePharmacyRegistry,
  SupabasePharmacyNotifier,
  CreateDispensationOrderUseCase,
  ValidateDispensationUseCase,
  ExecuteDispensationUseCase,
  RequestClarificationUseCase,
} from '@autamedica/prescriptions';

export function createPrescriptionUseCases(supabase: SupabaseClient) {
  const repo = new SupabasePrescriptionRepository(supabase);
  const vendor = new RctaVendorAdapter(supabase);
  const identity = new SupabaseIdentityValidator(supabase);
  const dispensationRepo = new SupabaseDispensationRepository(supabase);
  const pharmacyRegistry = new SupabasePharmacyRegistry(supabase);
  const pharmacyNotifier = new SupabasePharmacyNotifier(supabase);

  return {
    repo,
    vendor,
    identity,
    dispensationRepo,
    pharmacyRegistry,
    pharmacyNotifier,
    issuePrescription: new IssuePrescriptionUseCase(repo, vendor, identity),
    createDispensationOrder: new CreateDispensationOrderUseCase(dispensationRepo),
    validateDispensation: new ValidateDispensationUseCase(dispensationRepo),
    executeDispensation: new ExecuteDispensationUseCase(dispensationRepo),
    requestClarification: new RequestClarificationUseCase(dispensationRepo),
  };
}
