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
    ['no HTTP/2 and no cap by default', {}, {}, { http2: false, maxConnections: undefined }],
    ['the config over the defaults', { http2: true, maxConnections: 8 }, {}, { http2: true, maxConnections: 8 }],
    ['the environment over the defaults', {}, { UKC_HTTP2: '1', UKC_MAX_CONNECTIONS: '4' }, { http2: true, maxConnections: 4 }],
    ['no cap for UKC_MAX_CONNECTIONS=0', {}, { UKC_HTTP2: '1', UKC_MAX_CONNECTIONS: '0' }, { http2: true, maxConnections: undefined }],
    ['the config over the environment', { maxConnections: 3 }, { UKC_MAX_CONNECTIONS: '0' }, { http2: false, maxConnections: 3 }],
  ])('builds the SDK client with %s', async (_, config, envs, expected) => {
    for (const [name, value] of Object.entries(envs)) vi.stubEnv(name, value)
    await unikraft({ token: `t${++token}`, ...config }).sandbox.destroy('sandbox-uuid')

    expect(constructed.at(-1)).toMatchObject(expected)
  })
})
