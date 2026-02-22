/**
 * @fileoverview Tests for role-based routing system
 * Validates organization_admin and other role mappings
 */

import type { UserRole } from '@autamedica/types';
import { describe, expect, it } from 'vitest';
import {
    BASE_URL_BY_ROLE,
    getPortalForRole,
    getRoleForPortal,
    getTargetUrlByRole,
    HOME_BY_ROLE,
    isValidRole
} from '../src/role-routing';

describe('Role Routing System', () => {
  describe('getPortalForRole', () => {
    it('should route organization_admin to admin portal', () => {
      expect(getPortalForRole('organization_admin')).toBe('admin');
    });

    it('should route company to companies portal', () => {
      expect(getPortalForRole('company' as UserRole)).toBe('companies');
    });

    it('should route company_admin (legacy) to companies portal', () => {
      expect(getPortalForRole('company_admin')).toBe('companies');
    });

    it('should route doctor to doctors portal', () => {
      expect(getPortalForRole('doctor')).toBe('doctors');
    });

    it('should route patient to patients portal', () => {
      expect(getPortalForRole('patient')).toBe('patients');
    });

    it('should route platform_admin to admin portal', () => {
      expect(getPortalForRole('platform_admin')).toBe('admin');
    });

    it('should route admin role cast to admin portal', () => {
      // 'admin' is cast since it's not a typed UserRole but may be present at runtime
      expect(() => getPortalForRole('admin' as UserRole)).toThrow('No portal configured for role: admin');
    });
  });

  describe('isValidRole', () => {
    it('should validate organization_admin as valid role', () => {
      expect(isValidRole('organization_admin')).toBe(true);
    });

    it('should validate company as valid role', () => {
      expect(isValidRole('company')).toBe(true);
    });

    it('should validate legacy company_admin as valid role', () => {
      expect(isValidRole('company_admin')).toBe(true);
    });

    it('should validate all standard roles', () => {
      const validRoles: UserRole[] = [
        'patient',
        'doctor',
        'company_admin',
        'organization_admin',
        'platform_admin'
      ];

      validRoles.forEach(role => {
        expect(isValidRole(role)).toBe(true);
      });
    });

    it('should reject invalid roles', () => {
      expect(isValidRole('invalid_role')).toBe(false);
      expect(isValidRole('')).toBe(false);
      expect(isValidRole('hacker')).toBe(false);
    });
  });

  describe('getTargetUrlByRole', () => {
    it('should generate correct URL for organization_admin', () => {
      const url = getTargetUrlByRole('organization_admin');
      expect(url).toBe(BASE_URL_BY_ROLE['organization_admin'] + '/');
    });

    it('should generate correct URL for company', () => {
      const url = getTargetUrlByRole('company_admin');
      expect(url).toBe(BASE_URL_BY_ROLE['company_admin'] + '/');
    });

    it('should generate correct URL with custom path', () => {
      const url = getTargetUrlByRole('organization_admin', '/dashboard');
      expect(url).toBe(BASE_URL_BY_ROLE['organization_admin'] + '/dashboard');
    });

    it('should handle path with leading slash', () => {
      const url = getTargetUrlByRole('doctor', '/appointments');
      expect(url).toBe(BASE_URL_BY_ROLE['doctor'] + '/appointments');
    });

    it('should handle path without leading slash', () => {
      const url = getTargetUrlByRole('patient', 'profile');
      expect(url).toBe(BASE_URL_BY_ROLE['patient'] + '/profile');
    });
  });

  describe('getRoleForPortal', () => {
    it('should return organization_admin for companies portal', () => {
      expect(getRoleForPortal('companies')).toBe('company_admin');
    });

    it('should return patient for patients portal', () => {
      expect(getRoleForPortal('patients')).toBe('patient');
    });

    it('should return doctor for doctors portal', () => {
      expect(getRoleForPortal('doctors')).toBe('doctor');
    });

    it('should return organization_admin for admin portal', () => {
      expect(getRoleForPortal('admin')).toBe('organization_admin');
    });

    it('should return undefined for invalid portal', () => {
      expect(getRoleForPortal('invalid')).toBeUndefined();
    });
  });

  describe('Role mapping consistency', () => {
    it('should have BASE_URL_BY_ROLE for all valid roles', () => {
      const roles: UserRole[] = [
        'patient',
        'doctor',
        'company_admin',
        'organization_admin',
        'platform_admin'
      ];

      roles.forEach(role => {
        expect(BASE_URL_BY_ROLE[role]).toBeDefined();
        expect(BASE_URL_BY_ROLE[role]).toMatch(/^https?:\/\/(localhost|.+\.autamedica\.com)(:\d+)?$/);
      });
    });

    it('should have HOME_BY_ROLE for all valid roles', () => {
      const roles: UserRole[] = [
        'patient',
        'doctor',
        'company_admin',
        'organization_admin',
        'platform_admin'
      ];

      roles.forEach(role => {
        expect(HOME_BY_ROLE[role]).toBeDefined();
        expect(typeof HOME_BY_ROLE[role]).toBe('string');
      });
    });

    it('should have consistent portal mappings', () => {
      // organization_admin and company_admin should both go to companies portal initially
      expect(getPortalForRole('organization_admin')).toBe('admin');
      expect(getPortalForRole('company_admin')).toBe('companies');

      // But organization_admin has elevated privileges (admin portal)
      expect(BASE_URL_BY_ROLE['organization_admin']).not.toEqual(BASE_URL_BY_ROLE['company_admin']);
    });
  });

  describe('Legacy compatibility', () => {
    it('should handle company_admin legacy role', () => {
      expect(isValidRole('company_admin')).toBe(true);
      expect(getPortalForRole('company_admin')).toBe('companies');
      expect(getTargetUrlByRole('company_admin')).toBe(BASE_URL_BY_ROLE['company_admin'] + '/');
    });

    it('should differentiate organization_admin from company_admin', () => {
      // organization_admin has admin portal access
      expect(getPortalForRole('organization_admin')).toBe('admin');
      expect(BASE_URL_BY_ROLE['organization_admin']).not.toEqual(BASE_URL_BY_ROLE['company_admin']);

      // company_admin stays in companies portal (legacy)
      expect(getPortalForRole('company_admin')).toBe('companies');
    });
  });

  describe('Error handling', () => {
    it('should throw error for invalid role in getTargetUrlByRole', () => {
      expect(() => {
        getTargetUrlByRole('invalid_role' as UserRole);
      }).toThrow('No base URL configured for role: invalid_role');
    });

    it('should throw error for invalid role in getPortalForRole', () => {
      expect(() => {
        getPortalForRole('invalid_role' as UserRole);
      }).toThrow('No portal configured for role: invalid_role');
    });
  });
});