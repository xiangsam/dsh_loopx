import { describe, expect, it } from 'vitest'
import {
  isSupportedDshVersion,
  runningDshVersion,
  SUPPORTED_DSH_RANGE,
  TESTED_DSH_VERSIONS,
  warnOnUnsupportedDsh,
} from '../src/compat.ts'

describe('dsh runtime compatibility gate', () => {
  it('accepts the whole verified 0.1.x line', () => {
    for (const version of ['0.1.0-rc.7', '0.1.1-rc.2', '0.1.5-alpha.2', '0.1.5', '0.1.9']) {
      expect(isSupportedDshVersion(version), version).toBe(true)
    }
  })

  it('rejects every other line', () => {
    for (const version of ['0.0.9', '0.2.0-rc.1', '0.2.0', '1.0.0', 'not-a-version']) {
      expect(isSupportedDshVersion(version), version).toBe(false)
    }
  })

  it('reads the installed dsh version of this checkout', () => {
    const version = runningDshVersion()
    expect(version).toMatch(/^\d+\.\d+\.\d+/u)
    // The pinned devDependency is the smoke baseline and must stay supported.
    expect(isSupportedDshVersion(version ?? '')).toBe(true)
    expect(SUPPORTED_DSH_RANGE).toContain('<0.2.0-0')
    expect(TESTED_DSH_VERSIONS.length).toBeGreaterThan(0)
  })

  it('warns on an unsupported runtime and stays silent otherwise', () => {
    const errors: string[] = []
    const ctx = { logger: { error: (message: string) => errors.push(message) } }
    warnOnUnsupportedDsh(ctx)
    // The checkout itself is supported, so the gate is silent here.
    expect(errors).toEqual([])

    warnOnUnsupportedDsh(ctx, '0.2.0-rc.1')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('unsupported dsh version 0.2.0-rc.1')
    expect(errors[0]).toContain('0.1.5-alpha.2')

    warnOnUnsupportedDsh(ctx, undefined)
    expect(errors).toHaveLength(1)
  })
})
