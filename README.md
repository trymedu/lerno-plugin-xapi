# @medu/lerno-plugin-xapi

xAPI (Experience API) telemetry for [Lerno](https://github.com/trymedu/lerno). The core emits
telemetry events and knows nothing about xAPI; this extension implements the sink contract and turns
each event into a statement for a Learning Record Store.

## Install

```bash
bun add @medu/lerno @medu/lerno-plugin-xapi
```

`@medu/lerno` is a peer dependency, so the plugin always runs against the engine version your
application already uses.

## Usage

```ts
import { createLerno } from '@medu/lerno';
import { xapiExtension } from '@medu/lerno-plugin-xapi';

const { host, registry } = createLerno({
  extensions: [
    xapiExtension({
      actor: { account: { homePage: 'https://example.org', name: 'student-1' } },
      activityId: 'https://example.org/lessons/fractions',
      send: (statement) => {
        void fetch('https://lrs.example.org/xapi/statements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(statement),
        });
      },
    }),
  ],
});
```

The extension wraps the sink the host already has: the previous sink is called first, so installing
it widens telemetry instead of replacing it.

## Statements

Each event becomes a statement whose object is `activityId#nodeId` (`#session` when the event carries
no node).

| Event | Verb |
| --- | --- |
| `session.started` | `initialized` |
| `session.completed` | `completed` |
| `node.visited` | `experienced` |
| `answered` | `answered` |
| `branch.chosen` | `interacted` |
| anything else | `experienced` |

`session.completed` sets `result.completion`. A boolean `correct` payload field sets
`result.success`. A numeric `score` payload field produces `result.score` with `scaled` normalized to
`0`–`1` by `maxScore`.

Verb display names are a language map, so an LRS dashboard can render them in English or Turkish.

## API

- `xapiExtension(options)`: the extension to pass to `createLerno`.
- `createXapiTelemetry(options)`: the same sink, without wrapping a host.
- `toXapiStatement(event, options)`: one event to one statement.
- `XAPI_VERBS`: the event-to-verb map, extendable before installing the extension.

## Develop

The engine is checked out as the `vendor/lerno` submodule.

```bash
git submodule update --init --recursive
bun install
bun run test
bun run build
```

`test`, `type-check`, and `build` build the engine package first, so the plugin always compiles
against current engine types.

## License

MIT
