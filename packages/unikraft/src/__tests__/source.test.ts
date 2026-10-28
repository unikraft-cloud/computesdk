import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UnikraftCloudError } from '@unikraft/cloud'
import { unikraft } from '../index'

// Every fake client forwards to these, so a test sets them before the create.
const platform = vi.hoisted(() => ({
  create: undefined as unknown as (spec: Record<string, unknown>, opts: Record<string, unknown>) => Promise<unknown>,
  checkpoints: undefined as unknown as (query: unknown) => Promise<unknown>,
}))

vi.mock('@unikraft/cloud', () => {
  class UnikraftCloudError extends Error {
    kind: string
    status?: number
    constructor(message: string, opts: { kind: string; status?: number }) {
      super(message)
      this.kind = opts.kind
      this.status = opts.status
    }
  }
  class UnikraftCloud {
    metro() {
      return {
        sandboxes: { create: (spec: Record<string, unknown>, opts: Record<string, unknown>) => platform.create(spec, opts) },
        api: { platform: { instances: { getCheckpointInstances: (query: unknown) => platform.checkpoints(query) } } },
      }
    }
  }
  return { DEFAULT_BOOT_TIMEOUT_S: 30, DEFAULT_METRO: 'fra', UnikraftCloud, UnikraftCloudError }
})

function fakeSandbox(exec = vi.fn(async () => ({ uuid: 'cmd', stdout: 'v24\n', stderr: '', exitcode: 0 }))) {
  return {
    uuid: 'sandbox-uuid',
    exec,
    ready: vi.fn(async () => {}),
    command: () => ({ delete: async () => {} }),
  }
}

// Each test names its own token, so it gets its own client and nothing that
// an earlier test taught the provider about a snapshot ID.
let token = 0
const config = (extra: Record<string, unknown> = {}) => ({ token: `t${++token}`, ...extra })

beforeEach(() => {
  vi.stubEnv('UKC_SANDBOX_SNAPSHOT', '')
  vi.stubEnv('UKC_SANDBOX_IMAGE', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('unikraft sandbox.create source', () => {
  it.each([
    ['a snapshotId as a template', {}, {}, { snapshotId: 'tpl' }, { template: { name: 'tpl' } }],
    ['a templateId as a template', {}, {}, { templateId: 'tpl' }, { template: { name: 'tpl' } }],
    [
      'a snapshot UUID by UUID',
      {},
      {},
      { snapshotId: '8d5da69a-4393-40ab-afef-789af091eb6c' },
      { template: { uuid: '8d5da69a-4393-40ab-afef-789af091eb6c' } },
    ],
    ['the config snapshot when the call names none', { snapshot: 'cfg' }, {}, {}, { template: { name: 'cfg' } }],
    ['UKC_SANDBOX_SNAPSHOT when the call names none', {}, { UKC_SANDBOX_SNAPSHOT: 'envsnap' }, {}, { template: { name: 'envsnap' } }],
    ['an image of the call over the default snapshot', { snapshot: 'cfg' }, {}, { image: 'img' }, { image: 'img' }],
    ['the config image over UKC_SANDBOX_SNAPSHOT', { image: 'img' }, { UKC_SANDBOX_SNAPSHOT: 'envsnap' }, {}, { image: 'img' }],
  ])('creates from %s', async (_, extra, envs, options, expected) => {
    for (const [name, value] of Object.entries(envs)) vi.stubEnv(name, value)
    const create = vi.fn(async () => fakeSandbox())
    platform.create = create
    await unikraft(config(extra)).sandbox.create(options)

    expect(create).toHaveBeenCalledTimes(1)
    const [spec, opts] = create.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>]
    expect(spec).toMatchObject(expected)
    const fromSnapshot = !('image' in expected)
    expect(spec).not.toHaveProperty(fromSnapshot ? 'image' : 'template')
    expect(opts.ready).toBe(fromSnapshot ? false : undefined)
  })

  it('creates from a checkpoint after the platform refuses it as a template, and remembers the kind', async () => {
    const create = vi.fn(async (spec: Record<string, unknown>) => {
      if ('template' in spec) throw new UnikraftCloudError('No instance template', { kind: 'http', status: 400 })
      return fakeSandbox()
    })
    const checkpoints = vi.fn(async () => ({ data: { instances: [{ state: 'checkpoint' }] } }))

    Object.assign(platform, { create, checkpoints })
    const provider = unikraft(config())
    await provider.sandbox.create({ snapshotId: 'ck' })
    await provider.sandbox.create({ snapshotId: 'ck' })

    expect(create.mock.calls.map(([spec]) => Object.keys(spec).find((k) => k === 'template' || k === 'checkpoint')))
      .toEqual(['template', 'checkpoint', 'checkpoint'])
    expect(checkpoints).toHaveBeenCalledWith({ name: ['ck'] })
    expect(checkpoints).toHaveBeenCalledTimes(1)
  })

  it('keeps the error of the platform when the snapshot ID is neither a template nor a checkpoint', async () => {
    const refused = new UnikraftCloudError('No instance template', { kind: 'http', status: 400 })
    platform.create = async () => {
      throw refused
    }
    platform.checkpoints = async () => ({ data: { instances: [{ status: 'error' }] } })

    await expect(unikraft(config()).sandbox.create({ snapshotId: 'nothing' })).rejects.toBe(refused)
  })
})

describe('unikraft runCommand on a sandbox from a snapshot', () => {
  it.each([
    ['waits for the plugin and runs again after a 502', 502, 2, 1],
    ['does not run again after a 500', 500, 1, 0],
  ])('%s', async (_, status, execs, readies) => {
    const exec = vi.fn(async () => ({ uuid: 'cmd', stdout: 'v24\n', stderr: '', exitcode: 0 }))
    exec.mockRejectedValueOnce(new UnikraftCloudError(`plugin ${status}`, { kind: 'http', status }))
    const sandbox = fakeSandbox(exec)
    platform.create = async () => sandbox
    const instance = await unikraft(config({ snapshot: 'tpl' })).sandbox.create()

    const run = instance.runCommand('node -v')
    if (status === 502) await expect(run).resolves.toMatchObject({ exitCode: 0, stdout: 'v24\n' })
    else await expect(run).rejects.toThrow(UnikraftCloudError)
    expect(exec).toHaveBeenCalledTimes(execs)
    expect(sandbox.ready).toHaveBeenCalledTimes(readies)
  })
})
