"""One separately admitted QEMU-only partial cleanup. Importing has no effects.

No ADB protocol/command, group signal, escalation or signal to observed children.
The approved watchdog module supplies only private observation descriptors.
"""
import hashlib
import json
import os
from pathlib import Path
import select
import signal
import stat
import threading
import time

LIVE = frozenset(('R', 'S', 'D', 'T', 't', 'I'))
DEAD = frozenset(('Z', 'X', 'x'))
STABLE = ('pid', 'ticks', 'uid', 'pgid', 'sid', 'ppid', 'exe', 'argv')


def identity(row):
    return {k: row[k] for k in STABLE}


def checkpoint(clock, deadline):
    if clock() >= deadline:
        raise TimeoutError('fixed partial cleanup deadline')


def run_partial(packet, backend, hard_deadline):
    """SDK-free testable logic; backend is the only effect boundary."""
    checkpoint(backend.clock, hard_deadline)
    deadline = min(hard_deadline, backend.clock() + 22)
    backend.stage = 'initial_graph'
    expected = backend.expected
    qpid, npid, apid, dpid = [packet[k] for k in ('qemuPID', 'netsimdPID', 'anchorPID', 'adbPID')]
    retained = {apid, dpid}
    fds = {}
    observer = None
    crashpad = None
    sent = False
    exited = set()
    try:
        rows = backend.graph()
        backend.stage = 'exact_preexisting_crashpad_observation'
        crashpad = backend.crashpad_observer(deadline)
        rows = crashpad.before_effect(rows)
        if set(rows) != set(expected):
            raise RuntimeError('initial graph differs from frozen original identities')
        if any(rows[p]['state'] not in LIVE or identity(rows[p]) != expected[p] for p in expected):
            raise RuntimeError('initial identity drift')
        backend.stage = 'image_pins'
        backend.verify_images(rows)
        for pid in expected:
            checkpoint(backend.clock, deadline)
            fds[pid] = backend.hold(pid)
        observer = backend.observer(rows[qpid], rows[apid], deadline)
        if observer is None:
            raise RuntimeError('exact direct-parent watchdog contract unavailable')
        backend.stage = 'held_identity_recheck'
        fresh = crashpad.before_effect(backend.graph())
        if set(fresh) != set(expected) or any(
                fresh[p]['state'] not in LIVE or identity(fresh[p]) != expected[p] for p in expected):
            raise RuntimeError('identity changed after held pidfds')
        backend.verify_images(fresh)
        if backend.exits(fds):
            raise RuntimeError('held original exited before effect')
        checkpoint(backend.clock, deadline)
        # No observed/observer descriptor can enter this call. Exactly this pin.
        backend.stage = 'sole_qemu_sigterm'
        crashpad.effect_will_be_attempted()
        backend.send_qemu(fds[qpid], qpid)
        backend.stage = 'partial_settlement'
        sent = True
        while True:
            checkpoint(backend.clock, deadline)
            exited |= backend.exits(fds)
            if exited & retained:
                raise RuntimeError('retained anchor or ADB exited unexpectedly')
            rows = crashpad.after_effect(backend.graph(allowed_exits=exited))
            additions = [r for pid, r in rows.items() if pid not in expected]
            observer.observe(additions, exited)
            for pid, old in expected.items():
                row = rows.get(pid)
                if row is not None and row['state'] in LIVE:
                    if pid in exited:
                        raise RuntimeError('live identity after held exit')
                    changed = [k for k in STABLE if row[k] != old[k]]
                    adopted = changed == ['ppid'] and pid == npid and qpid in exited and \
                              old['ppid'] == qpid and row['ppid'] == apid and apid not in exited
                    if changed and not adopted:
                        raise RuntimeError('known live identity drift')
                    if adopted:
                        expected[pid] = identity(row)
                    continue
                state = backend.state(pid)
                if state is not None:
                    # Exit/reparenting is observed only after the held QEMU exit.
                    wanted = tuple(old[k] for k in ('pid', 'ticks', 'ppid', 'pgid', 'sid', 'uid'))
                    adopted = pid == npid and qpid in exited and state[2] == apid and \
                              old['ppid'] == qpid and state[:2] == wanted[:2] and state[3:6] == wanted[3:]
                    if (state[:6] != wanted and not adopted) or state[6] not in DEAD:
                        raise RuntimeError('absent-group identity remains or changed')
                if pid not in exited:
                    raise RuntimeError('missing identity without held exit proof')
            if {qpid, npid} <= exited:
                proof = observer.proof()
                # A helper can be absent only after the observer's full exit proof.
                permitted = {apid, dpid}
                if observer.candidate is not None:
                    permitted.add(observer.candidate['pid'])
                if set(rows) - permitted:
                    raise RuntimeError('unsettled extra process')
                crashpad_proof = crashpad.proof()
                observer_retained = {crashpad_proof['retainedPID']} if crashpad_proof['retainedPID'] is not None else set()
                checkpoint(backend.clock, deadline)
                return {'status': 'PARTIAL_QEMU_NETSIMD_EXIT_PROVEN', 'qemuHeldExit': True,
                        'netsimdHeldExit': True, 'retainedPIDs': sorted(retained | observer_retained),
                        'observationOnlyCrashpad': crashpad_proof,
                        'signalConfirmed': sent, 'watchdogProof': proof,
                        'allProcessesCleaned': False, 'nativeReady': False}
            backend.pause(min(.05, max(0, deadline - backend.clock())))
    finally:
        if crashpad is not None:
            crashpad.close()
        if observer is not None:
            observer.close()
        for fd in fds.values():
            backend.close(fd)


def file_pin(path, deadline):
    checkpoint(time.monotonic, deadline)
    path = Path(path)
    for p in (path, *path.parents):
        if p.is_symlink():
            raise RuntimeError('linked protected path')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode):
            raise RuntimeError('protected path not regular')
        h = hashlib.sha256()
        while True:
            checkpoint(time.monotonic, deadline)
            block = os.read(fd, 1024 * 1024)
            if not block:
                break
            h.update(block)
        after = os.fstat(fd)
        fields = ('st_dev', 'st_ino', 'st_size', 'st_mode', 'st_uid', 'st_mtime_ns', 'st_ctime_ns')
        pin = {k: getattr(before, k) for k in fields}
        if pin != {k: getattr(after, k) for k in fields} or \
           pin != {k: getattr(os.stat(path, follow_symlinks=False), k) for k in fields}:
            raise RuntimeError('protected bytes changed during read')
        return {**pin, 'sha256': h.hexdigest()}
    finally:
        os.close(fd)


def bounded_json(path):
    path = Path(path)
    for ancestor in (path, *path.parents):
        if ancestor.is_symlink():
            raise RuntimeError('linked control path')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_uid != os.getuid() or st.st_size > 2 * 1024 * 1024:
            raise RuntimeError('control file type owner or size')
        data = os.read(fd, 2 * 1024 * 1024 + 1)
        if len(data) != st.st_size:
            raise RuntimeError('control file read changed')
        return json.loads(data), hashlib.sha256(data).hexdigest()
    finally:
        os.close(fd)


def load_crashpad_module(packet, deadline):
    import importlib.util
    path = Path(packet['crashpadModule']['path'])
    if path != Path(__file__).resolve().with_name('crashpad_observer_v1.py') or \
       file_pin(path, deadline)['sha256'] != packet['crashpadModule']['sha256']:
        raise RuntimeError('observation module path or digest changed')
    spec = importlib.util.spec_from_file_location('settleora_pinned_crashpad_observer', path)
    module = importlib.util.module_from_spec(spec)
    import sys
    sys.dont_write_bytecode = True
    spec.loader.exec_module(module)
    checkpoint(time.monotonic, deadline)
    return module


def check_admission(packet, packet_sha, decision, ack, runtime_pid, runtime_ticks):
    if packet['schema'] != 'settleora-exact-qemu-only-partial-cleanup-v2' or \
       decision['recordKind'] != 'REPOSITORY_TECHNICAL_DECISION_NOT_PLATFORM_PERMISSION' or \
       decision['decisionMaker'] != 'Atlas' or \
       decision['decision'] != 'APPROVE_EXACT_QEMU_ONLY_PARTIAL_CLEANUP' or \
       decision['packetSha256'] != packet_sha or \
       decision['adapterSha256'] != packet['adapterSha256'] or \
       decision['reviewCandidateSha256'] != packet['reviewCandidateSha256'] or \
       decision['runtimeBudget'] != 1 or decision['automaticRetries'] != 0:
        raise RuntimeError('exact repository technical admission missing')
    if ack['recordKind'] != 'ACTUAL_NORMAL_TOOL_RETURN_ACK' or not ack['execSessionId'] or \
       ack['normalSupervisorPid'] != runtime_pid or ack['leaseHolderPID'] != runtime_pid or \
       ack['packetSha256'] != packet_sha or ack['normalSupervisorStartTicks'] != runtime_ticks:
        raise RuntimeError('actual normal executor acceptance missing')


def exclusive_json(path, value, expected_directory=None):
    path = Path(path)
    directory = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in path.parent.parts[1:]:
            next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                              dir_fd=directory)
            os.close(directory)
            directory = next_fd
        directory_stat = os.fstat(directory)
        if expected_directory is not None and (directory_stat.st_dev, directory_stat.st_ino) != expected_directory:
            raise RuntimeError('evidence output directory identity changed')
        if directory_stat.st_uid != os.getuid():
            raise RuntimeError('evidence output owner changed')
        raw = (json.dumps(value, indent=2) + '\n').encode()
        if len(raw) > 65536:
            raise RuntimeError('bounded evidence output exceeded')
        fd = os.open(path.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o600, dir_fd=directory)
        with os.fdopen(fd, 'wb') as f:
            f.write(raw)
    finally:
        os.close(directory)


class LinuxBackend:
    """Pinned local reads and one constant-target pidfd SIGTERM; no process launch."""
    clock = staticmethod(time.monotonic)
    pause = staticmethod(time.sleep)
    close = staticmethod(os.close)

    def __init__(self, packet, boot, watchdog, deadline, crashpad_module=None):
        self.packet, self.boot, self.watchdog, self.deadline = packet, boot, watchdog, deadline
        self.crashpad_module = crashpad_module
        self.expected = {int(pid): {**v, 'argv': [bytes.fromhex(a) for a in v['argvHex']]}
                         for pid, v in packet['identities'].items()}
        self.expected = {pid: identity(v) for pid, v in self.expected.items()}
        self.effect_attempted = False
        self.effect_confirmed = False
        self.signal_fd = None
        self.stage = 'initialization'
        self.last_census = None

    def crashpad_observer(self, deadline):
        if self.crashpad_module is None:
            raise RuntimeError('verified observation module unavailable')
        pin = self.packet['observationOnlyCrashpad']
        if pin['pid'] in self.expected:
            raise RuntimeError('observation-only pin cannot be an original member')
        return self.crashpad_module.CrashpadObserver(
            pin, self.expected[self.packet['qemuPID']],
            self.expected[self.packet['anchorPID']], deadline,
            self.boot.proc, self.boot.absent_pid_state, file_pin)

    def _basic_graph(self):
        """One bounded group and descendant census, including escaped groups."""
        rows = {}
        for entry in Path('/proc').iterdir():
            checkpoint(self.clock, self.deadline)
            if not entry.name.isdecimal():
                continue
            if len(rows) >= 25000:
                raise RuntimeError('bounded process inventory exceeded')
            try:
                state = self.boot.absent_pid_state(int(entry.name))
            except RuntimeError:
                # Unreadable unrelated PIDs prevent claiming a complete descendant graph.
                raise RuntimeError('process inventory unreadable')
            if state is not None:
                rows[state[0]] = state
        selected = {p for p, q in rows.items() if q[3] == self.packet['anchorPID']}
        selected.add(self.packet['anchorPID'])
        selected |= set(self.expected)
        while True:
            expanded = selected | {p for p, q in rows.items() if q[2] in selected}
            if expanded == selected:
                break
            selected = expanded
        selected = {p for p in selected if p in rows}
        if len(selected) > 16:
            raise RuntimeError('bounded owned graph exceeded')
        return {p: rows[p][:6] for p in selected}

    def graph(self, allowed_exits=frozenset()):
        """Full identities; tolerate only proved exit/reparent transitions.

        A process first seen in the second census is never silently dropped,
        even if it has already disappeared by the next read. The caller must
        fail this one-use attempt and retain the census as diagnostic evidence.
        """
        before = self._basic_graph()
        self.last_census = {'before': list(before.values())[:16], 'after': None, 'rows': []}
        basic_keys = ('pid', 'ticks', 'ppid', 'pgid', 'sid', 'uid')
        def adopted_netsimd(pid, parent, otherwise_matches):
            return pid == self.packet['netsimdPID'] and \
                self.packet['qemuPID'] in allowed_exits and \
                self.expected[pid]['ppid'] == self.packet['qemuPID'] and \
                parent == self.packet['anchorPID'] and otherwise_matches
        for pid, basic in before.items():
            if pid in self.expected:
                wanted = tuple(self.expected[pid][key] for key in basic_keys)
                if basic != wanted and not adopted_netsimd(
                        pid, basic[2], basic[:2] == wanted[:2] and basic[3:] == wanted[3:]):
                    raise RuntimeError('original identity drift before settlement read')
        result = {}
        for pid in before:
            row = self.boot.proc(pid)
            if row is None:
                detail = self.boot._take_proc_read_failure(pid)
                if detail is not None:
                    self.last_census['fullReadFailure'] = detail
                state = self.boot.absent_pid_state(pid)
                if state is None and pid in allowed_exits:
                    continue
                if state is None or state[6] not in DEAD:
                    raise RuntimeError('full process identity unavailable')
                # Dead identity remains available to state()/held-exit validation.
                continue
            result[pid] = row
        after = self._basic_graph()
        self.last_census['after'] = list(after.values())[:16]
        self.last_census['rows'] = [{'pid': x['pid'], 'ticks': x['ticks'], 'ppid': x['ppid'],
            'uid': x['uid'], 'pgid': x['pgid'], 'sid': x['sid'], 'state': x['state'],
            'exePathSHA256': hashlib.sha256(os.fsencode(x['exe'])).hexdigest(),
            'argvSHA256': self.boot.argv_hash(x['argv']), 'argvCount': len(x['argv'])}
            for x in result.values()][:16]
        for pid in (set(before) & set(after)) - set(result):
            state = self.boot.absent_pid_state(pid)
            if pid not in allowed_exits or state is None or \
               state[:6] != after[pid] or state[6] not in DEAD:
                raise RuntimeError('unreadable original remains in settlement census')
        if before != after:
            added = set(after) - set(before)
            removed = set(before) - set(after)
            if added or not removed <= set(allowed_exits):
                raise RuntimeError('unproved process census transition during read')
            for pid in set(before) & set(after):
                old, new = before[pid], after[pid]
                adopted_in_read = pid == self.packet['netsimdPID'] and \
                    self.packet['qemuPID'] in allowed_exits and \
                    old[2] == self.packet['qemuPID'] and \
                    new[2] == self.packet['anchorPID'] and \
                    old[:2] == new[:2] and old[3:] == new[3:]
                if old != new and not adopted_in_read:
                    raise RuntimeError('unproved process census transition during read')
            for pid in removed:
                if pid in result:
                    full = identity(result[pid])
                    wanted = self.expected[pid]
                    other_fields_match = all(full[key] == wanted[key] for key in STABLE if key != 'ppid')
                    if full != wanted and not adopted_netsimd(pid, full['ppid'], other_fields_match):
                        raise RuntimeError('original full identity drift before proved exit')
                result.pop(pid, None)
        for pid, row in result.items():
            observed = tuple(row[k] for k in ('pid', 'ticks', 'ppid', 'pgid', 'sid', 'uid'))
            if observed != after[pid]:
                # An allowed reparent may have happened after the full read.
                # A second complete read must match the later census exactly.
                if observed == before[pid] and before[pid] != after[pid]:
                    row = self.boot.proc(pid)
                    if row is None:
                        raise RuntimeError('reparented process full identity unavailable')
                    result[pid] = row
                    observed = tuple(row[k] for k in ('pid', 'ticks', 'ppid', 'pgid', 'sid', 'uid'))
            if observed != after[pid]:
                raise RuntimeError('full process census identity drift')
        return result

    def verify_images(self, rows):
        for pid, row in rows.items():
            if pid not in self.expected:
                raise RuntimeError('extra identity before signal')
            p = self.packet['images'][row['exe']]
            checkpoint(self.clock, self.deadline)
            current = file_pin(row['exe'], self.deadline)
            if current != p:
                raise RuntimeError('installed executable changed')
            st = os.stat(f'/proc/{pid}/exe')
            if (st.st_dev, st.st_ino, st.st_size) != (p['st_dev'], p['st_ino'], p['st_size']):
                raise RuntimeError('running image differs from installed pin')

    def hold(self, pid):
        fd = os.pidfd_open(pid, 0)
        if pid == self.packet['qemuPID']:
            self.signal_fd = fd
        return fd

    def exits(self, fds):
        poll = select.poll()
        for fd in fds.values():
            poll.register(fd, select.POLLIN | select.POLLHUP | select.POLLERR)
        result = set()
        reverse = {fd: pid for pid, fd in fds.items()}
        for fd, flags in poll.poll(0):
            if fd not in reverse or flags & ~(select.POLLIN | select.POLLHUP) or not flags & select.POLLIN:
                raise RuntimeError('held exit event uncertain')
            result.add(reverse[fd])
        return result

    def observer(self, parent, anchor, deadline):
        return self.watchdog.prepare(parent, anchor, self.packet['watchdogPacket'], deadline,
                                     self.boot.proc, self.boot.absent_pid_state, Path('/proc'))

    def state(self, pid):
        return self.boot.absent_pid_state(pid)

    def send_qemu(self, fd, pid):
        if self.effect_attempted or pid != self.packet['qemuPID'] or fd != self.signal_fd:
            raise RuntimeError('no authority for this signal')
        checkpoint(self.clock, self.deadline)
        self.effect_attempted = True
        signal.pidfd_send_signal(fd, signal.SIGTERM, None, 0)
        self.effect_confirmed = True


def execute_once(packet_path, atlas_decision_path, normal_ack_path):
    """Called in the actual acknowledged normal executor; no automatic launch path."""
    if threading.current_thread() is not threading.main_thread() or signal.getitimer(signal.ITIMER_REAL) != (0.0, 0.0):
        raise RuntimeError('exclusive main-thread deadline guard unavailable')
    blocked = int(next(x.split()[1] for x in Path('/proc/self/status').read_text().splitlines()
                       if x.startswith('SigBlk:')), 16)
    if blocked & (1 << (signal.SIGALRM - 1)):
        raise RuntimeError('hard-deadline signal is blocked')
    began = time.monotonic()
    hard = began + 30
    previous = signal.getsignal(signal.SIGALRM)
    def timeout(*_):
        raise TimeoutError('30-second overall partial cleanup cap')
    signal.signal(signal.SIGALRM, timeout)
    signal.setitimer(signal.ITIMER_REAL, 30)
    leases = []
    backend = None
    result_path = None
    active_error = None
    result = {'status': 'FAIL', 'operationBeganMonotonic': began,
              'runtimePID': os.getpid(), 'effectAttempted': False, 'effectConfirmed': False,
              'allProcessesCleaned': False, 'nativeReady': False}
    try:
        packet, packet_sha = bounded_json(packet_path)
        output_root = Path(__file__).resolve().parent / 'ADMITTED_EXECUTION'
        if packet.get('resultPath') != str(output_root / 'RESULT_V5.json') or \
           packet.get('consumedPath') != str(output_root / 'CONSUMED_V5.json'):
            raise RuntimeError('unbound output layout')
        for ancestor in (output_root, *output_root.parents):
            if ancestor.is_symlink():
                raise RuntimeError('linked output ancestor')
        if not output_root.is_dir() or output_root.stat().st_uid != os.getuid() or \
           (output_root.stat().st_dev, output_root.stat().st_ino) != \
           (packet['outputDirectoryIdentity']['device'], packet['outputDirectoryIdentity']['inode']):
            raise RuntimeError('output directory owner changed')
        result_path = output_root / 'RESULT_V5.json'
        decision, _ = bounded_json(atlas_decision_path)
        ack, _ = bounded_json(normal_ack_path)
        check_admission(packet, packet_sha, decision, ack, os.getpid(),
                        Path('/proc/self/stat').read_text().rsplit(') ', 1)[1].split()[19])
        for row in packet['controlPins']:
            if file_pin(row['path'], hard) != row['pin']:
                raise RuntimeError('frozen reviewed control changed')
        crashpad_module = load_crashpad_module(packet, hard)
        crashpad_module.check_fresh_peer_ack(packet, ack, time.monotonic())
        for role in ('codex', 'grok'):
            receipt, _ = bounded_json(decision['independentReviews'][role]['path'])
            if file_pin(decision['independentReviews'][role]['path'], hard)['sha256'] != decision['independentReviews'][role]['sha256'] or \
               receipt['status'] != 'PASS' or receipt['reviewCandidateSha256'] != packet['reviewCandidateSha256'] or \
               receipt['operationPacketSha256'] != packet_sha:
                raise RuntimeError('independent exact-adapter review missing')
        import fcntl
        for row in packet['leases']:
            fd = os.open(row['path'], os.O_RDWR | os.O_NOFOLLOW)
            leases.append(fd)
            st = os.fstat(fd)
            if (st.st_dev, st.st_ino) != (row['device'], row['inode']):
                raise RuntimeError('original lease inode changed')
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        for row in packet['protectedFiles']:
            if file_pin(row['path'], hard) != row['pin']:
                raise RuntimeError('protected input changed')
        if file_pin(__file__, hard)['sha256'] != packet['adapterSha256']:
            raise RuntimeError('adapter self binding changed')
        import sys
        sys.dont_write_bytecode = True
        sys.path.insert(0, packet['toolsRoot'])
        import fixture_row_source_boot as boot
        import fixture_row_source_watchdog as watchdog
        # No operations are delegated to a native executable or an ADB command.
        for path in (packet['consumedPath'], packet['resultPath']):
            if Path(path).exists() or Path(path).is_symlink():
                raise RuntimeError('one-use output already exists')
        exclusive_json(packet['consumedPath'], {'packetSha256': packet_sha, 'runtimePID': os.getpid(),
                       'leaseHolderPID': os.getpid(), 'automaticRetries': 0},
                       (packet['outputDirectoryIdentity']['device'], packet['outputDirectoryIdentity']['inode']))
        backend = LinuxBackend(packet, boot, watchdog, hard, crashpad_module)
        result['packetSha256'] = packet_sha
        result.update(run_partial(packet, backend, hard))
        if result['status'] != 'PARTIAL_QEMU_NETSIMD_EXIT_PROVEN':
            raise RuntimeError('unexpected core outcome')
        # A function cannot prove its own eventual tool exit. Retain only a
        # provisional observation; a deadline/exception after this write cannot
        # leave a successful terminal receipt.
        result['status'] = 'PENDING_ACTUAL_NORMAL_TOOL_COMPLETION'
        result['requiresExternalActualToolExit0'] = True
        for row in packet['protectedFiles'] + packet['controlPins']:
            if file_pin(row['path'], hard) != row['pin']:
                raise RuntimeError('protected or reviewed input changed after operation')
        if file_pin(packet_path, hard)['sha256'] != packet_sha:
            raise RuntimeError('packet bytes changed after operation')
        checkpoint(time.monotonic, hard)
        result['protectedInputsExact'] = True
        return result
    except BaseException as error:
        active_error = error
        name = type(error).__name__
        safe_type = name if name in ('RuntimeError', 'TimeoutError', 'OSError',
            'FileNotFoundError', 'PermissionError', 'ProcessLookupError', 'ValueError',
            'KeyError', 'TypeError', 'AssertionError', 'CensusError') else 'OtherException'
        number = getattr(error, 'errno', None)
        result.update({'status': 'FAIL', 'errorType': safe_type,
                       'errno': number if type(number) is int and 1 <= number <= 4095 else None,
                       'stage': getattr(backend, 'stage', 'admission_or_preservation')})
        raise
    finally:
        # Restore the caller's handler even if a deadline fires while closing a
        # lease or retaining evidence; retain the hard timer through all I/O.
        try:
            if backend is not None:
                result['effectAttempted'] = backend.effect_attempted
                result['effectConfirmed'] = backend.effect_confirmed
                result['lastCensus'] = backend.last_census
            for fd in leases:
                os.close(fd)
            result['elapsedSeconds'] = round(time.monotonic() - began, 6)
            result['within30Seconds'] = result['elapsedSeconds'] < 30
            if result['elapsedSeconds'] >= 30:
                result['status'] = 'FAIL'
            if time.monotonic() < hard and result_path is not None and not result_path.exists():
                exclusive_json(result_path, result,
                    (packet['outputDirectoryIdentity']['device'], packet['outputDirectoryIdentity']['inode']))
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
            signal.signal(signal.SIGALRM, previous)
        if active_error is None and time.monotonic() >= hard:
            raise TimeoutError('overall cap expired during final retention')



def verify_normal_completion(result, result_sha256, completion, packet_sha256, *, observation_pin):
    """Read-only qualification AFTER actual tool return; never called by execute_once.

    The coordinator must record the real tool return and elapsed operation time,
    not invent them from this provisional result or an exited/running label.
    """
    elapsed = completion.get('operationElapsedSeconds')
    if completion.get('recordKind') != 'ACTUAL_NORMAL_TOOL_COMPLETION_FROM_TOOL_RETURN' or \
       type(completion.get('actualExitCode')) is not int or completion['actualExitCode'] != 0 or \
       type(elapsed) not in (int, float) or not 0 < elapsed < 30 or \
       not completion.get('execSessionId') or \
       completion.get('resultSha256') != result_sha256 or \
       completion.get('packetSha256') != packet_sha256 or \
       completion.get('runtimePID') != result.get('runtimePID') or \
       completion.get('operationBeganMonotonic') != result.get('operationBeganMonotonic'):
        raise RuntimeError('actual normal completion unproved')
    required = ('qemuHeldExit', 'netsimdHeldExit', 'effectAttempted', 'effectConfirmed',
                'protectedInputsExact', 'within30Seconds', 'requiresExternalActualToolExit0')
    if result.get('status') != 'PENDING_ACTUAL_NORMAL_TOOL_COMPLETION' or \
       result.get('packetSha256') != packet_sha256 or \
       any(result.get(k) is not True for k in required) or \
       result.get('allProcessesCleaned') is not False or result.get('nativeReady') is not False:
        raise RuntimeError('partial observations incomplete')
    cp = result.get('observationOnlyCrashpad')
    if not isinstance(cp, dict) or cp.get('pid') != observation_pin['pid'] or \
       cp.get('ticks') != observation_pin['ticks'] or \
       cp.get('currentTaskAnchorAndPeerProven') is not True or \
       cp.get('historicalCreatorClaimed') is not False or \
       cp.get('signalAuthority') is not False or cp.get('deadlineExtended') is not False or \
       type(cp.get('heldExitObserved')) is not bool:
        raise RuntimeError('exact observation-only proof incomplete')
    wanted = None if cp['heldExitObserved'] else observation_pin['pid']
    if cp.get('retainedPID') != wanted or \
       ((observation_pin['pid'] in result['retainedPIDs']) != (wanted is not None)):
        raise RuntimeError('observation-only retained/exit state inconsistent')
    return {'status': 'PARTIAL_QEMU_NETSIMD_EXIT_PROVEN',
            'allProcessesCleaned': False, 'nativeReady': False,
            'retainedPIDs': result['retainedPIDs'],
            'actualNormalToolExitCode': 0, 'operationElapsedSeconds': elapsed,
            'resultSha256': result_sha256, 'packetSha256': packet_sha256}


if __name__ == '__main__':
    raise SystemExit('No direct launch: an admitted normal executor must call execute_once.')
