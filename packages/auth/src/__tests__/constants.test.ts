import { describe, it, expect } from 'vitest'
import { APP_NAMES, type AppNameConstant } from '../constants'

describe('Auth Constants', () => {
  describe('APP_NAMES', () => {
    it('should have all 6 app names defined', () => {
      expect(Object.keys(APP_NAMES)).toHaveLength(6)
    })

    it('should have correct app name values', () => {
      expect(APP_NAMES.WEB_APP).toBe('web-app')
      expect(APP_NAMES.AUTH).toBe('auth')
      expect(APP_NAMES.PATIENTS).toBe('patients')
      expect(APP_NAMES.DOCTORS).toBe('doctors')
      expect(APP_NAMES.COMPANIES).toBe('companies')
      expect(APP_NAMES.ADMIN).toBe('admin')
    })

    it('should enforce AppNameConstant type', () => {
      const name: AppNameConstant = APP_NAMES.PATIENTS
      expect(name).toBe('patients')
    })
  })
})
