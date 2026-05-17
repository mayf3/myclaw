# MyClaw

MyClaw is a local-first Node.js workflow and agent runtime in early Phase 0.

Current runnable surface:

```bash
npm run myclaw -- doctor
npm run myclaw -- channels
npm run myclaw -- send --text "hello"
npm run myclaw -- receive --from local-user --conversation local-thread --text "hello" --reply "received"
npm run myclaw -- dashboard --port 4321
npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw
```

The first channel implementation is intentionally small:

- `console`: local inbound/outbound channel for verifying the message pipeline.
- `webhook`: generic HTTP POST channel.
- `feishu-webhook`: minimal Feishu/Lark custom-bot webhook payload shape.

The later OpenClaw Feishu/Lark plugin integration should attach behind the same channel boundary instead of changing CLI commands.

Dashboard:

- `dashboard`: local web console for state, runs, events, channel capabilities, and OpenClaw migration readiness.

Migration:

- `migrate openclaw`: dry-run inventory for OpenClaw config, channels, plugin manifests, unsupported runtime surfaces, and a MyClaw draft mapping. It does not mutate OpenClaw or MyClaw state by default.
