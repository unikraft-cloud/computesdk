/**
 * Make the snapshot that `UKC_SANDBOX_SNAPSHOT` names, and print its UUID.
 *
 * The script creates one sandbox from an image, runs one command in it so that
 * the files of that command are in memory, and saves the running sandbox as an
 * instance template (the default) or as a checkpoint. A sandbox created from
 * the snapshot resumes that memory, so it does not boot. The snapshot has no
 * autokill, so it stays until you delete it.
 *
 * Not a unit test and not in CI: it creates a real sandbox and needs a real
 * token. Run it once on each metro.
 *
 *   UKC_TOKEN=... UKC_METRO=fra \
 *     node --experimental-strip-types scripts/make-snapshot.mts \
 *     --image demo/sandbox-node:latest --rom plugins/sandbox:1.2.0 --memory 512
 *
 * Options: --kind template|checkpoint, --image, --rom, --memory (MiB),
 * --warm (the command to run first, default `node -v`), --name.
 */

import { parseArgs } from 'node:util'
import { UnikraftCloud } from '@unikraft/cloud'

const { values: args } = parseArgs({
  options: {
    kind: { type: 'string', default: 'template' },
    image: { type: 'string' },
    rom: { type: 'string' },
    memory: { type: 'string', default: '512' },
    warm: { type: 'string', default: 'node -v' },
    name: { type: 'string' },
  },
})

const token = process.env.UKC_TOKEN
const metro = process.env.UKC_METRO
if (!token || !metro) throw new Error('Set UKC_TOKEN and UKC_METRO.')
if (args.kind !== 'template' && args.kind !== 'checkpoint') {
  throw new Error(`--kind is "template" or "checkpoint", not "${args.kind}".`)
}

const ukc = new UnikraftCloud({ token, metro }).metro(metro)
const sandbox = await ukc.sandboxes.create({
  ...(args.image ? { image: args.image } : {}),
  ...(args.rom ? { rom: args.rom } : {}),
  memory_mb: Number(args.memory),
  // A template takes the name of its source instance.
  ...(args.name && args.kind === 'template' ? { name: args.name } : {}),
})
console.error(`sandbox ${sandbox.uuid}`)

let snapshot: string | undefined
try {
  const warm = await sandbox.exec(args.warm)
  if (warm.exitcode !== 0) throw new Error(`\`${args.warm}\` exited with ${warm.exitcode}: ${warm.stderr}`)
  console.error(`${args.warm}: ${warm.stdout.trim()}`)

  const result =
    args.kind === 'template'
      ? await ukc.api.platform.instances.createTemplateInstances({
          body: [{ uuid: sandbox.uuid, timeout_s: 60, autokill: { time_ms: 0 } }],
        })
      : await ukc.api.platform.instances.createCheckpointInstances({
          body: [
            {
              from: { uuid: sandbox.uuid },
              ...(args.name ? { name: args.name } : {}),
              timeout_s: 60,
              autokill: { time_ms: 0 },
            },
          ],
        })
  const item = result.data?.instances?.[0]
  if (item?.status !== 'success' || !item.uuid) {
    throw new Error(`The platform did not make the ${args.kind}: ${JSON.stringify(result)}`)
  }
  snapshot = item.uuid
} finally {
  // The template is the sandbox itself, so only a checkpoint, or a failure,
  // leaves a sandbox to delete.
  if (args.kind === 'checkpoint' || snapshot === undefined) await sandbox.delete()
}

console.error(`${args.kind} ${snapshot}`)
console.log(snapshot)
