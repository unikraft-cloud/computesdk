import { afterEach, describe, expect, it, vi } from 'vitest'
import { unikraft } from '../index'

const constructed = vi.hoisted(() => [] as Record<string, unknown>[])

vi.mock('@unikraft/cloud', () => {
  class UnikraftCloudError extends Error {}
  class UnikraftCloud {
    constructor(options: Record<string, unknown>) {
      constructed.push(options)
    }
    metro() {
      return { instances: { delete: async () => {} } }
    }
  }
  return { DEFAULT_BOOT_TIMEOUT_S: 30, DEFAULT_METRO: 'fra', UnikraftCloud, UnikraftCloudError }
})

// Each test names its own token, so it builds its own client.
let token = 0

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('unikraft client options', () => {
  it.each([
    [
      'no HTTP/2, no cap, no worker, no early connection and no create pace by default',
      {},
      {},
      { http2: false, maxConnections: undefined, http2Worker: false, preconnect: false, maxCreatesPerMs: undefined },
    ],
    ['the config over the defaults', { http2: true, maxConnections: 8 }, {}, { http2: true, maxConnections: 8 }],
    ['the environment over the defaults', {}, { UKC_HTTP2: '1', UKC_MAX_CONNECTIONS: '4' }, { http2: true, maxConnections: 4 }],
    ['no cap for UKC_MAX_CONNECTIONS=0', {}, { UKC_HTTP2: '1', UKC_MAX_CONNECTIONS: '0' }, { http2: true, maxConnections: undefined }],
    ['the config over the environment', { maxConnections: 3 }, { UKC_MAX_CONNECTIONS: '0' }, { http2: false, maxConnections: 3 }],
    [
      'the worker, the early connection and the create pace of the config',
      { http2Worker: true, preconnect: true, maxCreatesPerMs: 4 },
      {},
      { http2Worker: true, preconnect: true, maxCreatesPerMs: 4 },
    ],
    [
      'the worker and the create pace of the environment',
      {},
      { UKC_HTTP2_WORKER: '1', UKC_MAX_CREATES_PER_MS: '4' },
      { http2Worker: true, preconnect: false, maxCreatesPerMs: 4 },
    ],
  ])('builds the SDK client with %s', async (_, config, envs, expected) => {
    for (const [name, value] of Object.entries(envs)) vi.stubEnv(name, value)
    await unikraft({ token: `t${++token}`, ...config }).sandbox.destroy('sandbox-uuid')

    expect(constructed.at(-1)).toMatchObject(expected)
  })
})

describe('unikraft client at import', () => {
  it.each([
    ['makes the client, and the first call gets it, with UKC_PRECONNECT and UKC_TOKEN', { UKC_PRECONNECT: '1', UKC_TOKEN: 'env-token' }, 1],
    ['makes no client without UKC_PRECONNECT', { UKC_TOKEN: 'env-token' }, 0],
    ['makes no client without UKC_TOKEN', { UKC_PRECONNECT: '1', UKC_TOKEN: '' }, 0],
  ])('%s', async (_, envs, atImport) => {
    for (const [name, value] of Object.entries(envs)) vi.stubEnv(name, value)
    vi.resetModules()
    const before = constructed.length
    const fresh = await import('../index')

    expect(constructed.length - before).toBe(atImport)
    if (atImport) {
      expect(constructed.at(-1)).toMatchObject({ token: 'env-token', preconnect: true })
      await fresh.unikraft({}).sandbox.destroy('sandbox-uuid')
      expect(constructed.length - before).toBe(atImport)
    }
  })
})
