# Yup #2007 validation

Base: `ff31eee8a2b10c938bb3a22544d9e33957a8cf01` (`master`). Candidate commit: `eccdf8d138f60024787ffce9aa7dd27c50ccbfbf`, Git tree `47dd7c257d8c66b7ea145b0a4106b78f38774843`. Four files change; public declaration output is unchanged.

The reported nested `when('a', ... when('b', ... compact()))` behavior remains broken on the base. The checked public API scenarios cover both examples in the issue, all six field orderings, castable booleans and an explicit `when(['a', 'b'])` control. The 108 observations are retained as JSON. On both platforms, the independently installed base package has nine incorrect validation results; the same fixed tarball has none.

## Accepted checks

Yarn 4.10.0, Windows Node 24.14.0, Linux Node 24.22.1. Linux runs as the ordinary `node` user in the official `node:24.22.1-bookworm` image with an executable tmpfs. The upstream `lts/*` resolution was separately checked against the official node-versions manifest on 2026-10-27.

Both baseline and candidate ran normal frozen Yarn installation, ESLint/runtime tests, source/test TypeScript checks and the normal build. Baseline: **867 passed, 2 existing skips**. Candidate: **923 passed, 2 existing skips**. Candidate changed-file Prettier also passes.

```text
yarn install --frozen-lockfile
yarn test
yarn tsc --noEmit -p .
yarn tsc --noEmit -p test
yarn prettier --check src/Condition.ts src/object.ts src/util/siblingResolvers.ts test/object-conditional.ts
yarn build
```

The 28 new cases execute in both Vitest projects: exact baseline **30 failed / 26 passed**, candidate **56 passed**. They cover dynamic dependencies, defaults, alias chains, lazy paths, cycles/excluded edges, non-idempotent transforms executing once, parent identity, resolver cleanup and original thrown values including `undefined`.

Independent agents additionally checked 74 and 24 public API probes. Those receipts retain their own before/after source hashes; their overlapping counts are not added to the test totals.

## Source and package binding

The Linux source was constructed from Git blobs, not a Windows checkout archive. All 74 baseline and 76 candidate canonical files match their manifests before and after the accepted checks. The Windows raw-file bridge remains unchanged. Logs remain in their original bytes.

The baseline and candidate were packed with normal `npm pack` from clean staging directories containing canonical tracked source and the actual Windows build output, with the original package.json. Every file in each installed package matches its tarball. Both installed tarballs were consumed on Windows and Linux through the package's public API.

These are root-package packing checks, not registry downloads or rollout release artifacts. The configured `yarn precommit` also ran normally: its lint-staged globs do not match TypeScript, so it reports no matching tasks. The actual TypeScript ESLint and Prettier checks passed separately.

Windows/Linux build artifacts differ only in CRLF preserved in source comments/declarations. The raw hashes and the explicit byte bridge are recorded; no raw logs or artifacts were normalized. The same Windows-built tarball was used for both platforms' installation checks.

## Earlier attempts

- Windows initially lacked `rm`; the exact baseline build exited 127. Adding the actual Git usr/bin directory to this process's PATH made the normal build pass. Build-generated README formatting was retained separately and restored, not included in the patch.
- Direct Windows-worktree `npm pack` stalled and was stopped; baseline `yarn pack` exited 42 with an empty-event-loop error. Clean source/build stages packed successfully and were used for the accepted installation checks.
- An initial Linux mount was `noexec`, so esbuild failed with EACCES; baseline normal installation reproduced the same failure. The same esbuild bytes execute on the corrected `exec` mount. No dependency, install hook or check was bypassed.
- Node 26.12.1 and an npm-distributed Node 24 binary were attempted on the earlier noexec mount. These attempts are **SUPERSEDED** by the accepted official-Docker Node 24.22.1 run, and are not a completed extra matrix or an outstanding LTS gap.
- Independent review found early alias/failure-cache regressions, which were corrected before the accepted runs. Earlier logs retain their source attribution.

No upstream Actions result, maintainer approval, merge, release or live application acceptance is claimed by these local checks.
