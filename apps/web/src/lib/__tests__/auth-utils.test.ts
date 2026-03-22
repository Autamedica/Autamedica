import { describe, it, expect } from 'vitest';
import { validateRedirectUrl } from '../auth-utils';

describe('validateRedirectUrl', () => {
  describe('allowed production hosts', () => {
    it('accepts autamedica.com', () => {
      expect(validateRedirectUrl('https://autamedica.com/dashboard')).toBe(true);
    });

    it('accepts www.autamedica.com', () => {
      expect(validateRedirectUrl('https://www.autamedica.com/profile')).toBe(true);
    });

    it('accepts subdomain doctors.autamedica.com', () => {
      expect(validateRedirectUrl('https://doctors.autamedica.com/')).toBe(true);
    });

    it('accepts subdomain patients.autamedica.com', () => {
      expect(validateRedirectUrl('https://patients.autamedica.com/appointments')).toBe(true);
    });

    it('accepts subdomain companies.autamedica.com', () => {
      expect(validateRedirectUrl('https://companies.autamedica.com/')).toBe(true);
    });

    it('accepts subdomain admin.autamedica.com', () => {
      expect(validateRedirectUrl('https://admin.autamedica.com/')).toBe(true);
    });
  });

  describe('allowed Cloudflare Pages hosts', () => {
    it('accepts autamedica-doctors.pages.dev', () => {
      expect(validateRedirectUrl('https://autamedica-doctors.pages.dev/login')).toBe(true);
    });

    it('accepts autamedica-patients.pages.dev', () => {
      expect(validateRedirectUrl('https://autamedica-patients.pages.dev/')).toBe(true);
    });

    it('accepts autamedica-web-app.pages.dev', () => {
      expect(validateRedirectUrl('https://autamedica-web-app.pages.dev/')).toBe(true);
    });

    it('accepts arbitrary autamedica-*.pages.dev via pattern', () => {
      expect(validateRedirectUrl('https://autamedica-preview-123.pages.dev/')).toBe(true);
    });
  });

  describe('allowed localhost', () => {
    it('accepts localhost on allowed port 3000', () => {
      expect(validateRedirectUrl('http://localhost:3000/')).toBe(true);
    });

    it('accepts localhost on allowed port 3001', () => {
      expect(validateRedirectUrl('http://localhost:3001/dashboard')).toBe(true);
    });

    it('accepts localhost without port', () => {
      expect(validateRedirectUrl('http://localhost/')).toBe(true);
    });

    it('accepts 127.0.0.1 on allowed port', () => {
      expect(validateRedirectUrl('http://127.0.0.1:3000/')).toBe(true);
    });

    it('rejects localhost on disallowed port', () => {
      expect(validateRedirectUrl('http://localhost:8080/')).toBe(false);
    });

    it('rejects 127.0.0.1 on disallowed port', () => {
      expect(validateRedirectUrl('http://127.0.0.1:9999/')).toBe(false);
    });
  });

  describe('rejected hosts', () => {
    it('rejects unknown external domain', () => {
      expect(validateRedirectUrl('https://evil.com/steal-cookies')).toBe(false);
    });

    it('rejects similar-looking domain', () => {
      expect(validateRedirectUrl('https://not-autamedica.com/')).toBe(false);
    });

    it('rejects subdomain impersonation that does not end with .autamedica.com', () => {
      expect(validateRedirectUrl('https://autamedica.com.evil.com/')).toBe(false);
    });
  });

  describe('invalid inputs', () => {
    it('rejects non-http protocol (javascript:)', () => {
      expect(validateRedirectUrl('javascript:alert(1)')).toBe(false);
    });

    it('rejects data: URI', () => {
      expect(validateRedirectUrl('data:text/html,<h1>hi</h1>')).toBe(false);
    });

    it('rejects non-URL string', () => {
      expect(validateRedirectUrl('not-a-url')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(validateRedirectUrl('')).toBe(false);
    });
  });

  describe('wildcard subdomain pattern (.autamedica.com)', () => {
    it('accepts any subdomain of autamedica.com', () => {
      expect(validateRedirectUrl('https://staging.autamedica.com/')).toBe(true);
    });

    it('accepts deeply nested subdomain of autamedica.com', () => {
      expect(validateRedirectUrl('https://preview.staging.autamedica.com/')).toBe(true);
    });
  });
});
