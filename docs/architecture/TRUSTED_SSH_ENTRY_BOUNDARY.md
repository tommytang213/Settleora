# Trusted SSH Entry Boundary

Status: proposed, source implemented but inactive

Issue: #1012

Decision date: 2026-08-05
Activation: prohibited until a later explicit owner security gate

## Context

Draft PR #1048 produces a manual-root handoff package whose Windows launcher
sends a clean `/usr/bin/env -i ... /usr/bin/bash --noprofile --norc` remote
command. That cleanup is not the first server-side user-space boundary.
OpenSSH 9.6p1 on the DevBox documents and implements remote commands by running
the account's configured login shell with `-c`. If that shell is Bash, Bash may
process `BASH_ENV` before the client-supplied `env -i` is reached. The server's
PAM session stack may also add environment before the shell. Package bytes
cannot prove that pre-entry execution did not occur.

This ADR selects an inactive production-shaped server boundary. It does not
authorize an account, password, key, shell, `/etc/shells` entry, sshd/PAM/
sudoers change, reload, deployment, or handoff execution.

## Installed-platform evidence

The installed `sshd(8)` manual says that all commands are run under the login
shell from the password database. The installed `sshd_config(5)` manual says
that `ForceCommand` is invoked using that login shell with `-c`, applies to
shell, command, and subsystem requests, and places the original request in
`SSH_ORIGINAL_COMMAND`. The installed `sshd(8)` authorized-key documentation
also confirms that `restrict,pty` applies the restricted-key posture while
restoring PTY allocation.

The installed OpenSSH version is 9.6p1. Its configuration parser does not allow
`PermitUserEnvironment` inside a `Match` block, so the proposed drop-in states
the global defense-in-depth value before the dedicated-user match and ends the
conditional with `Match all`. The current server has `UsePAM yes`, accepts
locale environment, and has an external SFTP subsystem. The dedicated native
shell therefore treats all pre-shell environment as hostile and `ForceCommand`
as a subsystem/request normalizer, not as the first-executable trust boundary.

The installed sudoers manual confirms that a rule without `NOPASSWD` requires
authentication, that argument wildcards can cross word boundaries, and that
an empty quoted argument specification matches no command arguments. The
proposal consequently grants one fixed root gate with `""`, no wildcard.

## Threat model

In scope:

- a compromised dedicated SSH account and every file it can write;
- a hostile client command, shell request, SFTP/SCP request, subsystem request,
  environment request, PTY choice, forwarding request, or malformed byte;
- `BASH_ENV`, `ENV`, `SHELLOPTS`, dynamic-loader variables, Node/Python/Ruby/
  Perl loader variables, user rc files, and PAM-supplied environment;
- replacement, symlink, hard-link, traversal, wrong-owner/mode, package
  mutation, replay, residue, and path-reopen races;
- a package entrypoint that attempts a second sudo call or arbitrary argv;
- a compromised account that invokes the allowed sudo command repeatedly to
  induce multiple password prompts before the command itself starts;
- lockout or accidental changes to existing developer SSH access.

Trusted:

- the kernel's ELF loader and measured freestanding native artifacts whose
  `_start` implementations issue syscalls directly without a libc startup;
- root-owned path ancestry and installed artifact/configuration closure;
- the fixed root-owned `/usr/bin/node`, `/usr/bin/bash`, and their system loader
  closure after the native shell has cleared environment;
- OpenSSH authentication/session implementation and root-owned sshd/PAM
  configuration after a future manual validation;
- the fixed root-owned sudo gate, package validator, and later authenticated
  package source contract.

Out of scope:

- a compromised kernel, root account, sshd binary, root-owned global loader
  configuration, or root-owned system runtime;
- changing the existing `tommytang213` account, shell, keys, or SSH behavior;
- deploying this proposal or continuing Issue #959;
- storing a private key, public key, password hash, password, token, or secret.

## Alternatives considered

### Existing Bash login shell plus ForceCommand or authorized-key command

Rejected as the security boundary. Both forced-command forms still enter the
configured login shell with `-c`. `PermitUserEnvironment no`, `PermitUserRC
no`, `restrict`, and forwarding restrictions reduce exposure but do not change
the identity of the first account-level executable. A clean command string is
too late when Bash can act before it.

### Dedicated account with a root-owned native login shell

Selected. The dedicated account's configured shell is a small, freestanding,
statically linked ELF binary. Its own `_start` reads the initial process stack
and issues Linux syscalls directly: no script shebang, ELF interpreter,
`DT_NEEDED`, libc startup, locale/catalog initialization, or tunables parser
runs before its checks. On the verified OpenSSH invocation, it accepts only:

```text
argv[0] = settleora-trusted-ssh-entry
argv[1] = -c
argv[2] = settleora-handoff-v1
```

The fixed `ForceCommand` makes shell, command, and subsystem requests enter
that exact shape. The native shell parses `SSH_ORIGINAL_COMMAND` using an exact
ASCII grammar, clears the complete environment, and `execve`s fixed
`/usr/bin/node` with a fixed root-owned dispatcher module. It never invokes a
shell or uses PATH lookup. Interactive/no-command requests have no valid
original command and fail closed.

### Separate sshd instance or authenticated service/subsystem

Feasible but larger. A second daemon or purpose-built authenticated service
could make a dedicated protocol executable the direct service boundary and
separate configuration from developer SSH. It adds listener, firewall,
service lifecycle, host-key, monitoring, deployment, and recovery authority.
Those changes are disproportionate while the native-shell account boundary is
available and testable. Revisit this option if a future platform cannot assign
the native shell safely or if the existing daemon cannot express the required
per-account restrictions.

### Smaller installed OpenSSH boundary

No smaller pre-shell boundary was found. `ForceCommand`, authorized-key
`command=`, `PermitUserEnvironment no`, `PermitUserRC no`, `restrict`, and
forwarding controls all operate around a command still launched through the
configured shell. `internal-sftp` is in-process but is a file-transfer service,
does not carry the required protocol, and would bypass the desired dispatcher.
PAM cannot safely become the protocol dispatcher without expanding the PAM
trust/configuration surface for the existing daemon.

## Decision

Use one dedicated non-product account named `settleora_handoff` with:

- an owner-selected unused system UID/GID, with the GID exclusive to this
  account as both a primary and supplementary membership boundary;
- home `/var/lib/settleora/trusted-ssh/home`, not writable as authority;
- login shell `/opt/settleora/trusted-ssh/bin/settleora-trusted-ssh-entry`;
- one root-owned authorized-keys file at
  `/etc/settleora/trusted-ssh/authorized_keys`;
- only `ssh-ed25519` or `sk-ssh-ed25519@openssh.com`, bound to one explicitly
  supplied SHA-256 operator-key fingerprint;
- public-key-only SSH authentication; SSH password and keyboard-interactive
  authentication disabled;
- no user environment, user rc, forwarding, agent forwarding, X11, TCP or
  Unix-socket tunnels, gateway ports, or general shell;
- PTY permitted because execute needs exactly one interactive sudo password
  prompt;
- a manually provisioned account password or separately approved factor used
  only for sudo, never stored in the repository or plan;
- a dedicated root-owned PAM service whose first `auth requisite` step consumes
  the operation one-shot before `common-auth`, with `passwd_tries=1`;
- no unrestricted administrator-group membership.

The authorized-key template uses `restrict,pty`. The sshd match repeats the
forwarding prohibitions, sets `AuthorizedKeysCommand none` so no inherited
external authorization source can admit a second key, and uses `ForceCommand settleora-handoff-v1` to ensure
subsystem and shell requests cannot bypass parsing. Neither layer substitutes
for the native login shell.

## Command protocol

The only version-1 request is:

```text
settleora-handoff-v1 <preflight|execute> <handoff-key> <operation-id>
```

The handoff key is exactly `YYYYMMDD-HHMM-` plus sixteen lowercase hexadecimal
characters. The operation ID is exactly 64 lowercase hexadecimal characters.
The request is printable ASCII, at most 128 bytes, has exactly three single
spaces, and contains no quoting, substitution, redirection, pipeline,
wildcard, option, path, or client-selected filesystem value. Paths are derived
only as `<fixed handoff root>/<handoff key>`.

`execute` requires a real terminal on standard input. `preflight` remains
non-mutating and may run without one. Standard input, output, error, and an
allocated PTY remain inherited through native shell, dispatcher, held-fd gate,
and package entrypoint.

The native shell emits only `SETTLEORA_SSH_BOUNDARY_E64`, `E65`, `E66`, or
`E70`. It never echoes the original command or environment. The dispatcher and
held-fd gate likewise emit bounded codes without paths, secrets, or payloads.

## Dispatcher and package contract

After native parsing, the environment is exactly fixed HOME, locale, PATH, and
timezone values. The root-owned dispatcher independently validates all three
normalized identity arguments. It opens the derived package directory with
`O_DIRECTORY|O_NOFOLLOW`, opens every allowlisted member through the held
directory descriptor, requires owner/mode/link invariants, and authenticates
canonical manifest identity, exact source commit/tree, byte count, and SHA-256.

The stable integration envelope is
`settleora_trusted_ssh_handoff_package_v1`. It intentionally uses deterministic
fixtures on this branch because PR #1048 is unmerged and its bytes/commits must
not be copied. Later PR #1048 continuation must render this envelope from its
authenticated source-owned package authority and make `remote-entrypoint.sh`
the exact authenticated executable member. This boundary will then use the
same complete package closure; it will not import retained `20260804-1825`
bytes or trust a summary/path hint.

Nested package members are allowed only through the manifest's bounded
component grammar. Each component is walked beneath a held directory
descriptor with `O_DIRECTORY|O_NOFOLLOW`; the validator compares the complete
recursive file/directory set and never accepts a client filesystem path.

The dispatcher retains the authenticated entrypoint file descriptor. It passes
that descriptor as fd 3 to a fixed static root-owned helper. The helper
revalidates normalized identity and descriptor metadata, clears `FD_CLOEXEC`,
then executes fixed `/usr/bin/bash --noprofile --norc /proc/self/fd/3` with a
clean environment. There is no TOCTOU-prone reopening of the package path.

The root gate and later PR #1048 integration must independently reauthenticate
the complete package and exact operation. Preflight cannot write protocol
state. Before invoking the package entrypoint, execute atomically reserves one
account-owned, non-writable operation claim with `O_EXCL`. The syscall-only
native sudo gate validates the invoking UID/GID and passes those normalized
integers—not command text—to its fixed Node module. That module takes the claim
root-owned, then exclusively publishes a root-owned consumed receipt with
`sudoAttemptCount: 1` before root bootstrap. The transition is performed by a
freestanding root-owned PAM pre-auth helper before the password module is
entered, not by the post-authentication command. A repeated or ambiguous operation
therefore cannot reach a second privileged attempt. Execute may reach only the
existing prepare, one-arm, readback-only resume sequence. Drift, residue,
replay evidence, malformed output, path/link/owner/mode change, or a second
sudo attempt fails closed.

Before consuming the claim, the root-gate module authenticates the installed
`settleora-authenticated-root-bootstrap.mjs` against the root-owned installed
artifact manifest, including exact path, ancestry, owner, group, mode, byte
count, and digest. It then executes fixed `/usr/bin/node` with that fixed module
and a clean environment. Before that exec, the root gate atomically hard-links
the consumed receipt to a root-only entered directory and unlinks the consumed
name. This no-clobber transition admits the root gate exactly once even if an
unexpected sudo timestamp were available. The module independently
reauthenticates the complete package and root-only entered receipt and exposes only the fixed
`prepare`, `arm-interactive-sudo-once`, `resume-readback-only` integration
envelope. Its default implementation fails closed until the separately reviewed
PR #1048 integration supplies the authenticated protocol implementation; no
unreviewed or path-selected bootstrap can run.

## Sudo and PTY model

The canonical sudoers fixture is narrow:

```sudoers
Defaults:settleora_handoff env_reset,use_pty,!set_home,!preserve_groups,!rootpw,!targetpw,!runaspw,timestamp_timeout=0,passwd_tries=1,pam_service=settleora-handoff-sudo
Defaults:settleora_handoff secure_path=/usr/sbin:/usr/bin:/sbin:/bin
settleora_handoff ALL=(root) PASSWD: /opt/settleora/trusted-ssh/bin/settleora-root-gate ""
```

The quoted empty argument list means the gate accepts no command arguments.
There is no `NOPASSWD`, wildcard, shell, editor, environment-preserving route,
or unrestricted admin group. Dynamic identity is read and authenticated by the
fixed gate from the already authenticated protocol/package state, not from sudo
argv. The account password or separately approved factor is manually
provisioned and never recorded. The root gate must preserve and enforce
`sudoAttemptCount == 1`.

Stock sudo command gating alone is insufficient: sudo authenticates before it
executes the allowed command, so a compromised account could otherwise enter
PAM twice and obtain two prompts before the command-side receipt check. The
dedicated `settleora-handoff-sudo` PAM service therefore begins with:

```text
auth requisite pam_exec.so quiet seteuid /opt/settleora/trusted-ssh/bin/settleora-sudo-preauth
auth include common-auth
```

The static pre-auth helper validates `PAM_USER` and `PAM_RUSER` as the invoking
dedicated account (sudo's ordinary password-owner model), validates the exact PAM type, replaces its
environment before fixed Node execution, reauthenticates the package and
installed bootstrap, and atomically consumes the pending operation. Failure or
replay stops before `common-auth`; `passwd_tries=1` bounds the admitted
invocation to one prompt. The post-authentication root gate accepts only the
already consumed root-owned receipt and moves it to entered exactly once. Installing this dedicated PAM service is
a later explicit owner security decision; this PR does not touch live PAM.

The future installed validator must capture the complete sudoers include tree,
passwd/group/NSS inputs, and transitive PAM `include`/`substack` tree into an
owner-private read-only snapshot. Every captured regular file is bound by
owner, group, mode, link count, byte length, and digest; the approved digest
map must match exactly. The installed `/usr/bin/cvtsudoers` executable is also
bound to its explicitly approved digest before and after it derives the
effective policy. The validator then normalizes every user/group match,
`exempt_group`, PAM service, password-owner flag, zero timestamp timeout,
password-tries setting, security default, source provenance, and command
specification. It accepts exactly
one authenticated no-argument root-gate rule, the dedicated account's own
group only, no exempt group, and no global/group/alternate command route.
This collector is source-only in this PR and tests only caller-owned private
snapshot roots; collecting and approving a live installed snapshot remains a
later manual security gate.

## Trust roots and ownership

All installed ancestors, native binaries, dispatcher module, support library,
fd helper, PAM pre-auth helper/module, root gate, package validator, sshd drop-in, authorized keys, sudoers
fragment, and package publication root are root-owned and not writable by the
dedicated account. Package files may be root-owned with a dedicated read-only
group, but must never be account-writable, symlinks, or unexpected hard links.
The operation-claim root is root-owned `0710`, its pending directory is
root-owned/dedicated-group `1770`, and its consumed directory is root-only
`0700`, and its entered directory is separately root-only `0700`; an
account-created claim becomes root-owned before a consumed receipt is
published, then a successful root entry moves that authority exactly once.
The pending directory grants the exclusive dedicated group read permission so
the account can open and `fsync` the directory after exclusive claim creation;
the validator rejects any other passwd primary-GID user or supplementary
member of that group. Claim names and bytes are bounded protocol identities,
not password or key material.
The account must not be able to change its shell, home authority,
authentication file, dispatcher closure, validator, or sudo gate.

## Inactive generation and validation

`generate-trusted-ssh-boundary-plan.mjs` writes only to a caller-supplied,
existing, owner-private output root. It binds the claimed commit/tree to a clean
checkout, reads all five JavaScript modules as exact Git blobs, rebuilds the
four native artifacts from exact Git blobs with fixed compiler arguments, and
rejects supplied artifacts that are not byte-identical. It then emits canonical
fixtures and an installation/rollback plan, reserves the final directory
without overwrite, moves the staged closure into it, and writes the completion
marker last. A crash after reservation leaves invalid blocking residue rather
than an apparently complete plan or a clobbered destination.
It has no user, sshd, sudo, service, runtime, or live-path mutation function.

`validate-trusted-ssh-boundary.mjs` is read-only. It validates the private plan,
artifact closure, static/freestanding ELF identity, configuration contracts,
rollback completeness, and absence of general-shell routes. Its realized-key
validator accepts exactly one `restrict,pty` Ed25519 or security-key Ed25519
public-key line, verifies root ownership/mode/ancestry, and uses
`ssh-keygen -lf -E sha256` to compare the realized key with the owner-approved
fingerprint. On this DevBox, unprivileged `sshd -T -f <fixture>` uses a
disposable RSA host key generated only inside a private temporary fixture and
validates the complete effective dedicated-user projection, including the
absence of alternate certificate/principal authority;
`visudo -cf` parses the exact sudoers fixture successfully.

The boundary runtime is narrower than the repository's general Node 22 range:
the fixed root-owned `/usr/bin/node` must be `>=22.15.0 <23.0.0` and expose
`process.execve`. The plan and validator bind that requirement, and the root
gate, PAM pre-auth module, and unprivileged dispatcher all check it before
authenticating or consuming an operation receipt. The dispatcher checks before
reserving an execute claim, so an older or API-incomplete runtime fails without
burning the one-shot or leaving replay-blocking pending residue.
The installed-authority collector also fails closed on every unmodeled
`@includedir` entry (including sudo-active names beginning with `_` or `-`) and
on any sudo alias or numeric UID/GID representation; it never filters them out
before deciding which authority applies to the account. Any run-as group field
is rejected rather than normalized into the fixed root-user-only rule. Defaults
and rule user bindings are shape-checked before applicability, so command,
host, run-as, netgroup, negated, or other unmodeled bindings cannot disappear.
Sudo include directives are parsed before conversion, including valid trailing
comments; malformed directive-like lines fail instead of reaching cvtsudoers.

## Deployment, lockout avoidance, and rollback

Deployment is a later manual gate. Before any reload, an owner must:

1. choose unused UID/GID and the exact operator public key/fingerprint;
2. confirm console or provider recovery access and keep an existing developer
   SSH session open;
3. back up the exact current account, shells, sshd, authorized-key, and sudoers
   state;
4. install and independently hash the root-owned artifact closure through
   temporary sibling paths;
5. prove `/usr/bin/node` is `>=22.15.0 <23.0.0` and exposes `process.execve`
   before any operation claim can be reserved or consumed;
6. realize exactly one restricted public-key line, validate its exact
   fingerprint, prove effective `AuthorizedKeysCommand none`,
   `TrustedUserCAKeys none`, and no principals file/command, and validate the
   sudoers fragment with `visudo`, the dedicated PAM service before use, and
   the complete normalized effective sudo policy;
7. add the shell only after its static and freestanding identity is verified;
8. create the locked dedicated account, set the fixed shell, then manually
   provision the one key and sudo factor;
9. publish the sshd match, run `sshd -t` and exact-user `sshd -T -C`, and prove
   existing `tommytang213` effective behavior is unchanged;
10. test denial and recovery from a second session before any reload decision;
11. obtain explicit owner authorization for the reload and installed protocol
    test.

Rollback first disables the new key or dedicated match using the retained
admin/recovery channel, validates the rollback configuration, and reloads only
under explicit authorization. It then restores exact backed-up configuration,
locks the dedicated account, waits for boundary sessions to end, removes only
the authenticated installed closure, and retains bounded audit/install evidence.

## Audit and privacy

Audit records may contain timestamp, dedicated account, key fingerprint,
bounded mode, operation correlation digest, success/failure code, PTY present,
and sudo-attempt count. They must not contain a password, private/public key
bytes, raw environment, full client command, package bytes, private paths, or
provider payload. Failure messages are deterministic and bounded.

## Consequences and remaining manual gates

The design proves the first account-level executable is a freestanding static
root-owned native binary and preserves the one-prompt PTY requirement. It adds a dedicated
account and a small root-owned artifact/configuration closure that must be
operated carefully. It does not make PR #1048 mergeable by itself: this PR must
first merge, then the boundary must be separately installed and verified, and
only then may PR #1048 integrate the installed contract and reconverge.

Manual decisions remain: UID/GID, operator key/fingerprint, sudo factor,
dedicated PAM service approval,
account/password lifecycle, installation window, recovery channel, exact
installed root/group modes, sshd reload, live PTY/PAM behavior, and later PR
#1048 package-envelope integration. No decision here authorizes any of them.
