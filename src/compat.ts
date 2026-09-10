import { createRequire } from 'node:module'

/**
 * dsh releases this plugin is built and verified against. Keep in sync with
 * `peerDependencies["@deepseek-ai/dsh"]`, the `dsh.compatibility` manifest
 * field, and the README compatibility table.
 */
export const TESTED_DSH_VERSIONS = ['0.1.1-rc.2', '0.1.5-alpha.2'] as const
/** The declared support window; the 0.1.x line. */
export const SUPPORTED_DSH_RANGE = '>=0.1.1-rc.1 <0.2.0-0'

/** Best-effort read of the dsh version this profile booted under. */
export function runningDshVersion(): string | undefined {
  try {
    const require = createRequire(import.meta.url)
    const manifest = require('@deepseek-ai/dsh/package.json') as { version?: unknown }
    return typeof manifest.version === 'string' ? manifest.version : undefined
  } catch {
    return undefined
  }
}

/**
 * Whether a dsh version sits inside the verified window. The plugin is
 * published for the 0.1.x line, so every 0.1 release (stable or prerelease)
 * is accepted and every other line is not.
 */
export function isSupportedDshVersion(version: string): boolean {
  const [core = ''] = version.split('-', 1)
  const [major, minor] = core.split('.').map(Number)
  return major === 0 && minor === 1
}

/**
 * Warn once when the running dsh is outside the verified window. Never
 * throws: a mismatched profile must still boot so the message is readable
 * and `/loopx-init` stays reachable.
 *
 * @param ctx - plugin context carrying the logger.
 * @param version - running dsh version; defaults to the installed manifest.
 */
export function warnOnUnsupportedDsh(
  ctx: { logger: { error(message: string): void } },
  version: string | undefined = runningDshVersion(),
): void {
  if (version === undefined || isSupportedDshVersion(version)) return
  ctx.logger.error(
    `dsh-loopx-plugin: unsupported dsh version ${version}; this release is verified against dsh `
    + `${TESTED_DSH_VERSIONS.join(' and ')} (supported range ${SUPPORTED_DSH_RANGE}). `
    + 'The GoalBar may misbehave — install a matching dsh release.',
  )
}
