# Native test recovery candidate V5

This is a source-only candidate. Importing or running its tests does not invoke
ADB, an emulator, a native test, or a signal. There is no V5 execution packet,
Atlas admission, normal executor acknowledgment, or authority to run it. The
consumed V4 packet and its failed result stay in the external handoff unchanged.

## Retained V4 fact and settlement change

The V4 result recorded one confirmed QEMU SIGTERM, then `FAIL` at
`partial_settlement`: its first census had the original four members and the
observation-only Crashpad; its second census included PID 631210, start ticks
15967976, parent QEMU 544891. That process was absent in read-only postflight.
The receipt has no executable, argv, image, or held exit proof for PID 631210.
It remains **unclassified**. Nothing here treats it as the expected watchdog.

V5 passes the held original exit set into settlement census verification. It
allows an original QEMU or netsimd process to disappear between reads only when
its pidfd has proved exit. Netsimd may move from the proved QEMU parent to the
original anchor after QEMU exit if all other basic identity fields match; a
fresh full identity read must agree. A new PID, unrelated disappearance, PID
reuse, unreadable identity, or changed surviving process still fails the one
attempt. The original 22-second settlement and 30-second overall bounds, sole
QEMU pidfd SIGTERM, and zero-retry rule remain in the candidate. V5 uses a new
packet schema and result names, so the consumed V4 packet cannot run this code.

## Disposable lifecycle

`disposable_lifecycle.py` creates one private run directory with pinned source,
packet, image, and command digests. It retains allowlisted diagnostic prefixes
(up to 4 MiB each) and a private completeness receipt. The terminal record is
single-use and records zero automatic retries; a failed or incomplete cleanup
requires a new admission. It launches no process and deletes no diagnostics.
A future native runner must call it around its own independently reviewed
launch/cleanup flow and bind the resulting files to an exact packet. No native
readiness is inferred from a test exit code.

## Read-only residual state and proposed recovery gate

The latest read-only postflight found only anchor 544889 (ticks 12959464) and
ADB 545152 (ticks 12964178) in the owned graph. ADB retained the loopback
5037 listener; QEMU 544891, netsimd 544965, Crashpad 544895 and transient
631210 were absent. The VPN remained connected. The source anchor has older
`cleanup` paths with broader group/kill behavior, so that command is **not**
part of this proposal.

Before a separate residual cleanup, capture a fresh full process and socket
census; pin the exact anchor and ADB UID, start ticks, executable inode/hash,
argv hash, parent link, process groups, listener, and source/diagnostic files;
prove the five original locks free and no native job active. Any extra or
unreadable process blocks the operation. A new reviewed procedure must select
only one proved residual target and one bounded effect, define its postflight
proof and failure receipt, receive independent reviews and an exact Atlas
decision, and use normal executor approval. This document grants no signal,
ADB command, launcher shutdown, group action, retry, or native test.

## SDK-free validation

From this directory:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest -q \
  test_qemu_partial_cleanup_v5.py test_crashpad_observer_v1.py \
  test_disposable_lifecycle.py
```
