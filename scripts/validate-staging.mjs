#!/usr/bin/env node

/**
 * Validation script for staging environment
 * Ensures staging-specific configuration is correct
 */

import {
  validateEnvironmentSecurity,
  validateStagingEnvironment
} from '../packages/shared/dist/env.js';

console.log('🔧 Validating staging environment configuration...\n');

// Set staging environment for testing
const originalEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'staging';

try {
  // 1. Run basic security validation
  console.log('🔒 Running security validation...');
  validateEnvironmentSecurity();
  console.log('✅ Security validation passed');
  console.log('  • No server-only variables exposed as NEXT_PUBLIC_*');
  console.log('  • No conflicting duplicate variables found\n');

  // 2. Run staging-specific validation
  console.log('🏥 Running staging environment validation...');
  const stagingValidation = validateStagingEnvironment();

  console.log('\n📊 Staging Environment Status:');
  console.log(`  🔐 Security:    ${stagingValidation.security ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  🗄️ Database:    ${stagingValidation.database ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  💳 Payments:    ${stagingValidation.payments ? '✅ PASS (TEST)' : '⚠️  WARN (TEST REQUIRED)'}`);
  console.log(`  📊 Monitoring:  ${stagingValidation.monitoring ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  🏥 Compliance:  ${stagingValidation.compliance ? '✅ PASS' : '❌ FAIL'}`);

  // 3. Report any issues
  if (stagingValidation.issues.length > 0) {
    console.log('\n⚠️  Issues found:');
    stagingValidation.issues.forEach(issue => {
      console.log(`  • ${issue}`);
    });
  }

  // 4. Staging-specific recommendations
  console.log('\n📝 Staging Environment Best Practices:');
  console.log('  ✅ Use test credentials for all external services');
  console.log('  ✅ Enable verbose logging for debugging');
  console.log('  ✅ Use staging subdomains (staging.autamedica.com)');
  console.log('  ✅ Separate Supabase project for data isolation');
  console.log('  ✅ Test reCAPTCHA keys for development');

  // 5. Determine overall status
  const criticalSections = [
    stagingValidation.security,
    stagingValidation.database,
    stagingValidation.monitoring,
    stagingValidation.compliance
  ];

  const allCriticalPass = criticalSections.every(section => section);

  if (allCriticalPass) {
    console.log('\n🎯 Staging environment validation completed successfully!');
    console.log('✅ Ready for staging deployment');

    if (!stagingValidation.payments) {
      console.log('\n💡 Note: Configure TEST MercadoPago credentials for payment testing');
    }
  } else {
    console.log('\n❌ Staging environment validation failed - Issues must be resolved');
    process.exit(1);
  }

} catch (error) {
  console.error('\n❌ Staging environment validation failed:');
  console.error(error.message);
  process.exit(1);
} finally {
  // Restore original environment
  process.env.NODE_ENV = originalEnv;
}