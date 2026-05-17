# MyClaw

MyClaw is a local-first Node.js workflow and agent runtime in early Phase 0.7.

Current runnable surface:

```bash
npm run myclaw -- doctor
npm run myclaw -- channels
npm run myclaw -- send --text "hello"
npm run myclaw -- receive --from local-user --conversation local-thread --text "hello" --reply "received"
npm run myclaw -- dashboard --port 4321
npm run myclaw -- gateway --port 4321
npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw
npm run myclaw -- migrate openclaw --source /Users/yanfenma/workspace/github/openclaw --stage
```

The first channel implementation is intentionally small:

- `console`: local inbound/outbound channel for verifying the message pipeline.
- `webhook`: generic HTTP POST channel.
- `feishu-webhook`: minimal Feishu/Lark custom-bot webhook payload shape.
- `feishu-event`: inbound Feishu/Lark event normalizer for gateway callbacks.

The later OpenClaw Feishu/Lark plugin integration should attach behind the same channel boundary instead of changing CLI commands.

Dashboard:

- `dashboard`: read-only local web console for state, runs, events, channel capabilities, OpenClaw migration readiness, Feishu/Lark adoption decision, and OpenClaw/Hermes-agent/OpenHuman module completion.

Gateway:

- `gateway`: local HTTP control surface. Phase 0.7 supports `GET /api/status`, `GET /api/reference-completion`, `GET /api/feishu-adoption`, `GET /api/health`, `POST /messages`, `POST /feishu/events`, and `POST /api/openclaw-migration/stage`.
- Mutations stay open only for loopback development. Set `MYCLAW_GATEWAY_TOKEN` or pass `--token` before exposing the gateway beyond `127.0.0.1`.

Feishu/Lark:

- The OpenClaw Feishu package at `/Users/yanfenma/workspace/github/openclaw/extensions/feishu` is a strong reference, but MyClaw does not directly load it in Phase 0.7.
- MyClaw now has a local `packages/feishu-adapter` facade for config readiness, x-lark signature validation, replay guard, token verification, and event normalization.
- Direct loading is deferred because the plugin depends on OpenClaw plugin-sdk/runtime/config/secrets/approval contracts that MyClaw has not implemented yet.

Feishu event callback smoke test:

```bash
curl -sS http://127.0.0.1:4321/feishu/events \
  -H 'content-type: application/json' \
  -d '{"challenge":"plain_challenge"}'
```

Migration:

- `migrate openclaw`: dry-run inventory for OpenClaw config, channels, plugin manifests, unsupported runtime surfaces, and a MyClaw draft mapping. It does not mutate OpenClaw or MyClaw state by default.
- `migrate openclaw --stage`: writes a reviewable stage snapshot into MyClaw state. It still does not apply runtime config.

Stage discipline:

- Every implementation phase updates the design review HTML and compares MyClaw module completion against OpenClaw, Hermes-agent, and OpenHuman.
- `npm run check` enforces the 500-line single-file limit.
