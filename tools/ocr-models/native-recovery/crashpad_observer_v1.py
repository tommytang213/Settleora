"""One exact pre-existing SDK Crashpad pin, observation-only; no signal API.

Current anchored identity plus a proven paired QEMU crash socket establishes
this narrow retained-process treatment. The historical creating parent was not
retained and is never inferred. No other process is selected by its name.
"""
import hashlib
import os
from pathlib import Path
import select
import stat
import time

SDK_IMAGE = '/home/tommytang213/Android/Sdk/emulator/crashpad_handler'
SDK_SHA256 = 'fdeaf3c2e02deaacd04e64f80d18c5f8736c4402f26d3ca15bb3cae68e2cf542'
SDK_BYTES = 3201712
LIVE = frozenset(('R', 'S', 'D', 'T', 't', 'I'))
DEAD = frozenset(('Z', 'X', 'x'))
SCALARS = ('pid', 'ticks', 'uid', 'ppid', 'pgid', 'sid', 'exe')


def argv_hash(args):
    return hashlib.sha256(b'\0'.join(args) + b'\0').hexdigest()


def check_fresh_peer_ack(packet, ack, now):
    """Require actual recent read-only peer evidence, not a claimed process name."""
    cp = packet['observationOnlyCrashpad']
    proof = ack['crashpadPeerProof']
    observed = proof.get('observedMonotonic')
    if proof.get('recordKind') != 'ACTUAL_CURRENT_UNIX_PEER_READ' or \
       type(observed) not in (int, float) or not 0 <= now - observed <= 10:
        raise RuntimeError('fresh Crashpad peer evidence unavailable')
    expected = {'crashpadPID': cp['pid'], 'crashpadTicks': cp['ticks'],
                'qemuPID': packet['qemuPID'], 'qemuTicks': packet['identities'][str(packet['qemuPID'])]['ticks'],
                'crashpadFD': cp['initialClientFD'], 'crashpadSocketInode': cp['clientSocketInode'],
                'qemuFD': cp['qemuSocketFD'], 'qemuSocketInode': cp['qemuSocketInode'],
                'netNamespace': cp['netNamespace'], 'packetSha256': ack['packetSha256']}
    if any(proof.get(k) != v for k, v in expected.items()) or proof.get('reciprocalSeqpacketPeersProven') is not True:
        raise RuntimeError('Crashpad current peer evidence mismatched')


class CrashpadObserver:
    """Private pidfd only polled/closed; never an original member or signal fd."""
    def __init__(self, pin, parent_qemu, anchor, deadline, read_process, read_state,
                 pin_file, proc_root=Path('/proc'), clock=time.monotonic):
        self.pin, self.qemu, self.anchor = pin, parent_qemu, anchor
        self.deadline, self.read_process, self.read_state = deadline, read_process, read_state
        self.pin_file, self.proc_root, self.clock = pin_file, proc_root, clock
        self.__fd = None
        self.__poll = None
        self.exited = False
        self.failed = False
        self.effect_started = False
        self.initial_proven = False
        try:
            self._check_deadline()
            if pin['exe'] != SDK_IMAGE or pin['imagePin']['sha256'] != SDK_SHA256 or \
               pin['imagePin']['st_size'] != SDK_BYTES or \
               pin['pid'] in (parent_qemu['pid'], anchor['pid']) or \
               pin['ppid'] != anchor['pid'] or pin['uid'] != anchor['uid'] or \
               int(pin['ticks']) < int(parent_qemu['ticks']):
                raise RuntimeError('exact Crashpad packet identity unsupported')
            if self.pin_file(pin['exe'], deadline) != pin['imagePin']:
                raise RuntimeError('Crashpad installed image bytes changed')
            self._live(self.read_process(pin['pid']))
            self._peer()
            self.__fd = os.pidfd_open(pin['pid'], 0)
            self.__poll = select.poll()
            self.__poll.register(self.__fd, select.POLLIN | select.POLLHUP | select.POLLERR)
            self._live(self.read_process(pin['pid']))
            if self.__poll.poll(0):
                raise RuntimeError('Crashpad exited before full held proof')
            self.initial_proven = True
            self._check_deadline()
        except BaseException:
            self.failed = True
            self.close()
            raise

    def _check_deadline(self):
        if self.clock() >= self.deadline:
            raise TimeoutError('unchanged Crashpad observation deadline')

    def _live(self, row):
        if row is None or row['state'] not in LIVE or \
           any(row[k] != self.pin[k] for k in SCALARS) or \
           len(row['argv']) != self.pin['argvCount'] or argv_hash(row['argv']) != self.pin['argvSHA256']:
            raise RuntimeError('Crashpad exact live identity changed or unreadable')
        image = self.pin['imagePin']
        for st in (os.stat(self.proc_root / str(row['pid']) / 'exe'),
                   os.stat(self.pin['exe'], follow_symlinks=False)):
            if any(getattr(st, k) != image[k] for k in
                   ('st_dev', 'st_ino', 'st_size', 'st_mode', 'st_uid', 'st_mtime_ns', 'st_ctime_ns')):
                raise RuntimeError('Crashpad running image inode or metadata changed')

    def _peer(self):
        self._check_deadline()
        cp = self.pin
        for old in (self.qemu, self.anchor):
            fresh = self.read_process(old['pid'])
            if fresh is None or fresh['state'] not in LIVE or \
               any(fresh[k] != old[k] for k in (*SCALARS, 'argv')):
                raise RuntimeError('Crashpad current task ancestry changed')
        if (self.proc_root / 'sys/kernel/random/boot_id').read_text().strip() != cp['bootID']:
            raise RuntimeError('Crashpad boot identity changed')
        for pid, fd, inode in [(cp['pid'], cp['initialClientFD'], cp['clientSocketInode']),
                               (self.qemu['pid'], cp['qemuSocketFD'], cp['qemuSocketInode'])]:
            if os.readlink(self.proc_root / str(pid) / 'fd' / str(fd)) != 'socket:[' + inode + ']' or \
               os.readlink(self.proc_root / str(pid) / 'ns/net') != cp['netNamespace']:
                raise RuntimeError('Crashpad current endpoint identity changed')
        selected = {}
        for line in (self.proc_root / 'net/unix').read_text().splitlines()[1:]:
            fields = line.split()
            if len(fields) >= 7 and fields[6] in (cp['clientSocketInode'], cp['qemuSocketInode']):
                if fields[6] in selected or fields[4] != '0005' or fields[5] != '03':
                    raise RuntimeError('Crashpad live seqpacket endpoints changed')
                selected[fields[6]] = True
        if set(selected) != {cp['clientSocketInode'], cp['qemuSocketInode']}:
            raise RuntimeError('Crashpad paired endpoint metadata unavailable')
        self._check_deadline()

    def before_effect(self, rows):
        """Project ONLY the fully proved exact pin; all other additions remain."""
        try:
            if self.failed or not self.initial_proven or self.effect_started:
                raise RuntimeError('Crashpad initial proof not available')
            self._check_deadline()
            self._live(rows.get(self.pin['pid']))
            self._live(self.read_process(self.pin['pid']))
            self._peer()
            if self.__poll.poll(0):
                raise RuntimeError('Crashpad exited before effect')
            return {p: r for p, r in rows.items() if p != self.pin['pid']}
        except BaseException:
            self.failed = True
            raise

    def effect_will_be_attempted(self):
        self._check_deadline()
        if self.failed or not self.initial_proven or self.effect_started:
            raise RuntimeError('Crashpad proof cannot advance')
        self.effect_started = True

    def after_effect(self, rows):
        try:
            self._check_deadline()
            if self.failed or not self.initial_proven or not self.effect_started:
                raise RuntimeError('Crashpad observation phase invalid')
            for fd, flags in self.__poll.poll(0):
                if fd != self.__fd or flags & ~(select.POLLIN | select.POLLHUP) or not flags & select.POLLIN:
                    raise RuntimeError('Crashpad held exit event uncertain')
                self.exited = True
            row = self.read_process(self.pin['pid'])
            observed = rows.get(self.pin['pid'])
            basic = ('pid', 'ticks', 'uid', 'ppid', 'pgid', 'sid')
            if observed is not None and any(observed[k] != self.pin[k] for k in basic):
                raise RuntimeError('Crashpad census PID reuse or ownership drift')
            if row is not None and any(row[k] != self.pin[k] for k in basic):
                raise RuntimeError('Crashpad independent PID reuse or ownership drift')
            if observed is not None and observed['state'] in LIVE and \
               (self.exited or row is None or row['state'] not in LIVE):
                raise RuntimeError('Crashpad live census has no matching current proof')
            if row is not None and row['state'] in LIVE:
                if self.exited or self.pin['pid'] not in rows:
                    raise RuntimeError('Crashpad live after exit proof or escaped census')
                self._live(row)
                self._live(rows[self.pin['pid']])
                if any(row[k] != rows[self.pin['pid']][k] for k in (*SCALARS, 'argv')):
                    raise RuntimeError('Crashpad independent reads disagree')
            else:
                state = self.read_state(self.pin['pid'])
                wanted = tuple(self.pin[k] for k in ('pid', 'ticks', 'ppid', 'pgid', 'sid', 'uid'))
                if not self.exited or state is not None and (state[:6] != wanted or state[6] not in DEAD):
                    raise RuntimeError('Crashpad disappearance or exit identity unproved')
            self._check_deadline()
            return {p: r for p, r in rows.items() if p != self.pin['pid']}
        except BaseException:
            self.failed = True
            raise

    def proof(self):
        self._check_deadline()
        if self.failed or not self.initial_proven:
            raise RuntimeError('Crashpad observation proof incomplete')
        return {'pid': self.pin['pid'], 'ticks': self.pin['ticks'],
                'currentTaskAnchorAndPeerProven': True, 'historicalCreatorClaimed': False,
                'heldExitObserved': self.exited, 'retainedPID': None if self.exited else self.pin['pid'],
                'signalAuthority': False, 'deadlineExtended': False}

    def close(self):
        if self.__fd is not None:
            os.close(self.__fd)
            self.__fd = None
