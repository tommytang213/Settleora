# Issue #299 dashboard metric actionability evidence

Task key: `20260909-0056`. These 10 production-widget captures were generated from the final reviewed implementation source and inspected at original resolution. The tracked copies under [`32f3f504/`](32f3f504/) make the final evidence self-contained.

## Accepted Option 3 contract

- Issue comment `5588938396` preserves the hero review total exactly as settlement actions + upcoming recurring forecast/draft opportunities + notification attention + notification urgent. The production structure is static: no callback, button semantics, keyboard activation, tooltip or destination.
- Active bills opens the existing personal Bills view with Active selected; Unread opens Notification Center with Unread selected; You owe opens Settlements with Outgoing selected; You're owed opens Settlements with Incoming selected. Zero-count actions open the same truthful filtered empty views.
- Each destination's typed presentation seam defaults to All for existing callers and initializes only screen state; users can still switch or clear filters. Settlement direction applies to balances and requests. Notification filtering stays the explicitly approved existing client-side discovery behavior and adds no backend query semantics.
- Navigation triggers no domain mutation. In particular, the dashboard Bills path disables pending-sync auto-flush while all existing callers retain the prior default. Money values, currencies and captions are unchanged.
- Accounts & income remains unchanged under More, including its unavailable fallback. Issue #295 retains broader IA/navigation ownership. No shared component, API, generated client, auth/session/authz, calculation, schema, deployment or secret changed.

## Candidate and convergence

- Final source `32f3f504e965858273208963d75d013c94ad692a`, tree `8e54f36e2227ffb49a226dcbef80b35e288c2e28`, implementation PR #1156, normal merge `72ee4224b1edcdf6d08a2723003b2a770470271b`.
- Doctor, pub get and analyzer passed; 358 focused dashboard/Bills/Notifications/Settlements/semantics/visual/shared-component tests and 1,066 full mobile tests passed; scaffold validated 19 paths; diff check passed. The generic M15 scope guard surfaced the nine explicitly task-authorized mobile paths for manual review because its active allowlist is docs/control-only.
- Final Gemini `strong_independent`: `/workspace/logs/issue-299-gemini-review-20260909-0108.json`; independent local Codex: `/workspace/logs/issue-299-local-codex-32f3f504.log`. Both approved exact source and images with zero findings.
- GitHub Codex findings led to semantic-action/value corrections and direction-filtered settlement balances. Its server unread-query suggestion conflicted with the approved existing-client-filter/no-backend-query contract and was documented without changing authority. A fresh exact-head GitHub review found no major issues. All 11 CI/scanner checks passed, all three review threads were resolved and relevant open code-scanning alerts were zero.

## Capture SHA-256

```text
45496ebc033c9d64f25855ec310b00f0644252262e6ca24801a3577fdd244eff  bills-active-320x844-2x.png
c7d03334bbd4340b44d96c56fd474cc5fef007276b64868974980a8b3cd3def1  bills-active-390x844-1x.png
453a2880bade8cae258f648694dc139395426cff4bd8b49af0bd4eb00bf794ac  home-active-bills-focused-390x844-1x.png
22298ba67946c6408be0f6b6cf83361d8c497ba815b0a9f11c9766d07ea4712c  home-money-summary-focused-390x844-1x.png
4889fb5ad6e00e0a11dcb553abc2bc0671a5db10b8ee27eabb4d4fa317bfd602  home-nonzero-320x844-2x.png
ea929bbd4d72251e63edc0cdcf3b81d78d4798f51fdae7d9af5ce1b9214458db  home-nonzero-390x844-1x.png
b738951fcab1f456c4dd67fd569017b294d81abbd7a5a9dd57fe5b15f46bba89  home-zero-390x844-1x.png
657cd007e208ba67cb4c7680760b6205b3443aa0cd8f71af1a9153f6463407ba  notifications-unread-390x844-1x.png
b8da65c045a6beb73c807b97e059cb8b0fae773219f729d77c3753b60cafa16b  settlements-incoming-390x844-1x.png
26b2f140181adbac3d3d3a22f98678b4b0c8b8981607d2b0ac62f2722b8bec79  settlements-outgoing-390x844-1x.png
```

The 390px/1x matrix covers the static aggregate, nonzero/zero states, focused bill and money actions, and all four exact selected target views. The 320px/2x Home and Bills/Active captures remain readable and reachable without critical clipping or overflow. Widget tests separately prove single keyboard/semantic activation, useful non-duplicative labels, 48dp+ targets, target filter state and zero mutation.
