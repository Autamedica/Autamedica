#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * AutaMedica Auth SSO Monitoring Script
 * Verifica la salud del sistema de autenticación enterprise
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const domainsConfig = require('./config/domains.js');

const { URLS, PAGES_TARGETS, DOMAINS } = domainsConfig;

const MONITORING_CONFIG = {
  // URLs a monitorear (con soporte para BASE_URL de environment)
  endpoints: {
    webApp: process.env.BASE_URL || URLS.web,
    authHub: process.env.AUTH_HUB_URL || URLS.authHub,
    doctors: process.env.DOCTORS_URL || URLS.doctors,
    patients: process.env.PATIENTS_URL || URLS.patients,
    companies: process.env.COMPANIES_URL || URLS.companies,
    admin: process.env.ADMIN_URL || URLS.admin,
    doctorsPages: `https://${PAGES_TARGETS.doctors}`,
    patientsPages: `https://${PAGES_TARGETS.patients}`,
    companiesPages: `https://${PAGES_TARGETS.companies}`,
    adminPages: `https://${PAGES_TARGETS.admin}`,
  },

  // Rutas críticas para verificar redirects
  criticalPaths: [
    '/auth/login',
    '/auth/register',
    '/auth/forgot-password'
  ],

  // Headers de seguridad requeridos
  requiredSecurityHeaders: [
    'content-security-policy',
    'x-frame-options',
    'x-content-type-options',
    'referrer-policy'
  ],

  // Timeouts
  timeout: 10000,
  retries: 3
};

class AuthMonitor {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      checks: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        warnings: 0
      }
    };
  }

  async run() {
    console.log('🔒 AutaMedica Auth SSO Monitor v1.0');
    console.log('=====================================');
    console.log(`⏰ ${this.results.timestamp}`);
    console.log('');

    await this.checkAuthRedirects();
    await this.checkSecurityHeaders();
    await this.checkPortalConnectivity();
    await this.checkCookieCompliance();

    this.generateReport();
    this.saveResults();

    return this.results;
  }

  async checkAuthRedirects() {
    console.log('📍 Verificando disponibilidad de rutas de auth...');

    for (const path of MONITORING_CONFIG.criticalPaths) {
      const check = {
        type: 'auth_redirect',
        path,
        timestamp: new Date().toISOString(),
        status: 'running'
      };

      try {
        const result = await this.makeRequest(MONITORING_CONFIG.endpoints.authHub + path, {
          followRedirects: false
        });

        const expectedTarget = `${DOMAINS.authHub}/auth`;
        const actualLocation = result.headers.location || '';

        if (
          [200, 301, 302, 307, 308].includes(result.statusCode) &&
          (!actualLocation || actualLocation.includes(expectedTarget))
        ) {
          check.status = 'passed';
          check.message = `✅ ${path} → ${result.statusCode} ${actualLocation ? `→ ${actualLocation}` : ''}`;
          this.results.summary.passed++;
        } else {
          check.status = 'failed';
          check.message = `❌ ${path} → ${result.statusCode} → ${actualLocation}`;
          this.results.summary.failed++;
        }

      } catch (error) {
        check.status = 'failed';
        check.message = `❌ Error: ${error.message}`;
        this.results.summary.failed++;
      }

      this.results.checks.push(check);
      console.log(`  ${check.message}`);
    }

    this.results.summary.total += MONITORING_CONFIG.criticalPaths.length;
  }

  async checkSecurityHeaders() {
    console.log('\n🛡️  Verificando headers de seguridad...');

    const check = {
      type: 'security_headers',
      timestamp: new Date().toISOString(),
      status: 'running',
      details: {}
    };

    try {
      const result = await this.makeRequest(MONITORING_CONFIG.endpoints.webApp);

      for (const headerName of MONITORING_CONFIG.requiredSecurityHeaders) {
        const headerValue = result.headers[headerName];

        if (headerValue) {
          check.details[headerName] = {
            status: '✅',
            value: headerValue.substring(0, 100) + (headerValue.length > 100 ? '...' : '')
          };
        } else {
          check.details[headerName] = {
            status: '❌',
            value: 'Missing'
          };
          this.results.summary.failed++;
        }
      }

      // Verificar CSP específico para AutaMedica
      const csp = result.headers['content-security-policy'] || '';
      if (csp.includes('*.autamedica.com') && csp.includes('*.supabase.co')) {
        check.cspCompliance = '✅ CSP configurado para AutaMedica domains';
      } else {
        check.cspCompliance = '⚠️ CSP podría necesitar ajustes para AutaMedica';
        this.results.summary.warnings++;
      }

      check.status = 'completed';
      check.message = 'Security headers verification completed';

    } catch (error) {
      check.status = 'failed';
      check.message = `❌ Error verificando headers: ${error.message}`;
      this.results.summary.failed++;
    }

    this.results.checks.push(check);
    this.results.summary.total++;

    // Log results
    for (const [header, details] of Object.entries(check.details)) {
      console.log(`  ${details.status} ${header}: ${details.value}`);
    }
    if (check.cspCompliance) {
      console.log(`  ${check.cspCompliance}`);
    }
  }

  async checkPortalConnectivity() {
    console.log('\n🌐 Verificando conectividad de portales...');

    const portals = ['doctors', 'patients', 'companies', 'admin'];

    for (const portal of portals) {
      const check = {
        type: 'portal_connectivity',
        portal,
        timestamp: new Date().toISOString(),
        status: 'running'
      };

      try {
        const url = MONITORING_CONFIG.endpoints[portal];
        const result = await this.makeRequest(url);

        if (result.statusCode >= 200 && result.statusCode < 400) {
          check.status = 'passed';
          check.message = `✅ ${portal} portal: ${result.statusCode}`;
          this.results.summary.passed++;
        } else {
          check.status = 'warning';
          check.message = `⚠️ ${portal} portal: ${result.statusCode} (podría requerir auth)`;
          this.results.summary.warnings++;
        }

      } catch (error) {
        check.status = 'failed';
        check.message = `❌ ${portal} portal: ${error.message}`;
        this.results.summary.failed++;
      }

      this.results.checks.push(check);
      console.log(`  ${check.message}`);
    }

    this.results.summary.total += portals.length;
  }

  async checkCookieCompliance() {
    console.log('\n🍪 Verificando compliance de cookies...');

    const check = {
      type: 'cookie_compliance',
      timestamp: new Date().toISOString(),
      status: 'info',
      message: 'ℹ️ Cookie compliance requiere verificación manual en Auth Hub'
    };

    check.requirements = {
      domain: '.autamedica.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'None'
    };

    check.instructions = [
      '1. Verificar que Auth Hub setea am_session con Domain=.autamedica.com',
      '2. Confirmar flags: Secure; HttpOnly; SameSite=None',
      '3. Validar TTL y refresh automático',
      '4. Probar cross-domain SSO entre portales'
    ];

    this.results.checks.push(check);
    this.results.summary.total++;

    console.log(`  ${check.message}`);
    console.log('  📋 Requisitos de cookie am_session:');
    for (const [key, value] of Object.entries(check.requirements)) {
      console.log(`    ${key}: ${value}`);
    }
  }

  async makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, MONITORING_CONFIG.timeout);

      const req = https.get(url, {
        timeout: MONITORING_CONFIG.timeout,
        ...options
      }, (res) => {
        clearTimeout(timeout);

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        });
      });

      req.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  generateReport() {
    console.log('\n📊 RESUMEN DEL MONITOREO');
    console.log('========================');
    console.log(`✅ Passed: ${this.results.summary.passed}`);
    console.log(`❌ Failed: ${this.results.summary.failed}`);
    console.log(`⚠️ Warnings: ${this.results.summary.warnings}`);
    console.log(`📊 Total: ${this.results.summary.total}`);

    const successRate = (this.results.summary.passed / this.results.summary.total * 100).toFixed(1);
    console.log(`🎯 Success Rate: ${successRate}%`);

    if (this.results.summary.failed > 0) {
      console.log('\n🚨 ISSUES TO ADDRESS:');
      this.results.checks
        .filter(check => check.status === 'failed')
        .forEach(check => {
          console.log(`  • ${check.message}`);
        });
    }

    if (this.results.summary.warnings > 0) {
      console.log('\n⚠️ WARNINGS:');
      this.results.checks
        .filter(check => check.status === 'warning' || check.monitoring?.includes('⚠️'))
        .forEach(check => {
          const message = check.monitoring || check.message;
          console.log(`  • ${message}`);
        });
    }
  }

  saveResults() {
    const outputDir = path.join(process.cwd(), 'monitoring-results');
    const outputFile = path.join(outputDir, `auth-monitor-${Date.now()}.json`);

    try {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(outputFile, JSON.stringify(this.results, null, 2));
      console.log(`\n💾 Resultados guardados en: ${outputFile}`);
    } catch (error) {
      console.error(`❌ Error guardando resultados: ${error.message}`);
    }
  }
}

// CLI Interface
if (require.main === module) {
  const monitor = new AuthMonitor();

  monitor.run()
    .then(() => {
      const exitCode = monitor.results.summary.failed > 0 ? 1 : 0;
      process.exit(exitCode);
    })
    .catch(error => {
      console.error('❌ Error ejecutando monitor:', error);
      process.exit(1);
    });
}

module.exports = AuthMonitor;
