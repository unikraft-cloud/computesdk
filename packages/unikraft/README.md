# @computesdk/unikraft

Unikraft Cloud provider for ComputeSDK. Each sandbox is a microVM on [Unikraft Cloud](https://unikraft.cloud) with the sandbox plugin attached. A sandbox boots from a container image in milliseconds.

## Installation

```bash
npm install @computesdk/unikraft
```

## Setup

1. Create an account at [console.unikraft.cloud](https://console.unikraft.cloud) and copy an API token.
2. Set the environment variables:

```bash
export UKC_TOKEN=your_unikraft_cloud_token
export UKC_METRO=fra
```

`UKC_METRO` is optional. It names the metro, which is the data center that runs your sandboxes. Without it, the provider uses the default metro of the Unikraft Cloud SDK.

## Quick start

Configure `compute` with the Unikraft Cloud provider and create a sandbox:

```typescript
import { compute } from 'computesdk';
import { unikraft } from '@computesdk/unikraft';

compute.setConfig({
  provider: unikraft({ token: process.env.UKC_TOKEN }),
});

const sandbox = await compute.instances.create();

const result = await sandbox.runCommand('echo "Hello from Unikraft Cloud"');
console.log(result.stdout);

await sandbox.destroy();
```

You can also call the provider directly when you need only one provider:

```typescript
import { unikraft } from '@computesdk/unikraft';

const sdk = unikraft({ token: process.env.UKC_TOKEN, metro: 'fra' });
const sandbox = await sdk.instances.create({ image: 'my-org/sandbox-base:latest' });
```

## Configuration

### Environment variables

| Variable | Meaning |
|---|---|
| `UKC_TOKEN` | API token. Required unless you pass `token`. |
| `UKC_METRO` | Metro code, for example `fra`, or the full API URL of a deployment. |
| `UKC_SANDBOX_IMAGE` | Image for a sandbox whose create call names none. |
| `UKC_SANDBOX_SNAPSHOT` | Instance template or checkpoint, by UUID or by name, for a sandbox whose create call names no source. The provider uses it only when the config sets neither `snapshot` nor `image`, and it comes before `UKC_SANDBOX_IMAGE`. |
| `UKC_SANDBOX_ROM` | Sandbox plugin ROM, for example `plugins/sandbox:1.2.0`. The default is `plugins/sandbox:latest`, the default of the Unikraft Cloud SDK. |
| `UKC_HTTP2` | Offer HTTP/2 to the API host. Off by default; `1` turns it on. |
| `UKC_MAX_CONNECTIONS` | The most connections the SDK opens to the API host at once. No cap by default. Set it only for a host that answers HTTP/2: a host on HTTP/1.1 runs at most this many requests at once. |

### Configuration options

```typescript
interface UnikraftConfig {
  /** API token. If absent, the provider reads `UKC_TOKEN`. */
  token?: string;
  /** Metro code, for example `fra`, or the full API URL of a deployment. If absent, the provider reads `UKC_METRO`. */
  metro?: string;
  /** Image for a sandbox whose create call names none. If absent, the provider reads `UKC_SANDBOX_IMAGE`. */
  image?: string;
  /**
   * Instance template or checkpoint, by UUID or by name, for a sandbox whose create call names no source.
   * If absent, and `image` is absent too, the provider reads `UKC_SANDBOX_SNAPSHOT`.
   */
  snapshot?: string;
  /** Sandbox plugin ROM. If absent, the provider reads `UKC_SANDBOX_ROM`. */
  rom?: string;
  /** Memory for each sandbox, in MiB, if the create call names none. */
  memoryMb?: number;
  /** vCPUs for each sandbox, if the create call names none. */
  vcpus?: number;
  /** Default `runCommand` timeout, in milliseconds. Without it, a command runs until it exits. */
  timeout?: number;
}
```

### Create options

```typescript
const sandbox = await sdk.instances.create({
  image: 'my-org/sandbox-base:latest', // The default is `debian-slim:latest`.
  memoryMb: 1024,
  vcpus: 2,
  envs: { NODE_ENV: 'production' },
  name: 'build-42',
});

// Resume a snapshot instead of booting an image.
const clone = await sdk.instances.create({ snapshotId: 'my-template' });
```

`snapshotId` names an instance template or a checkpoint, by UUID or by name. `templateId` names an instance template. A sandbox from a snapshot takes the image, the size, and the plugin of the snapshot, so do not pass `image`, `memoryMb`, or `vcpus` with it.

The provider tries `snapshotId` as an instance template first. If the platform refuses it, the provider asks the platform if the ID names a checkpoint, and if it does, creates the sandbox from the checkpoint. The provider remembers which kind each ID is, so these extra requests occur only once for each ID.

### Snapshots

A sandbox from a snapshot resumes the memory of a running sandbox, so it does not boot, and its first command runs from memory. This is the fastest way to create a sandbox. The provider does not wait for the sandbox plugin before it returns such a sandbox, because the platform holds the first plugin request until the plugin is ready.

To make a snapshot, run the script in this package once on each metro. It creates a sandbox from an image, runs one command in it, saves the sandbox as an instance template, and prints its UUID:

```bash
UKC_TOKEN=... UKC_METRO=fra \
  node --experimental-strip-types scripts/make-snapshot.mts \
  --image my-org/sandbox-base:latest --memory 512
```

Pass `--kind checkpoint` to save a checkpoint instead. The snapshot has no autokill, so delete it when you no longer need it. Then set `UKC_SANDBOX_SNAPSHOT` to the UUID, or pass it as `snapshot` or `snapshotId`.

## Features

- Command execution with `cwd`, `env`, `timeout`, and `background`
- Filesystem access: `readFile`, `writeFile`, and `mkdir` use the file API of the sandbox plugin; `readdir`, `exists`, and `remove` run shell commands
- Instance templates and checkpoints through `snapshotId`, `templateId`, `snapshot`, and `UKC_SANDBOX_SNAPSHOT`
- `getInstance()` returns the `Sandbox` object of `@unikraft/cloud`, which gives you the full platform API

## Limitations

- The sandbox plugin runs each command as `root` with an empty environment. The provider adds `HOME=/root` and the `envs` of the create call to every command.
- A command that runs past its `timeout` returns exit code 124. The provider then stops it with `SIGKILL`.
- `getUrl` needs a sandbox that was created with a `service_group` that publishes the port. Without one, it throws.
- Live output callbacks (`onStdout`, `onStderr`) are not supported.
- The writable layer of a sandbox is memory. Files that a command writes count against `memoryMb`.

## Links

- [Unikraft Cloud documentation](https://unikraft.com/docs)
- [ComputeSDK documentation](https://www.computesdk.com)
