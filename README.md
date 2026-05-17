# MyClaw

MyClaw is a local-first Node.js workflow and agent runtime in early Phase 0.

Current runnable surface:

```bash
npm run myclaw -- doctor
npm run myclaw -- channels
npm run myclaw -- send --text "hello"
npm run myclaw -- receive --from local-user --conversation local-thread --text "hello" --reply "received"
npm run myclaw -- dashboard --port 4321
npm run myclaw -- gateway --port 4321
npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw
```

The first channel implementation is intentionally small:

- `console`: local inbound/outbound channel for verifying the message pipeline.
- `webhook`: generic HTTP POST channel.
- `feishu-webhook`: minimal Feishu/Lark custom-bot webhook payload shape.
- `feishu-event`: inbound Feishu/Lark event normalizer for gateway callbacks.

The later OpenClaw Feishu/Lark plugin integration should attach behind the same channel boundary instead of changing CLI commands.

Dashboard:

- `dashboard`: local web console for state, runs, events, channel capabilities, OpenClaw migration readiness, and the gateway `/messages` endpoint.

Gateway:

- `gateway`: local HTTP control surface. Phase 0.4 supports `GET /api/status`, `GET /api/health`, `POST /messages`, and `POST /feishu/events`.

Feishu event callback smoke test:

```bash
curl -sS http://127.0.0.1:4321/feishu/events \
  -H 'content-type: application/json' \
  -d '{"challenge":"plain_challenge"}'
```

Migration:

- `migrate openclaw`: dry-run inventory for OpenClaw config, channels, plugin manifests, unsupported runtime surfaces, and a MyClaw draft mapping. It does not mutate OpenClaw or MyClaw state by default.
