"""Current Android qualification supervisor. Importing this module launches nothing.

Exact Atlas packet admission and ordinary executor approval are EXTERNAL gates.
This script supplies identity/integrity checks, never platform authority.
"""
import argparse
import ctypes
from datetime import datetime
import fcntl
import hashlib
import ipaddress
import json
import math
import os
import pwd
from pathlib import Path
import re
import select
import signal
import shlex
import shutil
import subprocess
import stat
import tarfile
import zipfile
import io
import threading
import time
import types

CAP = 4 * 1024 * 1024
NATIVE = {'adb', 'dart', 'flutter', 'java', 'gradle', 'netsimd'}
ROLES = ('runner', 'emulator', 'adb')
OFFLINE_GRADLE_INIT = (
    'gradle.startParameter.offline = true\n'
    'gradle.startParameter.dependencyVerificationMode = org.gradle.api.artifacts.verification.DependencyVerificationMode.STRICT\n'
    'gradle.settingsEvaluated { settings ->\n'
    '  if (!settings.gradle.startParameter.offline || settings.gradle.startParameter.dependencyVerificationMode != org.gradle.api.artifacts.verification.DependencyVerificationMode.STRICT) {\n'
    '    throw new org.gradle.api.GradleException("offline strict verification was changed during settings")\n'
    '  }\n'
    '}\n'
)
_invocation = None


class SDKCommandError(RuntimeError):
    """Only a completed nonzero SDK command, never a policy/identity failure."""


def sha(path, check=None):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        before = os.fstat(f.fileno())
        for block in iter(lambda: f.read(1024 * 1024), b''):
            if check is not None:
                check()
            h.update(block)
        after = os.fstat(f.fileno())
        current = os.stat(path)
        identity = lambda st: (st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns, st.st_ctime_ns)
        if identity(before) != identity(after) or identity(after) != identity(current):
            raise RuntimeError('hashed path/inode changed during observation')
    return h.hexdigest()


def decode(raw):
    def unique(items):
        out = {}
        for k, v in items:
            if k in out:
                raise ValueError('duplicate JSON key')
            out[k] = v
        return out
    return json.loads(raw, object_pairs_hook=unique,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite JSON')))


def bounded_bytes(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size > CAP:
            raise ValueError('bounded single-link regular input required')
        raw = os.read(fd, CAP + 1)
        after = os.fstat(fd)
        if len(raw) != before.st_size or any(getattr(before, k) != getattr(after, k) for k in
                ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns')):
            raise RuntimeError('input changed during read')
        return raw
    finally:
        os.close(fd)


def read_json(path):
    return decode(bounded_bytes(path))


def state_parent():
    return Path(pwd.getpwuid(os.geteuid()).pw_dir) / '.local/state/settleora-native-qualification'


def pinned_history_json(path, pins):
    path = Path(path)
    raw = bounded_bytes(path) if str(path) in pins else None
    if raw is None or hashlib.sha256(raw).hexdigest() != pins[str(path)]:
        raise RuntimeError('exact externally admitted history evidence required')
    return decode(raw)


def require_late_scope_absent(ledger, retired, check=lambda: None, supervisor_pid=None):
    if Path('/proc/sys/kernel/random/boot_id').read_text().strip() != retired['bootID'] or \
       os.stat('/proc/self/ns/pid').st_ino != retired['pidNamespace'] or \
       os.stat('/proc/self/ns/net').st_ino != retired['netNamespace']:
        raise RuntimeError('retired ownership observation namespace/boot changed')
    if supervisor_pid is not None:
        if type(supervisor_pid) is not int or supervisor_pid <= 0:
            raise RuntimeError('known retired supervisor PID required')
        try:
            Path('/proc', str(supervisor_pid), 'stat').read_text()
        except FileNotFoundError:
            pass
        else:
            raise RuntimeError('retired supervisor PID still observed or reused')
    known = {(r['pid'], r['ticks']) for r in ledger}
    groups = {r['pgid'] for r in ledger}
    sessions = {r['sid'] for r in ledger}
    for entry in Path('/proc').iterdir():
        check()
        if not entry.name.isdigit():
            continue
        try:
            raw = (entry / 'stat').read_text()
        except FileNotFoundError:
            continue
        fields = raw[raw.rfind(')') + 2:].split()
        if (int(entry.name), fields[19]) in known or int(fields[2]) in groups or int(fields[3]) in sessions:
            raise RuntimeError('retired owned identity/session/group still observed')
    check_free_emulator_ports((5037, 5554, 5555))
    check()


def complete_history_facts(terminal, final):
    terminal_fields = {'schema', 'automaticRetries', 'cleanupVerified', 'diagnostics', 'nativeReady', 'requiresNewAdmission', 'testExitCode'}
    final_fields = {'cleanupVerified', 'nativeReady', 'normalExecutorReturnStillRequiresExternalReadback', 'qualificationFailure', 'testExitCode'}
    diagnostics = terminal.get('diagnostics')
    return terminal_fields <= set(terminal) and final_fields <= set(final) and \
        type(diagnostics) is list and 1 <= len(diagnostics) <= 8 and \
        all(type(name) is str and name in {'emulator_stderr','emulator_stdout','anchor_stderr','flutter_stdout','flutter_stderr','tool_result'} for name in diagnostics) and \
        len(set(diagnostics)) == len(diagnostics) and 'tool_result' in diagnostics and \
        (final['qualificationFailure'] is None or type(final['qualificationFailure']) is str)


def verify_history_diagnostics(root, terminal, final, pins):
    for name in terminal['diagnostics']:
        receipt = pinned_history_json(root / 'diagnostics' / (name + '.json'), pins)
        log = root / 'diagnostics' / (name + '.log')
        raw = bounded_bytes(log) if str(log) in pins else None
        fields = {'schema','name','retainedBytes','sourceBytes','truncated','retainedSHA256'}
        if raw is None or hashlib.sha256(raw).hexdigest() != pins[str(log)] or set(receipt) != fields or \
           receipt['schema'] != 'settleora-private-diagnostic-v1' or receipt['name'] != name or \
           type(receipt['retainedBytes']) is not int or type(receipt['sourceBytes']) is not int or receipt['sourceBytes'] < 0 or \
           type(receipt['truncated']) is not bool or receipt['retainedBytes'] != min(receipt['sourceBytes'], CAP) or \
           receipt['truncated'] != (receipt['sourceBytes'] > receipt['retainedBytes']) or len(raw) != receipt['retainedBytes'] or \
           hashlib.sha256(raw).hexdigest() != receipt['retainedSHA256']:
            raise RuntimeError('incomplete or invalid pinned historical diagnostic')
        if name == 'tool_result':
            if receipt['truncated']:
                raise RuntimeError('historical tool result cannot be truncated')
            result = decode(raw)
            if result.get('testExitCode') != terminal['testExitCode'] or result.get('cleanupVerified') is not terminal['cleanupVerified'] or \
               result.get('nativeReady') is not False or result.get('consumed') is not True or \
               result.get('consumptionDurabilityConfirmed') is not True or result.get('qualificationFailure') != final['qualificationFailure']:
                raise RuntimeError('historical tool result contradicts terminal/final facts')
            for field in ('primaryFailure','cleanupFailure'):
                if (field in result) != (field in final) or result.get(field) != final.get(field):
                    raise RuntimeError('historical primary/cleanup causes contradict final facts')
            tool_result = result

    return tool_result


def verify_history_bundle(root, terminal, final, result, pins):
    manifest = pinned_history_json(root / 'manifest.json', pins)
    digests = {'sourceSHA256','packetSHA256','imageSHA256','commandSHA256'}
    if set(manifest) != {'schema','maxDiagnosticBytes','automaticRetries'} | digests or manifest['schema'] != 'settleora-disposable-native-run-v1' or manifest['maxDiagnosticBytes'] != CAP or manifest['automaticRetries'] != 0 or any(type(manifest[k]) is not str or not re.fullmatch('[0-9a-f]{64}',manifest[k]) for k in digests):
        raise RuntimeError('incomplete historical run manifest')
    consumed = pinned_history_json(root / 'CONSUMED.json', pins)
    if consumed.get('packetSHA256') != manifest['packetSHA256'] or consumed.get('retries') != 0 or consumed.get('nativeReady') is not False:
        raise RuntimeError('historical consumption facts disagree')
    ownership = pinned_history_json(root / 'OWNED_DESCENDANTS.json', pins)
    observed = ownership.get('observed')
    if ownership.get('cleanupVerified') is not terminal['cleanupVerified'] or type(observed) is not list or len(observed) > 4096:
        raise RuntimeError('historical ownership contradicts terminal facts')
    children = result.get('children')
    if type(children) is not dict or len(children) > 1027:
        raise RuntimeError('bounded historical direct children required')
    capture = pinned_history_json(root / 'CAPTURE_COMPLETENESS.json', pins)
    expected_streams = {role + ':' + channel for role in children for channel in ('0','1')}
    if capture.get('setupComplete') is not True or type(capture.get('streams')) is not dict or set(capture['streams']) != expected_streams:
        raise RuntimeError('incomplete historical process capture')
    scope = list(observed)
    for role, child in children.items():
        if role not in ROLES and not re.fullmatch(r'cmd_[1-9][0-9]{0,3}', role):
            raise RuntimeError('unknown historical child role')
        attempt = pinned_history_json(root / ('LAUNCH_ATTEMPTED_' + role + '.json'), pins)
        launch = pinned_history_json(root / ('LAUNCH_OBSERVED_' + role + '.json'), pins)
        if attempt.get('role') != role or attempt.get('retries') != 0 or type(attempt.get('argv')) is not list or not attempt['argv'] or any(type(arg) is not str for arg in attempt['argv']) or launch.get('role') != role or launch.get('pid') != child.get('pid') or launch.get('ticks') != child.get('ticks') or type(child.get('pid')) is not int or child['pid'] <= 0 or type(child.get('ticks')) is not str or not child['ticks'].isdigit():
            raise RuntimeError('positive historical child launch identity required')
        scope.append(dict(pid=child['pid'],ticks=child['ticks'],pgid=child['pid'],sid=child['pid'],ppid=0))
        for channel in ('0','1'):
            stream = capture['streams'][role + ':' + channel]
            limit = 32*1024*1024 if role == 'runner' else CAP
            if stream.get('complete') is not True or stream.get('error') is not None or stream.get('processOutputTruncated') is not False or stream.get('limit') != limit or type(stream.get('totalBytes')) is not int or stream['totalBytes'] < 0 or stream.get('retainedBytes') != stream['totalBytes'] or stream['totalBytes'] > limit:
                raise RuntimeError('historical capture incomplete/truncated')
    if terminal['cleanupVerified']:
        cleanup = pinned_history_json(root / 'CLEANUP_OBSERVED.json', pins)
        if cleanup.get('remaining') != [] or cleanup.get('nativeReady') is not False or (cleanup.get('directChildrenExited') is not True if children else cleanup.get('ownedChildrenCreated') != 0) or any(type(c.get('returnCode')) is not int for c in children.values()):
            raise RuntimeError('historical clean ownership observation incomplete')
    schema = final.get('schema')
    if schema is None:
        if result.get('schema') is not None or any(field in final or field in result for field in ('primaryFailure','cleanupFailure')) or (root / 'FAILURE_CAUSES.json').exists():
            raise RuntimeError('unversioned historical cause contract')
    elif schema == 'settleora-native-supervisor-final-v2':
        if result.get('schema') != 'settleora-native-tool-result-v2' or not {'primaryFailure','cleanupFailure'} <= set(final):
            raise RuntimeError('versioned historical failure facts incomplete')
        causes = pinned_history_json(root / 'FAILURE_CAUSES.json', pins)
        if final['qualificationFailure'] != (final['primaryFailure'] or final['cleanupFailure']) or any(final[field] is not None and (type(final[field]) is not str or not final[field].strip()) for field in ('primaryFailure','cleanupFailure')) or terminal['cleanupVerified'] is not (final['cleanupFailure'] is None):
            raise RuntimeError('versioned historical cause precedence contradicts supervisor outcome')
        if set(causes) != {'schema','primaryFailure','cleanupFailure'} or causes.get('schema') != 'settleora-native-failure-causes-v1' or any(causes.get(field) != final[field] or (final[field] is not None and type(final[field]) is not str) for field in ('primaryFailure','cleanupFailure')) or (terminal['cleanupVerified'] and final['cleanupFailure'] is not None):
            raise RuntimeError('historical failure cause record contradicts finalization')
    else:
        raise RuntimeError('unknown historical supervisor contract')
    return scope


def validate_late_reconciliation(root, terminal, final, pins, check=lambda: None, scope=None):
    if not complete_history_facts(terminal, final):
        raise RuntimeError('incomplete original failed finalization facts')
    receipt_path = root / 'LATE_OBSERVED_QUIESCENCE_V1.json'
    receipt = pinned_history_json(receipt_path, pins)
    if receipt.get('schema') != 'settleora-native-late-observed-quiescence-v1' or receipt.get('priorRoot') != str(root) or \
       receipt.get('initialCleanupVerified') is not False or receipt.get('lateObservedQuiescence') is not True or \
       receipt.get('normalExitVerified') is not False or receipt.get('nativeReady') is not False or \
       receipt.get('cause') != 'unobserved' or receipt.get('supervisorExitCode') != 1 or \
       terminal.get('cleanupVerified') is not False or final.get('cleanupVerified') is not False or \
       terminal.get('testExitCode') != 98 or type(final.get('qualificationFailure')) is not str or not final['qualificationFailure'] or terminal.get('nativeReady') is not False or \
       terminal.get('automaticRetries') != 0 or terminal.get('requiresNewAdmission') is not True or \
       final.get('testExitCode') != 98 or final.get('nativeReady') is not False or \
       final.get('normalExecutorReturnStillRequiresExternalReadback') is not True or \
       (root / 'LAUNCH_ATTEMPTED_runner.json').exists():
        raise RuntimeError('late quiescence cannot replace or relabel initial failure')
    for name, key in [('terminal.json', 'terminalSHA256'), ('SUPERVISOR_FINALIZED.json', 'finalSHA256'),
                      ('OWNED_DESCENDANTS.json', 'ledgerSHA256')]:
        path = root / name
        if sha(path) != receipt[key] or pins.get(str(path)) != receipt[key]:
            raise RuntimeError('retired failure/ownership record drift')
    retired = pinned_history_json(receipt['retiredPacketPath'], pins)
    consumed = pinned_history_json(root / 'CONSUMED.json', pins)
    if pins.get(receipt['retiredPacketPath']) != receipt['retiredPacketSHA256'] or retired['runRoot'] != str(root) or \
       consumed.get('packetSHA256') != receipt['retiredPacketSHA256'] or consumed.get('retries') != 0 or consumed.get('nativeReady') is not False:
        raise RuntimeError('retired consumed packet binding drift')
    for field, digest in [('scanEvidencePath', 'scanEvidenceSHA256'), ('normalHistoryPath', 'normalHistorySHA256')]:
        if pins.get(receipt[field]) != receipt[digest]:
            raise RuntimeError('late observation/invocation evidence not admitted')
    evidence = pinned_history_json(receipt['scanEvidencePath'], pins)
    scans = evidence.get('scans', [])
    if len(scans) != 2 or evidence.get('supervisorSession') != receipt['supervisorSession'] or evidence.get('actualExitCode') != 1 or \
       any(scan.get('heldRecordedIdentitiesStillPresent') != [] or scan.get('activeRelevantSockets') != [] for scan in scans) or \
       (datetime.fromisoformat(scans[1]['utc']) - datetime.fromisoformat(scans[0]['utc'])).total_seconds() < 1:
        raise RuntimeError('two separated empty bounded observations required')
    history = pinned_history_json(receipt['normalHistoryPath'], pins)
    def output(call):
        return '\n'.join(c.get('text', '') for c in call.get('output', {}).get('content', []) if c.get('type') == 'text')
    expected_argv = ['/usr/bin/python3', '-I', '-B', str(Path(retired['repo']) / 'tools/ocr-models/native-recovery/current_android_qualification.py'),
                     '--execute-admitted', '--packet', receipt['retiredPacketPath'], '--packet-sha256', receipt['retiredPacketSHA256']]
    def registered_pid(call):
        matches = re.findall(r'(?m)^Process started with PID ([0-9]+)(?=\s|\(|$)', output(call))
        return int(matches[0]) if matches else None
    def terminal_code(call):
        matches = re.findall(r'(?m)^(?:✅ )?Process completed with exit code (-?[0-9]+)(?=\s|\(|$)', output(call))
        return int(matches[-1]) if matches else None
    starts = [c for c in history.get('calls', []) if c.get('toolName') == 'start_process' and
              shlex.split(c.get('arguments', {}).get('command', '')) == expected_argv and
              registered_pid(c) == receipt['supervisorSession']]
    exits = [c for c in history.get('calls', []) if c.get('toolName') == 'read_process_output' and
             c.get('arguments', {}).get('pid') == receipt['supervisorSession'] and terminal_code(c) == 1]
    if not starts or not exits:
        raise RuntimeError('normal invocation and actual terminal failure readback required')
    # Atlas authenticates these actual API origins externally; file text/hash is
    # never platform permission. Current scope is re-observed, not inferred idle.
    ownership = pinned_history_json(root / 'OWNED_DESCENDANTS.json', pins)
    if ownership.get('cleanupVerified') is not False:
        raise RuntimeError('retired ownership record contradicts failed cleanup')
    ledger = ownership['observed']
    if not ledger or len(ledger) > 4096:
        raise RuntimeError('bounded positive retired ownership ledger required')
    require_late_scope_absent(scope if scope is not None else ledger, retired, check, supervisor_pid=receipt['supervisorSession'])


def check_previous_runs(parent, pins=None, check=lambda: None):
    if not parent.exists():
        return
    pins = pins or {}
    entries = list(parent.iterdir())
    if len(entries) > 128:
        raise RuntimeError('qualification history requires explicit reconciliation')
    for root in entries:
        check()
        if root.is_symlink() or not root.is_dir():
            raise RuntimeError('unknown qualification history entry')
        terminal = pinned_history_json(root / 'terminal.json', pins)
        final = pinned_history_json(root / 'SUPERVISOR_FINALIZED.json', pins)
        if terminal.get('schema') != 'settleora-native-run-terminal-v1':
            raise RuntimeError('unknown historical terminal record')
        if not complete_history_facts(terminal, final):
            raise RuntimeError('incomplete historical terminal/final facts')
        result = verify_history_diagnostics(root, terminal, final, pins)
        scope = verify_history_bundle(root, terminal, final, result, pins)
        late_marker = root / 'LATE_OBSERVED_QUIESCENCE_V1.json'
        if str(late_marker) in pins or late_marker.exists() or late_marker.is_symlink() or terminal.get('cleanupVerified') is not True or final.get('cleanupVerified') is not True:
            validate_late_reconciliation(root, terminal, final, pins, check, scope=scope)
        elif not complete_history_facts(terminal, final) or terminal.get('nativeReady') is not False or terminal.get('automaticRetries') != 0 or \
             terminal.get('requiresNewAdmission') is not True or type(terminal.get('testExitCode')) is not int or \
             not 0 <= terminal['testExitCode'] <= 255 or final.get('testExitCode') != terminal['testExitCode'] or \
             final.get('nativeReady') is not False or final.get('normalExecutorReturnStillRequiresExternalReadback') is not True:
            raise RuntimeError('incomplete or contradictory clean historical finalization')


def write_scope(p):
    sdk = Path(p['flutterRoot'])
    return [str(state_parent()), p['runRoot'], str(sdk / 'bin/cache/engine.stamp.tmp.*'),
            str(sdk / 'bin/cache/engine.stamp'), str(sdk / 'bin/cache/engine.realm'),
            str(sdk / 'bin/cache/lockfile'), str(sdk / 'packages/flutter_tools/gradle/.gradle'),
            str(sdk / 'packages/flutter_tools/gradle/.kotlin'),
            str(sdk / 'packages/flutter_tools/gradle/build'), p['pubCache']]



GRADLE_URL = 'https://services.gradle.org/distributions/gradle-8.14-all.zip'
GRADLE_SHA256 = 'efe9a3d147d948d7528a9887fa35abcf24ca1a43ad06439996490f77569b02d1'
GRADLE_CACHE_KEY = 'c2qonpi39x1mddn7hk5gh9iqj'
GRADLE_LAUNCHER_SHA256 = '8106fbcaf0f38f91204bb8baa29abd83cb4df6b09d8dd911caec44e70eb6cb7c'


def install_gradle_distribution(cache, home, properties, pins, check=lambda: None):
    """Install the fixed wrapper distribution from an exact verified buffer, offline."""
    values = dict(line.split('=', 1) for line in bounded_bytes(properties).decode().splitlines() if '=' in line)
    if values.get('distributionUrl', '').replace('\\:', ':') != GRADLE_URL or values.get('distributionSha256Sum') != GRADLE_SHA256:
        raise RuntimeError('fixed Gradle wrapper identity differs')
    source = Path(cache) / 'gradle-8.14-all.zip'
    filesystem_space(source)
    if pins.get(str(source)) != GRADLE_SHA256:
        raise RuntimeError('exact Gradle distribution pin required')
    check()
    with source.open('rb') as stream:
        raw = stream.read(512 * 1024**2 + 1)
    if len(raw) > 512 * 1024**2 or hashlib.sha256(raw).hexdigest() != GRADLE_SHA256:
        raise RuntimeError('Gradle distribution buffer differs')
    check()
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        members = archive.infolist()
        if len(members) > 40000 or sum(m.file_size for m in members) > 2 * 1024**3:
            raise RuntimeError('bounded Gradle distribution inventory exceeded')
        names = set()
        for member in members:
            path = member.filename.rstrip('/')
            parts = path.split('/')
            mode = member.external_attr >> 16
            if path in names or not parts or parts[0] != 'gradle-8.14' or any(x in ('', '.', '..') for x in parts) or '\\' in path or (mode and stat.S_IFMT(mode) not in (0, stat.S_IFDIR, stat.S_IFREG)):
                raise RuntimeError('unexpected Gradle distribution member')
            names.add(path)
        target = Path(home) / 'wrapper/dists/gradle-8.14-all' / GRADLE_CACHE_KEY
        filesystem_space(target)
        target.mkdir(parents=True, exist_ok=False)
        for member in members:
            check()
            path = target / member.filename
            if member.is_dir():
                path.mkdir(parents=True, exist_ok=True)
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as source_stream, path.open('xb') as out:
                while chunk := source_stream.read(1024*1024):
                    check()
                    out.write(chunk)
            path.chmod(0o600 | ((member.external_attr >> 16) & 0o111))
        with (target / 'gradle-8.14-all.zip').open('xb') as out:
            out.write(raw)
        (target / 'gradle-8.14-all.zip.ok').open('xb').close()
    check()
    return dict(archiveSHA256=GRADLE_SHA256, members=len(members), destination=str(target))


def filesystem_space(raw):
    """Observe the intended filesystem through a verified existing ancestor fd.

    No directories/files are created. Missing suffixes inherit the existing
    ancestor filesystem; a later mount/path change remains a fresh-gate failure.
    """
    path = Path(raw)
    if not path.is_absolute() or '..' in path.parts:
        raise RuntimeError('absolute canonical write path required')
    fd = os.open('/', os.O_PATH | os.O_DIRECTORY | os.O_NOFOLLOW)
    ancestor = Path('/')
    try:
        for index, component in enumerate(path.parts[1:]):
            try:
                child = os.open(component, os.O_PATH | os.O_NOFOLLOW, dir_fd=fd)
            except FileNotFoundError:
                break
            st = os.fstat(child)
            is_directory = stat.S_ISDIR(st.st_mode)
            trusted_sticky_root = is_directory and st.st_uid == 0 and bool(st.st_mode & stat.S_ISVTX)
            if (not is_directory and not (index == len(path.parts) - 2 and stat.S_ISREG(st.st_mode))) or \
               st.st_uid not in (0, os.geteuid()) or \
               (st.st_mode & 0o002 and not trusted_sticky_root) or \
               (st.st_mode & 0o020 and st.st_gid not in (0, os.getegid()) and not trusted_sticky_root):
                os.close(child)
                raise RuntimeError('untrusted/symlink write ancestor')
            os.close(fd)
            fd = child
            ancestor /= component
        before = os.fstat(fd)
        space = shutil.disk_usage(fd)
        current = os.stat(ancestor, follow_symlinks=False)
        if (before.st_dev, before.st_ino) != (current.st_dev, current.st_ino):
            raise RuntimeError('write ancestor/mount identity changed')
        return dict(intendedPath=str(path), ancestor=str(ancestor), device=before.st_dev,
                    inode=before.st_ino, freeBytes=space.free)
    finally:
        os.close(fd)


def check_write_space(paths):
    observations = [filesystem_space(raw) for raw in paths]
    if any(p['freeBytes'] < 50 * 1024**3 for p in observations):
        raise RuntimeError('a declared write filesystem has less than50GiB margin')
    return observations


def maintenance_admission_open(status):
    """Distinguish a completed, normally released mutation from an active update."""
    active = status.get('active') if type(status) is dict else None
    if type(active) is not dict or active.get('hold') is not False:
        return False
    monitor = active.get('monitor')
    if active.get('phase') != 'released' or type(monitor) is not dict or monitor.get('updater_alive') is not False:
        return False
    if active.get('mutation_started') is False:
        return True
    if active.get('mutation_started') is not True:
        return False
    terminal = active.get('terminal')
    if type(terminal) is not dict:
        return False
    if type(active.get('id')) is not str or not active['id'] or terminal.get('run_id') != active['id'] or \
       terminal.get('outcome') != 'completed' or type(terminal.get('exit_code')) is not int or terminal['exit_code'] != 0 or \
       terminal.get('mutation_started') is not True or monitor.get('updater_alive') is not False:
        return False
    ended, released = terminal.get('at'), active.get('released_at')
    return all(type(value) in (int, float) and math.isfinite(value) for value in (ended, released)) and 0 < ended <= released


def validate_network_policy(network):
    if set(network) != {'Status', 'Server', 'Country', 'City', 'IP', 'Protocol', 'Kill Switch', 'Firewall'}:
        raise ValueError('exact dedicated network/protection policy required')
    if network['Country'] != 'United States' or network['Protocol'] != 'NordLynx' or \
       not isinstance(ipaddress.ip_address(network['IP']), ipaddress.IPv4Address) or \
       any(type(v) is not str or not 1 <= len(v) <= 100 for v in network.values()):
        raise ValueError('complete dedicated IPv4/US/NordLynx policy required')
    # Exact private Server/IP values are bound by the externally admitted raw
    # packet, then compared in policy(). This generic code cannot grant a new
    # endpoint policy and intentionally contains no private host address.
    if network['City'] != 'Boston' or network['Status'] != 'Connected' or \
       network['Kill Switch'] != 'enabled' or network['Firewall'] != 'enabled':
        raise ValueError('approved Boston/protection policy required')


def validate(p):
    keys = {'schema', 'head', 'repo', 'runRoot', 'sourceArchive', 'filePins', 'tools',
            'network', 'locks', 'jobID', 'jobsPath', 'bounds', 'review', 'sdkRoot',
            'flutterRoot', 'pubCache', 'gradleReadOnlyCache', 'models', 'bootID', 'image', 'writeScope', 'pidNamespace', 'netNamespace', 'imageFiles', 'pluginCache'}
    if type(p) is not dict or set(p) != keys or p['schema'] != 'settleora-current-android-qualification-v1':
        raise ValueError('exact fresh qualification packet required')
    if not re.fullmatch('[0-9a-f]{40}', p['head']) or not re.fullmatch('[0-9a-f]{64}', p['sourceArchive']['sha256']):
        raise ValueError('exact source/archive digests required')
    if p['bounds'] != {'prepare': 300, 'boot': 600, 'test': 10800, 'cleanup': 90, 'retries': 0} or \
       any(type(x) is not int for x in p['bounds'].values()):
        raise ValueError('fixed integer deadlines and zero retry required')
    for pin in list(p['tools'].values()) + [p['sourceArchive'], p['image']]:
        if type(pin) is not dict or set(pin) != {'path', 'sha256'} or not re.fullmatch('[0-9a-f]{64}', pin['sha256']):
            raise ValueError('exact tool/image/archive digests required')
    if len({(x['device'], x['inode']) for x in p['locks']}) != 5 or len({x['path'] for x in p['locks']}) != 5:
        raise ValueError('five distinct exact qualification locks required')
    if set(p['tools']) != {'adb', 'emulator', 'avdmanager', 'flutter', 'node', 'java'} or len(p['locks']) != 5:
        raise ValueError('six exact tools and five locks required')
    validate_network_policy(p['network'])
    paths = [p[k] for k in ('repo', 'runRoot', 'sdkRoot', 'flutterRoot', 'pubCache', 'gradleReadOnlyCache', 'jobsPath')]
    paths += [p['sourceArchive']['path'], p['image']['path']] + list(p['filePins']) + [x['path'] for x in p['tools'].values()]
    if any(type(x) is not str or not Path(x).is_absolute() or '..' in Path(x).parts for x in paths):
        raise ValueError('canonical absolute paths required')
    if not p['jobID'].startswith('atlas-ocr-current-execute-') or not p['filePins'] or not p['models']:
        raise ValueError('explicit execution job, source and model bindings required')
    if any(not re.fullmatch('[0-9a-f]{64}', h) for h in p['filePins'].values()):
        raise ValueError('source hashes required')
    for pin in p['models']:
        if set(pin) != {'path', 'relativePath', 'sha256'} or not Path(pin['path']).is_absolute() or \
           '..' in Path(pin['path']).parts or Path(pin['relativePath']).is_absolute() or \
           '..' in Path(pin['relativePath']).parts or not pin['relativePath'] or \
           not re.fullmatch('[0-9a-f]{64}', pin['sha256']):
            raise ValueError('bounded canonical immutable model inputs required')
    if Path(p['runRoot']).parent != state_parent():
        raise ValueError('fixed owned qualification history parent required')
    if type(p['imageFiles']) is not dict or p['imageFiles'].get('system.img') != p['image']['sha256'] or \
       any(Path(k).is_absolute() or '..' in Path(k).parts or not re.fullmatch('[0-9a-f]{64}', v) for k, v in p['imageFiles'].items()):
        raise ValueError('complete system-image component manifest required')
    image = Path(p['sdkRoot']) / 'system-images/android-35/google_apis/x86_64/system.img'
    if p['image']['path'] != str(image):
        raise ValueError('hashed image must be the exact API35 package system image')
    expected_tools = {'adb': Path(p['sdkRoot']) / 'platform-tools/adb',
        'emulator': Path(p['sdkRoot']) / 'emulator/emulator',
        'avdmanager': Path(p['sdkRoot']) / 'cmdline-tools/latest/bin/avdmanager',
        'flutter': Path(p['flutterRoot']) / 'bin/flutter'}
    if any(p['tools'][role]['path'] != str(path) for role, path in expected_tools.items()):
        raise ValueError('tool roots must agree with SDK/Flutter package bindings')
    if set(p['pluginCache']) != {n for names in GENERATED_PLUGIN_NAMES.values() for n in names}:
        raise ValueError('exact generated plugin cache bindings required')
    for pin in p['pluginCache'].values():
        if set(pin) != {'version', 'archiveSHA256', 'treeSHA256'} or not re.fullmatch('[0-9A-Za-z.+_-]+', pin['version']) or any(not re.fullmatch('[0-9a-f]{64}', pin[k]) for k in ('archiveSHA256', 'treeSHA256')):
            raise ValueError('bounded pinned cache package identity required')
    if p['writeScope'] != write_scope(p):
        raise ValueError('normal SDK/cache effects must be explicitly admitted')
    return p


def check_signal_context(text):
    values = dict(x.split(':', 1) for x in text.splitlines() if ':' in x)
    if int(values['SigIgn'].strip(), 16) & (1 << (signal.SIGCHLD - 1)):
        raise RuntimeError('SIGCHLD ignored; actual child wait status unavailable')
    if any(int(values[k].strip(), 16) & (1 << (signal.SIGTERM - 1)) for k in ('SigBlk', 'SigIgn')):
        raise RuntimeError('launch SIGTERM blocked or ignored; do not change masks')


def check_free_emulator_ports(ports=(5554, 5555)):
    for table in ('tcp', 'tcp6'):
        for line in Path('/proc/net', table).read_text().splitlines()[1:]:
            row = line.split()
            if row[3] == '06' and row[9] == '0':
                continue
            if any(int(x.rsplit(':', 1)[1], 16) in ports for x in row[1:3]):
                raise RuntimeError('emulator console/transport ports occupied before launch')


def install_gradle_offline_init(parent):
    directory = Path(parent) / 'init.d'
    directory.mkdir(mode=0o700)
    path = directory / 'settleora-current-offline.gradle'
    with path.open('x') as stream:
        stream.write(OFFLINE_GRADLE_INIT)
    return path


def extract_source(archive, destination, check=lambda: None):
    """Only ordinary tracked files/directories in a fresh owned destination."""
    with tarfile.open(archive) as tar:
        members = tar.getmembers()
        if len(members) > 50000 or sum(m.size for m in members) > 2 * 1024**3:
            raise ValueError('source archive exceeds fixed bounds')
        if len({m.name for m in members}) != len(members):
            raise ValueError('duplicate archive member')
        for m in members:
            q = Path(m.name)
            if q.is_absolute() or '..' in q.parts or not (m.isfile() or m.isdir()):
                raise ValueError('linked/special/escaping source archive member')
        for member in members:
            check()
            tar.extract(member, destination, filter='data')
            check()


# Exact generated links observed after current offline pub resolution. Neither
# additional platforms/packages nor arbitrary generated symlinks are admitted.
GENERATED_PLUGIN_NAMES = {
    'linux': ('file_picker', 'file_selector_linux', 'flutter_secure_storage_linux', 'image_picker_linux', 'jni', 'path_provider_linux'),
    'windows': ('file_picker', 'file_selector_windows', 'flutter_secure_storage_windows', 'image_picker_windows', 'jni', 'path_provider_windows'),
}


def locked_hosted_package(lock, name):
    blocks = re.findall(r'^  ' + re.escape(name) + r':\n((?:    .*\n|\n)+)', lock, re.M)
    if len(blocks) != 1:
        raise RuntimeError('unique locked hosted plugin required')
    block = blocks[0]
    def field(pattern):
        matches = re.findall(pattern, block, re.M)
        if len(matches) != 1:
            raise RuntimeError('ambiguous locked plugin identity')
        return matches[0]
    version = field(r'^    version: "?([0-9A-Za-z.+_-]+)"?$')
    digest = field(r'^      sha256: "?([0-9a-f]{64})"?$')
    if field(r'^    source: (\w+)$') != 'hosted' or field(r'^      name: ([a-z0-9_]+)$') != name or \
       field(r'^      url: "?([^"\n]+)"?$') != 'https://pub.dev':
        raise RuntimeError('noncanonical hosted plugin identity')
    return version, digest


def cache_source_paths(root, check=lambda: None):
    """Stream entries with deadlines; never traverse links or JNI generated output."""
    root = Path(root)
    paths, pending = [], [root]
    entries = 0
    while pending:
        check()
        current = pending.pop()
        with os.scandir(current) as stream:
            for entry in stream:
                check()
                entries += 1
                if entries > 10000:
                    raise RuntimeError('bounded cache source inventory exceeded')
                path = current / entry.name
                metadata = entry.stat(follow_symlinks=False)
                if stat.S_ISLNK(metadata.st_mode):
                    raise RuntimeError('linked cache package member')
                if root.name == 'jni-1.0.0' and str(path.relative_to(root)) == 'android/.cxx':
                    continue
                paths.append(path)
                if stat.S_ISDIR(metadata.st_mode):
                    pending.append(path)
    return sorted(paths)


def cache_tree_digest(root, check=lambda: None):
    root = Path(root)
    filesystem_space(root)
    if not root.is_dir():
        raise RuntimeError('pinned cache package absent')
    paths = cache_source_paths(root, check)
    digest = hashlib.sha256()
    digest.update((json.dumps(['.', root.stat().st_mode & 0o7777, 'directory'], separators=(',', ':')) + '\n').encode())
    total = 0
    for path in paths:
        check()
        st = path.lstat()
        if stat.S_ISDIR(st.st_mode):
            frame = [str(path.relative_to(root)), st.st_mode & 0o7777, 'directory']
            digest.update((json.dumps(frame, separators=(',', ':')) + '\n').encode())
            continue
        if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1:
            raise RuntimeError('linked/special immutable cache source member')
        total += st.st_size
        if total > 128 * 1024**2:
            raise RuntimeError('bounded cache source bytes exceeded')
        frame = [str(path.relative_to(root)), st.st_mode & 0o7777, sha(path, check)]
        digest.update((json.dumps(frame, separators=(',', ':')) + '\n').encode())
    if paths != cache_source_paths(root, check):
        raise RuntimeError('cache source inventory changed during observation')
    return digest.hexdigest()


def verify_cache_bundle(pub_cache, cache_pins, check=lambda: None):
    for name, pin in cache_pins.items():
        root = Path(pub_cache) / 'hosted/pub.dev' / (name + '-' + pin['version'])
        if cache_tree_digest(root, check) != pin['treeSHA256']:
            raise RuntimeError('pinned cache package bytes/mode/inventory drift')


def verified_plugin_links(source, pub_cache, file_pins, cache_pins, check=lambda: None):
    lock_path = Path(source) / 'apps/mobile/pubspec.lock'
    lock = bounded_bytes(lock_path).decode()
    result = {}
    verify_cache_bundle(pub_cache, cache_pins, check)
    for name in sorted({n for names in GENERATED_PLUGIN_NAMES.values() for n in names}):
        version, digest = locked_hosted_package(lock, name)
        pin = cache_pins.get(name, {})
        if pin.get('version') != version or pin.get('archiveSHA256') != digest:
            raise RuntimeError('locked plugin differs from pinned cache identity')
        root = Path(pub_cache) / 'hosted/pub.dev' / (name + '-' + version)
        filesystem_space(root)  # Reject linked/untrusted cache ancestors without changes.
        if not root.is_dir():
            raise RuntimeError('locked plugin cache package absent')
        checksum = Path(pub_cache) / 'hosted-hashes/pub.dev' / (name + '-' + version + '.sha256')
        filesystem_space(checksum)
        if str(checksum) not in file_pins or sha(checksum, check) != file_pins[str(checksum)] or bounded_bytes(checksum).decode().strip() != digest:
            raise RuntimeError('locked plugin archive checksum identity drift')
        spec = bounded_bytes(root / 'pubspec.yaml').decode()
        if re.findall(r'^name: *([a-z0-9_]+) *$', spec, re.M) != [name] or \
           re.findall(r'^version: *[\'"]?([^\'" \n]+)[\'"]? *$', spec, re.M) != [version]:
            raise RuntimeError('locked cache package name/version differs')
        for platform, names in GENERATED_PLUGIN_NAMES.items():
            if name in names:
                result['apps/mobile/' + platform + '/flutter/ephemeral/.plugin_symlinks/' + name] = str(root)
    return result


def verify_source_tree(repo, head, destination, check=lambda: None, strict_inventory=True, generated_links=None):
    check()
    listing = subprocess.check_output(['git', '-C', repo, 'ls-tree', '-r', '-z', '--full-tree', head], timeout=5)
    check()
    expected = {}
    for item in listing.split(b'\0'):
        if not item:
            continue
        metadata, raw_path = item.split(b'\t', 1)
        mode, kind, object_id = metadata.decode().split()
        path = raw_path.decode()
        if kind != 'blob' or mode not in ('100644', '100755') or Path(path).is_absolute() or '..' in Path(path).parts:
            raise RuntimeError('only ordinary current tracked source files admitted')
        expected[path] = (mode, object_id)
    files = {}
    observed_links = {}
    for path in Path(destination).rglob('*'):
        if path.is_symlink():
            relative = str(path.relative_to(destination))
            if (strict_inventory or generated_links is None or relative not in generated_links or
                str(path.readlink()) != generated_links[relative] or relative in expected or
                any(name.startswith(relative + '/') for name in expected)):
                raise RuntimeError('unexpected/changed generated link or linked tracked source')
            observed_links[relative] = str(path.readlink())
            continue
        if path.is_file():
            files[str(path.relative_to(destination))] = path
    if generated_links is not None and observed_links != generated_links:
        raise RuntimeError('expected generated plugin link set differs')
    if (set(files) != set(expected) if strict_inventory else not set(expected) <= set(files)):
        raise RuntimeError('isolated source inventory differs from exact Git tree')
    for relative, (mode, object_id) in expected.items():
        check()
        path = files[relative]
        before = path.stat()
        h = hashlib.sha1(('blob ' + str(before.st_size) + '\0').encode())
        with path.open('rb') as stream:
            opened = os.fstat(stream.fileno())
            for block in iter(lambda: stream.read(1024 * 1024), b''):
                check()
                h.update(block)
            finished = os.fstat(stream.fileno())
        after = path.stat()
        identity = lambda st: (st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns, st.st_ctime_ns, st.st_mode)
        if any(identity(st) != identity(before) for st in (opened, finished, after)) or h.hexdigest() != object_id or \
           bool(before.st_mode & stat.S_IXUSR) != (mode == '100755'):
            raise RuntimeError('isolated source bytes/mode differ from exact Git tree')



class PipeCapture:
    """Hard bounded new-child stream. Overflow is counted and always fails epoch."""
    def __init__(self, source, destination, limit):
        self.source, self.destination, self.limit = source, destination, limit
        self.total = self.retained = 0
        self.overflow = False
        self.error = None
        self.thread = threading.Thread(target=self.drain, daemon=True)
        self.thread.start()

    def drain(self):
        try:
            read = getattr(self.source, 'read1', self.source.read)
            while chunk := read(65536):
                self.total += len(chunk)
                keep = chunk[:max(0, self.limit - self.retained)]
                if keep:
                    self.destination.write(keep)
                    self.retained += len(keep)
                self.overflow = self.total > self.limit
            self.destination.flush()
            os.fsync(self.destination.fileno())
        except BaseException as error:
            self.error = type(error).__name__
        finally:
            for stream in (self.source, self.destination):
                try:
                    stream.close()
                except BaseException as error:
                    self.error = self.error or type(error).__name__

    def finish(self, timeout):
        self.thread.join(timeout)
        return dict(complete=not self.thread.is_alive(), totalBytes=self.total,
                    retainedBytes=self.retained, limit=self.limit,
                    processOutputTruncated=self.overflow, error=self.error)


class Backend:
    def __init__(self, p, digest):
        self.p, self.digest = p, digest
        self.root = Path(p['runRoot'])
        self.scratch = self.root / 'scratch'
        self.children = {}
        self.launch_attempted = set()
        self.command_number = 0
        self.observed_test_exit = None
        self.failure_reason = None
        self.primary_failure_reason = None
        self.cleanup_failure_reason = None
        self.log_bound_failure = False
        self.subreaper = False
        self.owned_descendants = {}
        self.leases = []
        self.streams = []
        self.effects_closed = False
        self.life = None
        self.created = False
        self.consumed = False
        self.consumption_confirmed = False
        self.deadline = time.monotonic() + p['bounds']['prepare']

    def record(self, name, value):
        raw = (json.dumps(value, sort_keys=True) + '\n').encode()
        path = self.root / name
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as out:
            out.write(raw)
            out.flush()
            os.fsync(out.fileno())
        for parent in (self.root, self.root.parent):
            fd = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)

    def capture_limit(self, role):
        return 32 * 1024 * 1024 if role == 'runner' else CAP

    def command_output_limit(self, role):
        return CAP

    def log_bounds(self):
        for role, child in self.children.items():
            for capture in child.get('captures', []):
                if capture.overflow or capture.error:
                    raise RuntimeError('owned process output capture overflow/failure')
            limit = self.capture_limit(role)
            for channel in ('stdout', 'stderr'):
                p = self.scratch / (role + '_' + channel + '.log')
                if p.exists() and p.stat().st_size > limit:
                    raise RuntimeError('owned tool diagnostic exceeded its fixed byte budget; no log deletion')

    def clock(self):
        if time.monotonic() >= self.deadline:
            raise TimeoutError('phase deadline expired')

    def command(self, args, *, cwd=None, timeout=10, stdin=None, require_server=False):
        self.clock()
        self.command_number += 1
        if self.command_number > 1024:
            raise RuntimeError('fixed SDK/client command count exceeded')
        role = 'cmd_' + str(self.command_number)
        self.start(role, args, cwd=cwd, stdin=stdin, require_server=require_server)
        code = self.wait(role, timeout)
        child = self.children[role]
        for capture in child['captures']:
            report = capture.finish(min(5, max(.01, self.deadline - time.monotonic())))
            if not report['complete'] or report['error'] or report['processOutputTruncated']:
                raise RuntimeError('SDK/client output capture incomplete or truncated')
        if child['pidfd'] is not None:
            os.close(child['pidfd'])
            child['pidfd'] = None
        paths = [self.scratch / (role + '_' + name + '.log') for name in ('stdout', 'stderr')]
        if sum(p.stat().st_size for p in paths) > self.command_output_limit(role):
            raise RuntimeError('bounded SDK/client command output exceeded its fixed byte budget')
        if code != 0:
            raise SDKCommandError('bounded command failed: ' + Path(args[0]).name)
        return paths[0].read_text()

    def policy(self):
        wanted = self.p['network']
        got = {}
        for name in ('status', 'settings'):
            r = subprocess.run(['/usr/bin/nordvpn', name], capture_output=True, timeout=2,
                env={'HOME': str(Path.home()), 'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C'})
            if r.returncode or len(r.stdout) > 32768:
                raise RuntimeError('VPN observer failed')
            seen = set()
            for line in re.sub(r'\x1b\[[0-9;]*m', '', r.stdout.decode()).replace('\r', '').splitlines():
                if ':' not in line:
                    continue
                k, v = map(str.strip, line.split(':', 1))
                if k in wanted:
                    if k in seen or k in got and got[k] != v:
                        raise RuntimeError('ambiguous network/protection observer')
                    seen.add(k)
                    got[k] = v
        if got != wanted:
            raise RuntimeError('dedicated Boston/protection policy drift')

    def jobs(self):
        j = read_json(self.p['jobsPath'])
        if {k for k, v in j['jobs'].items() if v['state'] != 'completed'} != {self.p['jobID']} or j.get('queued'):
            raise RuntimeError('other registered/queued work requires reconciliation')
        status = decode(subprocess.check_output(['/usr/bin/python3', '-I',
            '/usr/local/libexec/devbox-maintenance/managed-entry.py', 'status'], timeout=3))
        if not maintenance_admission_open(status):
            raise RuntimeError('maintenance admission closed')

    def native_census(self, initial=False):
        for device in Path('/sys/bus/usb/devices').iterdir():
            interface = device / 'bInterfaceClass'
            if interface.exists() and interface.read_text().strip() not in ('09', '03'):
                raise RuntimeError('non-hub/HID USB transport candidate; no physical-device qualification')
        rows = {}
        for d in Path('/proc').iterdir():
            if d.name.isdigit():
                try:
                    raw = (d / 'stat').read_text()
                    f = raw[raw.rfind(')') + 2:].split()
                    rows[int(d.name)] = dict(ppid=int(f[1]), pgid=int(f[2]), sid=int(f[3]),
                        ticks=f[19], comm=raw[raw.find('(') + 1:raw.rfind(')')])
                except FileNotFoundError:
                    continue
        roots = set()
        for c in self.children.values():
            pid = c['proc'].pid
            if c['proc'].poll() is not None:
                continue
            if pid in rows:
                if rows[pid]['ticks'] != c['ticks']:
                    raise RuntimeError('owned root PID reused or identity unavailable')
                roots.add(pid)
        if self.subreaper:
            roots |= {pid for pid, row in rows.items() if row['ppid'] == os.getpid()}
        related = set(roots)
        while True:
            more = {pid for pid, row in rows.items() if row['ppid'] in related}
            if more <= related:
                break
            related |= more
        for pid in related:
            if pid in rows:
                self.owned_descendants[(pid, rows[pid]['ticks'])] = dict(rows[pid])
        for pid, row in rows.items():
            if pid not in related and (row['comm'] in NATIVE or row['comm'].startswith('qemu-system-')):
                raise RuntimeError('other native/client candidate active')
        if initial:
            for table in ('tcp', 'tcp6'):
                for line in Path('/proc/net', table).read_text().splitlines()[1:]:
                    v = line.split()
                    if v[3] == '06' and v[9] == '0':
                        continue  # Kernel TIME_WAIT without a user socket inode.
                    if any(int(x.rsplit(':', 1)[1], 16) in (5037, 5554, 5555) for x in v[1:3]):
                        raise RuntimeError('qualification listener/client ports occupied')
        return rows

    def acquire_leases(self):
        for pin in self.p['locks']:
            fd = os.open(pin['path'], os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK)
            self.leases.append(fd)
            st = os.fstat(fd)
            if (st.st_dev, st.st_ino, st.st_uid) != (pin['device'], pin['inode'], os.geteuid()):
                raise RuntimeError('lock identity drift')
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        check_previous_runs(state_parent(), self.p['filePins'], self.clock)

    def consume_and_adopt(self):
        # Any uncertain consume persistence makes this fresh directory unusable.
        # No child-reaping/process attribute change precedes durable consumption.
        self.consumed = True
        self.record('CONSUMED.json', dict(packetSHA256=self.digest, retries=0, nativeReady=False))
        self.consumption_confirmed = True
        self.clock()
        libc = ctypes.CDLL(None, use_errno=True)
        if libc.prctl(36, 1, 0, 0, 0) != 0:
            raise OSError(ctypes.get_errno(), 'cannot establish own child subreaper')
        self.subreaper = True

    def setup(self):
        if os.getuid() != os.geteuid() or os.getgid() != os.getegid():
            raise PermissionError('ordinary non-escalated account context required')
        self.policy()
        self.jobs()
        check_previous_runs(state_parent(), self.p['filePins'], self.clock)
        self.native_census(initial=True)
        if Path('/proc/sys/kernel/random/boot_id').read_text().strip() != self.p['bootID']:
            raise RuntimeError('host boot changed')
        if os.stat('/proc/self/ns/pid').st_ino != self.p['pidNamespace'] or os.stat('/proc/self/ns/net').st_ino != self.p['netNamespace']:
            raise RuntimeError('observer namespaces changed')
        check_signal_context(Path('/proc/thread-self/status').read_text())
        if subprocess.check_output(['git', '-C', self.p['repo'], 'rev-parse', 'HEAD'], text=True, timeout=5).strip() != self.p['head'] or \
           subprocess.check_output(['git', '--no-optional-locks', '-C', self.p['repo'], 'status', '--porcelain'], text=True, timeout=5):
            raise RuntimeError('source head/worktree changed')
        self.clock()
        self.acquire_leases()
        for path, wanted in self.p['filePins'].items():
            self.clock()
            if sha(path, self.clock) != wanted:
                raise RuntimeError('source/diagnostic binding drift')
        for pin in list(self.p['tools'].values()) + [self.p['sourceArchive']]:
            self.clock()
            if sha(pin['path'], self.clock) != pin['sha256']:
                raise RuntimeError('tool/archive identity drift')
        if not os.access('/dev/kvm', os.R_OK | os.W_OK):
            raise RuntimeError('KVM unavailable; no permission change')
        kvm = os.open('/dev/kvm', os.O_RDWR | os.O_CLOEXEC)
        try:
            if fcntl.ioctl(kvm, 0xAE00) != 12:
                raise RuntimeError('KVM API unavailable')
        finally:
            os.close(kvm)
        self.verify_image_bundle()
        check_write_space(self.p['writeScope'])
        self.verify_cache()
        available = int(next(x.split()[1] for x in Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:'))) * 1024
        if available < 12 * 1024**3:  # All write filesystems, including absent history, checked above.
            raise RuntimeError('native resources below required margin')
        flutter = Path(self.p['flutterRoot'])
        if (flutter / 'bin/cache/flutter_tools.stamp').read_text().strip() != '058e0af2c2b57e369d905a03ac9748b0ebf543c6:' or not (flutter / 'bin/cache/flutter_tools.snapshot').is_file():
            raise RuntimeError('SDK tool rebuild branch forbidden')
        helper = Path(__file__).with_name('disposable_lifecycle.py')
        if str(helper) not in self.p['filePins']:
            raise RuntimeError('exact existing lifecycle helper must be pinned')
        namespace = {'__name__': 'verified_disposable_lifecycle', '__file__': str(helper)}
        helper_bytes = bounded_bytes(helper)
        if hashlib.sha256(helper_bytes).hexdigest() != self.p['filePins'][str(helper)]:
            raise RuntimeError('lifecycle helper execution buffer drift')
        exec(compile(helper_bytes, str(helper), 'exec'), namespace)
        self.life = types.SimpleNamespace(**namespace)
        self.clock()
        self.root.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        check_previous_runs(state_parent(), self.p['filePins'], self.clock)
        self.life.prepare(self.root, source_sha256=hashlib.sha256(json.dumps(self.p['filePins'], sort_keys=True).encode()).hexdigest(),
            packet_sha256=self.digest, image_sha256=hashlib.sha256(json.dumps(self.p['imageFiles'], sort_keys=True).encode()).hexdigest(),
            command_sha256=hashlib.sha256(json.dumps(self.plan(), sort_keys=True).encode()).hexdigest())
        self.created = True
        self.consume_and_adopt()
        self.clock()
        for name in ('home', 'avd', 'emulator-home', 'android-user', 'gradle', 'tmp', 'source'):
            (self.scratch / name).mkdir(mode=0o700)
        install_gradle_offline_init(self.scratch / 'gradle')
        self.env = dict(PATH=':'.join([self.p['flutterRoot'] + '/bin', str(Path(self.p['tools']['java']['path']).parent), '/usr/bin', '/bin']),
            HOME=str(self.scratch / 'home'), TMPDIR=str(self.scratch / 'tmp'),
            ANDROID_HOME=self.p['sdkRoot'], ANDROID_SDK_ROOT=self.p['sdkRoot'],
            ANDROID_AVD_HOME=str(self.scratch / 'avd'), ANDROID_EMULATOR_HOME=str(self.scratch / 'emulator-home'),
            ANDROID_USER_HOME=str(self.scratch / 'android-user'), ADB_SERVER_SOCKET='tcp:127.0.0.1:5037',
            GRADLE_USER_HOME=str(self.scratch / 'gradle'), GRADLE_RO_DEP_CACHE=self.p['gradleReadOnlyCache'],
            GRADLE_OPTS='-Dorg.gradle.daemon=false -Dorg.gradle.workers.max=2 -Dorg.gradle.project.android.builder.sdkDownload=false',
            ORG_GRADLE_PROJECT_settleoraReleaseEvidence='true', ORG_GRADLE_PROJECT_settleoraReleaseOffline='true',
            PUB_CACHE=self.p['pubCache'], FLUTTER_TOOL_ARGS='', FLUTTER_SUPPRESS_ANALYTICS='true',
            CI='true', BOT='true', LANG='C.UTF-8', LC_ALL='C.UTF-8')
        extract_source(self.p['sourceArchive']['path'], self.scratch / 'source', self.clock)
        verify_source_tree(self.p['repo'], self.p['head'], self.scratch / 'source', self.clock)
        self.record('GRADLE_DISTRIBUTION_INSTALLED.json', install_gradle_distribution(self.p['gradleReadOnlyCache'], self.scratch / 'gradle', self.scratch / 'source/apps/mobile/android/gradle/wrapper/gradle-wrapper.properties', self.p['filePins'], self.clock))
        for pin in self.p['models']:
            target = self.scratch / 'source' / pin['relativePath']
            if sha(pin['path'], self.clock) != pin['sha256']:
                raise RuntimeError('immutable model/fixture drift')
            if not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                with open(pin['path'], 'rb') as source, open(target, 'xb') as dest:
                    while chunk := source.read(1024 * 1024):
                        self.clock()
                        dest.write(chunk)
            if sha(target, self.clock) != pin['sha256']:
                raise RuntimeError('isolated input identity drift')
        for relative in ('tools/ocr-models/bounded-process-capture.mjs', 'apps/mobile/integration_test/receipt_ocr_real_provider_test.dart'):
            if sha(self.scratch / 'source' / relative, self.clock) != sha(Path(self.p['repo']) / relative, self.clock):
                raise RuntimeError('isolated runtime differs from exact current source')
        self.command([self.p['tools']['node']['path'], str(self.scratch / 'source/tools/ocr-models/verify-mobile-models.mjs'),
                      '--repo-root', str(self.scratch / 'source')], timeout=120)
        self.command([self.p['tools']['flutter']['path'], 'pub', 'get', '--offline'],
                     cwd=self.scratch / 'source/apps/mobile', timeout=120)
        if sha(self.scratch / 'source/apps/mobile/pubspec.lock', self.clock) != sha(Path(self.p['repo']) / 'apps/mobile/pubspec.lock', self.clock):
            raise RuntimeError('offline dependency selection changed')
        verify_source_tree(self.p['repo'], self.p['head'], self.scratch / 'source', self.clock, strict_inventory=False, generated_links=self.plugin_links())
        self.command([self.p['tools']['avdmanager']['path'], 'create', 'avd', '-n', 'settleora_current',
                      '-k', 'system-images;android-35;google_apis;x86_64'], stdin=b'no\n', timeout=60)

    def plan(self):
        return {'scope': 'current unchanged all101 image-to-preview and additional native tests',
                'port': 5554, 'sourceHead': self.p['head'], 'retries': 0, 'isolation': 'fresh AVD airplane/wifi/data off',
                'testCapture': 'canonical current Android Flutter argv, direct original pidfd, hard32MiB/stream, no numeric group signal'}

    def verify_tool(self, argv):
        pin = next((p for p in self.p['tools'].values() if p['path'] == argv[0]), None)
        if pin is None or sha(pin['path'], self.clock) != pin['sha256']:
            raise RuntimeError('adjacent executable tool binding drift')
        if argv[0] in (self.p['tools']['avdmanager']['path'], self.p['tools']['flutter']['path']):
            java = self.p['tools']['java']
            if sha(java['path'], self.clock) != java['sha256']:
                raise RuntimeError('adjacent indirect Java executable drift')

    def start(self, role, argv, cwd=None, stdin=None, require_server=False):
        if (role not in ROLES and not re.fullmatch(r'cmd_[1-9][0-9]{0,3}', role)) or self.effects_closed or role in self.launch_attempted:
            raise RuntimeError('closed or already launched role')
        self.clock()
        self.jobs()
        self.policy()
        self.native_census()
        check_signal_context(Path('/proc/thread-self/status').read_text())
        streams = [open(self.scratch / (role + '_' + name + '.log'), 'xb') for name in ('stdout', 'stderr')]
        self.streams += streams
        self.launch_attempted.add(role)
        self.record('LAUNCH_ATTEMPTED_' + role + '.json', dict(role=role, argv=argv, retries=0))
        self.verify_tool(argv)
        if role == 'runner':
            init = self.scratch / 'gradle/init.d/settleora-current-offline.gradle'
            if bounded_bytes(init).decode() != OFFLINE_GRADLE_INIT:
                raise RuntimeError('offline Gradle initialization not installed before settings resolution')
        if role == 'emulator':
            check_free_emulator_ports()
        if require_server:
            self.require_server()  # After all observer/durable writes, adjacent to Popen.
        self.clock()
        proc = subprocess.Popen(argv, cwd=cwd, env=self.env, stdin=subprocess.PIPE if stdin is not None else subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        # Register immediately, including uncertain subsequent pin/metadata failure.
        child = dict(proc=proc, pidfd=None, ticks=None, identityConfirmed=False, termAttempted=False, streams=streams, captures=[], captureSetupComplete=False)
        self.children[role] = child
        limit = self.capture_limit(role)
        for source, target in zip((proc.stdout, proc.stderr), streams):
            child['captures'].append(PipeCapture(source, target, limit))
        child['captureSetupComplete'] = True
        child['pidfd'] = os.pidfd_open(proc.pid, 0)
        raw = Path('/proc', str(proc.pid), 'stat').read_text()
        f = raw[raw.rfind(')') + 2:].split()
        if int(f[1]) != os.getpid() or int(f[2]) != proc.pid or int(f[3]) != proc.pid:
            raise RuntimeError('new direct child session identity differs')
        child['ticks'] = f[19]
        child['identityConfirmed'] = True
        if stdin is not None:
            proc.stdin.write(stdin)
            proc.stdin.close()
        self.record('LAUNCH_OBSERVED_' + role + '.json', dict(pid=proc.pid, ticks=child['ticks'], role=role))

    def wait(self, role, seconds):
        end = min(self.deadline, time.monotonic() + seconds)
        next_gate = time.monotonic()
        while True:
            code = self.children[role]['proc'].poll()
            if code is not None:
                return code
            if time.monotonic() >= end:
                raise TimeoutError('owned child did not finish')
            if self.effects_closed:
                try:
                    self.log_bounds()
                except (OSError, RuntimeError):
                    self.log_bound_failure = True  # Keep waiting for owned exits, but never clean-proof.
            if not self.effects_closed:
                self.log_bounds()
                if time.monotonic() >= next_gate:
                    self.jobs()
                    self.policy()
                    self.native_census()
                    next_gate = time.monotonic() + 10
            time.sleep(min(.1, max(0, end - time.monotonic())))

    def require_server(self):
        c = self.children.get('adb')
        if c is None or c['proc'].poll() is not None or c['pidfd'] is None:
            raise RuntimeError('owned foreground ADB absent; never start a replacement')
        root = Path('/proc', str(c['proc'].pid))
        raw = (root / 'stat').read_text()
        fields = raw[raw.rfind(')') + 2:].split()
        if fields[19] != c['ticks'] or int(fields[1]) != os.getpid():
            raise RuntimeError('owned ADB identity drift')
        sockets = set()
        for fd in (root / 'fd').iterdir():
            try:
                sockets.add(os.readlink(fd))
            except FileNotFoundError:
                continue  # An unrelated transient client FD may close.

        for line in Path('/proc/net/tcp').read_text().splitlines()[1:]:
            v = line.split()
            if v[1] == '0100007F:13AD' and v[3] == '0A' and 'socket:[' + v[9] + ']' in sockets:
                return
        raise RuntimeError('loopback5037 listener not owned by foreground ADB')

    def adb(self, args):
        self.require_server()
        out = self.command([self.p['tools']['adb']['path'], '-H', '127.0.0.1', '-P', '5037',
                            '-s', 'emulator-5554'] + args, timeout=5, require_server=True)
        self.require_server()
        return out

    def execute(self):
        self.start('adb', [self.p['tools']['adb']['path'], '-L', 'tcp:localhost:5037', 'server', 'nodaemon'])
        server_end = min(self.deadline, time.monotonic() + 10)
        while True:
            try:
                self.require_server()
                break
            except RuntimeError:
                if self.children['adb']['proc'].poll() is not None or time.monotonic() >= server_end:
                    raise
                time.sleep(.1)
        self.start('emulator', [self.p['tools']['emulator']['path'], '-avd', 'settleora_current', '-port', '5554',
            '-no-window', '-no-snapshot', '-noaudio', '-no-boot-anim', '-no-metrics', '-gpu', 'swiftshader_indirect',
            '-sysdir', str(Path(self.p['image']['path']).parent), '-system', self.p['image']['path']], require_server=True)
        self.clock()  # Preparation/launch bookkeeping cannot renew an expired phase.
        self.deadline = time.monotonic() + self.p['bounds']['boot']
        while True:
            self.clock()
            self.log_bounds()
            if any(self.children[role]['proc'].poll() is not None for role in ('adb', 'emulator')):
                raise RuntimeError('owned server/emulator exited during boot')
            try:
                if self.adb(['shell', 'getprop', 'sys.boot_completed']).strip() == '1':
                    break
            except SDKCommandError:
                pass  # Device-offline/not-found is a bounded boot-readiness poll only.
            time.sleep(1)
        self.isolate_emulator()
        self.clock()  # Boot/isolation must finish within its existing phase.
        self.deadline = time.monotonic() + self.p['bounds']['test']
        self.verify_runtime_inputs()
        # Same Android test argv as the current capture helper, without its
        # numeric process-group cancellation. Python retains the original pidfd.
        self.start('runner', [self.p['tools']['flutter']['path'], 'test',
            'integration_test/receipt_ocr_real_provider_test.dart', '-d', 'emulator-5554',
            '--timeout', '6h', '--machine', '--no-pub'],
            cwd=self.scratch / 'source/apps/mobile', require_server=True)
        code = self.wait('runner', self.p['bounds']['test'])
        self.observed_test_exit = code
        verify_source_tree(self.p['repo'], self.p['head'], self.scratch / 'source', self.clock, strict_inventory=False, generated_links=self.plugin_links())
        return code

    def isolate_emulator(self):
        # API35 svc data is an asynchronous Telephony request, not a promise
        # that the unscoped persisted user setting has become zero.
        for args in (['shell', 'settings', 'put', 'global', 'airplane_mode_on', '1'],
                     ['shell', 'cmd', 'connectivity', 'airplane-mode', 'enable'],
                     ['shell', 'svc', 'wifi', 'disable'], ['shell', 'svc', 'data', 'disable'],
                     ['shell', 'settings', 'put', 'global', 'mobile_data', '0']):
            self.adb(args)  # Each write at most once, only the owned emulator.
        previous_deadline = self.deadline
        self.deadline = min(previous_deadline, time.monotonic() + 10)
        reads = [('airplane_mode_on', ['shell', 'settings', 'get', 'global', 'airplane_mode_on'], '1'),
                 ('airplane_mode', ['shell', 'cmd', 'connectivity', 'airplane-mode'], 'enabled'),
                 ('wifi_on', ['shell', 'settings', 'get', 'global', 'wifi_on'], '0'),
                 ('mobile_data', ['shell', 'settings', 'get', 'global', 'mobile_data'], '0')]
        try:
            for attempt in range(1, 21):
                self.clock()
                observed = {name: self.adb(args).strip() for name, args, wanted in reads}
                self.record('ISOLATION_OBSERVATION_' + str(attempt) + '.json', observed)
                self.clock()
                if all(observed[name] == wanted for name, args, wanted in reads):
                    return
                time.sleep(.25)
            raise RuntimeError('owned emulator isolation not established: ' + json.dumps(observed, sort_keys=True))
        finally:
            self.deadline = previous_deadline

    def verify_cache(self):
        verified_plugin_links(self.p['repo'], self.p['pubCache'], self.p['filePins'], self.p['pluginCache'], self.clock)

    def plugin_links(self):
        return verified_plugin_links(self.scratch / 'source', self.p['pubCache'], self.p['filePins'], self.p['pluginCache'], self.clock)

    def verify_runtime_inputs(self):
        verify_source_tree(self.p['repo'], self.p['head'], self.scratch / 'source', self.clock, strict_inventory=False, generated_links=self.plugin_links())
        for pin in self.p['models']:
            if sha(self.scratch / 'source' / pin['relativePath'], self.clock) != pin['sha256']:
                raise RuntimeError('isolated runtime model/fixture changed before runner launch')

    def stop(self, role):
        if role not in self.children:
            return
        c = self.children[role]
        if not c.get('identityConfirmed', c['ticks'] is not None):
            raise RuntimeError('original child identity was never fully established; failed epoch')
        if c['proc'].poll() is not None:
            return
        self.clock()
        if c['pidfd'] is None or c['ticks'] is None or c['termAttempted']:
            raise RuntimeError('uncertain original child identity; no signal/retry')
        raw = Path('/proc', str(c['proc'].pid), 'stat').read_text()
        f = raw[raw.rfind(')') + 2:].split()
        if f[19] != c['ticks'] or int(f[1]) != os.getpid() or int(f[2]) != c['proc'].pid or int(f[3]) != c['proc'].pid:
            raise RuntimeError('original direct owned child identity drift')
        c['termAttempted'] = True  # Uncertain receipt/syscall is never retried.
        self.record('TERM_ATTEMPTED_' + role + '.json', dict(role=role, pid=c['proc'].pid, ticks=c['ticks']))
        self.clock()
        signal.pidfd_send_signal(c['pidfd'], signal.SIGTERM, None, 0)
        self.wait(role, 20)

    def verify_image_bundle(self):
        parent = Path(self.p['image']['path']).parent
        files = {}
        for path in parent.rglob('*'):
            if path.is_symlink():
                raise RuntimeError('linked system-image component')
            if path.is_file():
                files[str(path.relative_to(parent))] = path
        if set(files) != set(self.p['imageFiles']):
            raise RuntimeError('system-image package inventory drift')
        for relative, wanted in self.p['imageFiles'].items():
            if sha(files[relative], self.clock) != wanted:
                raise RuntimeError('kernel/ramdisk/vendor/system image component drift')

    def verify_preserved_inputs(self):
        self.verify_cache()
        for path, wanted in self.p['filePins'].items():
            if sha(path, self.clock) != wanted:
                raise RuntimeError('protected source/history bytes changed')
        self.verify_image_bundle()
        for pin in [self.p['sourceArchive']] + self.p['models']:
            if sha(pin['path'], self.clock) != pin['sha256']:
                raise RuntimeError('immutable source/image/model input changed')

    def observe_owned_quiescence(self, seconds=10):
        # Observation/reaping only: never signal adopted helpers or retry roots.
        end = min(self.deadline, time.monotonic() + seconds)
        direct = {c['proc'].pid for c in self.children.values()}
        for attempt in range(41):
            self.clock()
            rows = self.native_census()
            for pid, row in list(rows.items()):
                if self.subreaper and row['ppid'] == os.getpid() and pid not in direct:
                    try:
                        os.waitpid(pid, os.WNOHANG)
                    except ChildProcessError:
                        pass
            rows = self.native_census()
            remaining = [pid for pid, row in rows.items() if row['sid'] in direct or row['pgid'] in direct or
                         (self.subreaper and row['ppid'] == os.getpid()) or (pid, row['ticks']) in self.owned_descendants]
            if not remaining or time.monotonic() >= end:
                return rows, remaining
            time.sleep(min(.25, max(0, end - time.monotonic())))
        return rows, remaining

    def cleanup(self):
        self.effects_closed = True
        self.deadline = min(time.monotonic() + self.p['bounds']['cleanup'], getattr(self, 'hard_deadline', float('inf')))
        failures = []
        if self.created and not self.consumption_confirmed:
            raise RuntimeError('uncertain consumption durability; cleanup proof forbidden')
        if not self.children:
            if self.created:
                self.verify_preserved_inputs()
                rows = self.native_census(initial=True)
                if self.subreaper and any(row['ppid'] == os.getpid() for row in rows.values()):
                    raise RuntimeError('adopted child remains after consumed zero-root preparation')
                self.clock()
                self.record('CLEANUP_OBSERVED.json', dict(remaining=[], ownedChildrenCreated=0, nativeReady=False))
            return
        for role in ROLES + tuple(reversed([x for x in self.children if x.startswith('cmd_')])):
            try:
                self.stop(role)
            except BaseException as e:
                failures.append(type(e).__name__ + ':' + role)
        rows, remaining = self.observe_owned_quiescence()
        sessions = {c['proc'].pid for c in self.children.values()}
        if failures or remaining or any(c['proc'].poll() is None for c in self.children.values()):
            raise RuntimeError('owned cleanup incomplete; no retry: ' + ','.join(failures) + '; remaining=' + json.dumps(remaining))
        self.verify_preserved_inputs()
        self.log_bounds()
        if self.log_bound_failure:
            raise RuntimeError('cleanup diagnostic bounds were violated')
        final_rows = self.native_census(initial=True)
        if any(row['sid'] in sessions or row['pgid'] in sessions or
               (self.subreaper and row['ppid'] == os.getpid()) or (pid, row['ticks']) in self.owned_descendants
               for pid, row in final_rows.items()):
            raise RuntimeError('owned descendant appeared in final cleanup observation')
        self.clock()
        self.record('CLEANUP_OBSERVED.json', dict(remaining=[], directChildrenExited=True, nativeReady=False))

    def retain(self, exit_code, clean):
        if self.life is None or not self.created:
            return
        self.record('FAILURE_CAUSES.json', dict(schema='settleora-native-failure-causes-v1', primaryFailure=self.primary_failure_reason, cleanupFailure=self.cleanup_failure_reason))
        self.record('OWNED_DESCENDANTS.json', dict(observed=[dict(pid=pid, **row) for (pid, ticks), row in self.owned_descendants.items()], cleanupVerified=clean))
        captures = {}
        for role, child in self.children.items():
            for index, capture in enumerate(child.get('captures', [])):
                captures[role + ':' + str(index)] = capture.finish(5)
        setup_complete = all(c.get('captureSetupComplete', True) for c in self.children.values())
        self.record('CAPTURE_COMPLETENESS.json', dict(streams=captures, setupComplete=setup_complete))
        if not setup_complete or any(not p['complete'] or p['error'] or p['processOutputTruncated'] for p in captures.values()):
            raise RuntimeError('process-output capture incomplete/truncated; no completed epoch claim')
        for stream in self.streams:
            stream.close()
        names = []
        for name, file in [('emulator_stdout', 'emulator_stdout.log'), ('emulator_stderr', 'emulator_stderr.log'),
                           ('anchor_stderr', 'runner_stderr.log'), ('flutter_stdout', 'runner_stdout.log'),
                           ('flutter_stderr', 'runner_stderr.log')]:
            if (self.scratch / file).exists():
                self.life.capture(self.root, name, file)
                names.append(name)
        (self.scratch / 'tool_result.json').write_text(json.dumps(dict(schema='settleora-native-tool-result-v2', testExitCode=exit_code, cleanupVerified=clean,
            nativeReady=False, consumed=self.consumed, consumptionDurabilityConfirmed=self.consumption_confirmed, qualificationFailure=self.failure_reason, primaryFailure=self.primary_failure_reason, cleanupFailure=self.cleanup_failure_reason, children={k: dict(pid=v['proc'].pid, ticks=v['ticks'], returnCode=v['proc'].poll(),
            termAttempted=v['termAttempted']) for k, v in self.children.items()})))
        self.life.capture(self.root, 'tool_result', 'tool_result.json')
        names.append('tool_result')
        self.life.finish(self.root, test_exit_code=exit_code, cleanup_verified=clean, diagnostics=names)
        diagnostic_fd = os.open(self.root / 'diagnostics', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(diagnostic_fd)
        finally:
            os.close(diagnostic_fd)
        self.record('SUPERVISOR_FINALIZED.json', dict(schema='settleora-native-supervisor-final-v2', testExitCode=exit_code, cleanupVerified=clean, nativeReady=False, qualificationFailure=self.failure_reason, primaryFailure=self.primary_failure_reason, cleanupFailure=self.cleanup_failure_reason,
            normalExecutorReturnStillRequiresExternalReadback=True))

    def release(self):
        for c in self.children.values():
            if c['pidfd'] is not None:
                os.close(c['pidfd'])
        for fd in self.leases:
            os.close(fd)


def run(p, digest, invocation, backend_type=Backend):
    if _invocation is None or invocation is not _invocation:
        raise PermissionError('verified normal entry context required')
    validate(p)
    b = backend_type(p, digest)
    code, cleaned, failure = 98, False, None
    try:
        b.setup()
        code = b.execute()
        if type(code) is not int or not 0 <= code <= 255:
            code = 98
    except BaseException as e:
        failure = e
        b.primary_failure_reason = type(e).__name__ + ': ' + str(e)
        b.failure_reason = b.primary_failure_reason
    finally:
        try:
            b.cleanup()
            cleaned = True
        except BaseException as e:
            b.cleanup_failure_reason = type(e).__name__ + ': ' + str(e)
            if failure is None:
                failure = e
        if type(getattr(b, 'observed_test_exit', None)) is int and 0 <= b.observed_test_exit <= 255:
            code = b.observed_test_exit
        if failure is not None:
            b.failure_reason = type(failure).__name__ + ': ' + str(failure)
        try:
            b.retain(code, cleaned)
        finally:
            b.release()
    if failure:
        raise failure
    return dict(testExitCode=code, cleanupVerified=cleaned, nativeReady=False, automaticRetries=0)


def main():
    ap = argparse.ArgumentParser()
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--validate-only', action='store_true')
    mode.add_argument('--execute-admitted', action='store_true')
    ap.add_argument('--packet', required=True)
    ap.add_argument('--packet-sha256', required=True)
    a = ap.parse_args()
    raw = bounded_bytes(a.packet)
    if len(raw) > CAP or hashlib.sha256(raw).hexdigest() != a.packet_sha256:
        raise ValueError('exact admitted raw packet required')
    p = validate(decode(raw))
    # Clean, exact-source review gates are independently authenticated by Atlas.
    review = p['review']
    manifest = bounded_bytes(review['manifestPath'])
    if hashlib.sha256(manifest).hexdigest() != review['manifestSHA256']:
        raise RuntimeError('review manifest drift')
    expected_names = {'current_android_qualification.py', 'test_current_android_qualification.py',
                      'disposable_lifecycle.py', 'bounded-process-capture.mjs', 'CONTRACT.md'}
    if set(decode(manifest)) != expected_names:
        raise RuntimeError('exact five-file review scope required')
    if decode(manifest)['current_android_qualification.py'] != sha(__file__) or \
       decode(manifest)['disposable_lifecycle.py'] != sha(Path(__file__).with_name('disposable_lifecycle.py')) or \
       decode(manifest)['bounded-process-capture.mjs'] != sha(Path(p['repo']) / 'tools/ocr-models/bounded-process-capture.mjs'):
        raise RuntimeError('reviewed production buffers differ')
    for name, wanted in decode(manifest).items():
        if sha(Path(review['manifestPath']).parent / name) != wanted:
            raise RuntimeError('reviewed file drift')
    for provider in ('codex', 'grok'):
        path = review[provider + 'Path']
        if sha(path) != review[provider + 'SHA256']:
            raise RuntimeError('review receipt drift')
        receipt = read_json(path)
        verdict = receipt if provider == 'codex' else receipt.get('parsed', {}).get('verdict', {})
        if verdict.get('verdict') != 'pass' or verdict.get('findings') != [] or \
           review['manifestSHA256'] not in verdict.get('summary', ''):
            raise RuntimeError('exact clean independent reviews required')
        if provider == 'grok' and (receipt.get('reason') is not None or type(receipt.get('exitCode')) is not int or receipt.get('exitCode') != 0 or receipt.get('parsed', {}).get('ok') is not True or
                receipt.get('coveredLines') != receipt.get('totalLines') or receipt.get('totalLines') !=
                len(manifest.decode().splitlines()) + sum(len((Path(review['manifestPath']).parent / n).read_text().splitlines()) for n in expected_names)):
            raise RuntimeError('Grok complete successful review required')
    if a.validate_only:
        print(json.dumps(dict(validated=True, effects=0)))
    else:
        global _invocation
        _invocation = object()
        result = run(p, a.packet_sha256, _invocation)
        print(json.dumps(result))
        raise SystemExit(result['testExitCode'])


if __name__ == '__main__':
    main()
