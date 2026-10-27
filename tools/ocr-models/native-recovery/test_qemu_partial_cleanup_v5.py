"""No SDK, emulator, ADB, child process, or real signal is used by these tests."""
import ast
import contextlib
import fcntl
import sys
import copy
import json
import os
from pathlib import Path
import signal
import select
import tempfile
import types
import unittest
from unittest.mock import patch
import qemu_partial_cleanup_v5 as a


def row(pid, parent, exe):
    return {'pid': pid, 'ticks': str(pid * 10), 'uid': 1000, 'pgid': 1 if pid != 4 else 4,
            'sid': 1 if pid != 4 else 4, 'ppid': parent, 'exe': exe,
            'argv': [exe.encode()], 'state': 'S'}


class Observer:
    candidate = None
    def __init__(self, fake): self.fake = fake
    def observe(self, additions, exited):
        self.fake.observations.append(([x['pid'] for x in additions], set(exited)))
        if additions: raise RuntimeError('unproved helper')
    def proof(self): return None
    def close(self): self.fake.observer_closed = True


class NullCrashpad:
    def exit_proves_absence(self,pid,basic=None,row=None):return False
    def before_effect(self,rows):return rows
    def after_effect(self,rows):return rows
    def effect_will_be_attempted(self):pass
    def proof(self):return {'retainedPID':None,'signalAuthority':False}
    def close(self):pass


class Fake:
    def __init__(self, scenario='success'):
        self.scenario = scenario
        self.original = {1: row(1, 1002, '/anchor'), 2: row(2, 1, '/qemu'),
                         3: row(3, 2, '/netsimd'), 4: row(4, 1, '/adb')}
        self.expected = {p: a.identity(x) for p, x in self.original.items()}
        self.now = 0
        self.sent = []
        self.closed = []
        self.observations = []
        self.observer_closed = False
        self.graph_calls = 0
    def clock(self): return self.now
    def pause(self, amount): self.now += amount
    def graph(self, allowed_exits=frozenset(), refresh_exits=None, observed_exit=None):
        self.graph_calls += 1
        rows = copy.deepcopy(self.original)
        if self.scenario == 'initial_extra' or (self.sent and self.scenario == 'new_child'):
            rows[5] = row(5, 2, '/unknown')
        if self.scenario == 'identity_drift' and self.graph_calls == 2:
            rows[2]['ticks'] = '999'
        if self.scenario == 'state_flip':
            for x in rows.values(): x['state'] = 'R' if self.graph_calls % 2 else 'S'
        if self.sent and self.scenario not in ['persistent', 'new_child', 'live_after_exit']:
            rows.pop(2); rows.pop(3)
        return rows
    def verify_images(self, rows):
        if self.scenario == 'image_drift': raise RuntimeError('image changed')
    def hold(self, pid):
        if self.scenario == 'hold_failure' and pid == 3: raise OSError('synthetic hold')
        return pid + 100
    def crashpad_observer(self,deadline):return NullCrashpad()
    def observer(self, parent, anchor, deadline):
        if self.scenario == 'no_observer': return None
        return Observer(self)
    def exits(self, fds):
        if not self.sent:
            return {2} if self.scenario == 'preexit' else set()
        if self.scenario == 'bad_poll': raise RuntimeError('ambiguous pidfd event')
        if self.scenario == 'persistent': return set()
        if self.scenario == 'retained_exit': return {1, 2, 3}
        if self.scenario == 'missing_exit': return {2}
        return {2, 3}
    def send_qemu(self, fd, pid):
        self.sent.append((fd, pid, signal.SIGTERM))
        if self.scenario == 'send_failure': raise OSError('synthetic effect ambiguity')
    def state(self, pid):
        if self.scenario == 'reused_dead' and pid == 2:
            return (2, '999', 1, 1, 1, 1000, 'Z')
        if self.scenario == 'unreadable_exit': raise RuntimeError('unreadable state')
        return None
    def close(self, fd): self.closed.append(fd)


OBS_PIN = {'pid':5,'ticks':'50'}
PACKET = {'qemuPID': 2, 'netsimdPID': 3, 'anchorPID': 1, 'adbPID': 4}


class CoreTests(unittest.TestCase):
    def test_positive_only_qemu_signal_partial_not_native_ready(self):
        b = Fake(); result = a.run_partial(PACKET, b, 30)
        self.assertEqual(b.sent, [(102, 2, signal.SIGTERM)])
        self.assertEqual(result['retainedPIDs'], [1, 4])
        self.assertFalse(result['allProcessesCleaned'])
        self.assertFalse(result['nativeReady'])
        self.assertTrue(result['qemuHeldExit'] and result['netsimdHeldExit'])
        self.assertEqual(set(b.closed), {101, 102, 103, 104})
        self.assertTrue(b.observer_closed)

    def test_transient_state_flip_is_not_identity_drift(self):
        b = Fake('state_flip'); self.assertEqual(a.run_partial(PACKET, b, 30)['status'],
                                                'PARTIAL_QEMU_NETSIMD_EXIT_PROVEN')

    def test_rejections_before_any_signal(self):
        for scenario in ['initial_extra', 'identity_drift', 'image_drift', 'hold_failure',
                         'no_observer', 'preexit']:
            with self.subTest(scenario=scenario):
                b = Fake(scenario)
                with self.assertRaises((RuntimeError, OSError)): a.run_partial(PACKET, b, 30)
                self.assertEqual(b.sent, [])
                self.assertEqual(len(b.closed), len(set(b.closed)))

    def test_rejections_after_single_signal_do_not_escalate(self):
        for scenario in ['new_child', 'bad_poll', 'retained_exit', 'missing_exit',
                         'live_after_exit', 'reused_dead', 'unreadable_exit', 'send_failure']:
            with self.subTest(scenario=scenario):
                b = Fake(scenario)
                with self.assertRaises((RuntimeError, OSError)): a.run_partial(PACKET, b, 30)
                self.assertEqual(len(b.sent), 1)
                self.assertEqual(b.sent[0][1:], (2, signal.SIGTERM))
                self.assertEqual(set(b.closed), {101, 102, 103, 104})

    def test_persistent_process_hits_single_fixed_22_second_budget(self):
        b = Fake('persistent')
        with self.assertRaises(TimeoutError): a.run_partial(PACKET, b, 30)
        self.assertGreaterEqual(b.now, 22)
        self.assertLessEqual(b.now, 22.001)
        self.assertEqual(len(b.sent), 1)

    def test_short_outer_budget_never_extends_settlement(self):
        b = Fake('persistent'); b.now = 20
        with self.assertRaises(TimeoutError): a.run_partial(PACKET, b, 25)
        self.assertLessEqual(b.now, 25.001)
        self.assertEqual(len(b.sent), 1)

    def test_expired_outer_guard_has_no_effect(self):
        b = Fake(); b.now = 30
        with self.assertRaises(TimeoutError): a.run_partial(PACKET, b, 30)
        self.assertEqual(b.sent, [])

    def test_signal_boundary_rejects_wrong_fd_target_or_second_call(self):
        b = a.LinuxBackend.__new__(a.LinuxBackend)
        b.packet = {'qemuPID': 2}; b.signal_fd = 102; b.effect_attempted = False
        b.effect_confirmed = False; b.deadline = 30; b.clock = lambda: 0
        with patch.object(a.signal, 'pidfd_send_signal') as send:
            for fd,pid in [(101, 2), (102, 1), (104, 4), (999, 5)]:
                with self.assertRaises(RuntimeError): b.send_qemu(fd,pid)
            send.assert_not_called()
            b.send_qemu(102,2)
            with self.assertRaises(RuntimeError): b.send_qemu(102,2)
            send.assert_called_once_with(102,signal.SIGTERM,None,0)

    def test_signal_error_consumes_effect_attempt_without_retry(self):
        b = a.LinuxBackend.__new__(a.LinuxBackend)
        b.packet={'qemuPID':2};b.signal_fd=102;b.effect_attempted=False
        b.effect_confirmed=False;b.deadline=30;b.clock=lambda:0
        with patch.object(a.signal,'pidfd_send_signal',side_effect=OSError('synthetic')) as send:
            with self.assertRaises(OSError):b.send_qemu(102,2)
            self.assertTrue(b.effect_attempted)
            self.assertFalse(b.effect_confirmed)
            with self.assertRaises(RuntimeError):b.send_qemu(102,2)
            self.assertEqual(send.call_count,1)

    def test_no_other_signal_or_native_process_entrypoint(self):
        tree=ast.parse(Path(a.__file__).read_text())
        calls=[n for n in ast.walk(tree) if isinstance(n,ast.Call)]
        self.assertEqual(len([n for n in calls if isinstance(n.func,ast.Attribute)
                              and n.func.attr=='pidfd_send_signal']),1)
        self.assertFalse(any(isinstance(n.func,ast.Attribute) and n.func.attr in
                             ['kill','killpg','Popen','run','connect'] for n in calls))


class AdmissionTests(unittest.TestCase):
    def setUp(self):
        self.packet={'schema':'settleora-exact-qemu-only-partial-cleanup-v2',
                     'adapterSha256':'adapter-pin','reviewCandidateSha256':'candidate-pin'}
        self.decision={'recordKind':'REPOSITORY_TECHNICAL_DECISION_NOT_PLATFORM_PERMISSION',
                       'decisionMaker':'Atlas','decision':'APPROVE_EXACT_QEMU_ONLY_PARTIAL_CLEANUP',
                       'packetSha256':'packet-pin','adapterSha256':'adapter-pin',
                       'reviewCandidateSha256':'candidate-pin','runtimeBudget':1,'automaticRetries':0}
        self.ack={'recordKind':'ACTUAL_NORMAL_TOOL_RETURN_ACK','execSessionId':'synthetic-session',
                  'normalSupervisorPid':123,'leaseHolderPID':123,'packetSha256':'packet-pin',
                  'normalSupervisorStartTicks':'456'}
    def check(self):return a.check_admission(self.packet,'packet-pin',self.decision,self.ack,123,'456')
    def test_complete_exact_gate_is_only_a_check(self):
        with patch.object(a.signal,'pidfd_send_signal') as send:
            self.assertIsNone(self.check());send.assert_not_called()
    def test_consumed_v4_schema_cannot_be_admitted_to_v5(self):
        self.packet['schema']='settleora-exact-qemu-only-partial-cleanup-v1'
        with self.assertRaisesRegex(RuntimeError,'technical admission missing'):
            self.check()
    def test_wrong_decision_binding_budget_or_owner_rejected(self):
        for key,value in [('recordKind','platform-approval'),('decisionMaker','author'),
                ('decision','different'),('packetSha256','wrong'),('adapterSha256','wrong'),
                ('reviewCandidateSha256','wrong'),('runtimeBudget',2),('automaticRetries',1)]:
            with self.subTest(key=key):
                old=self.decision[key];self.decision[key]=value
                with self.assertRaises(RuntimeError):self.check()
                self.decision[key]=old
    def test_missing_or_wrong_normal_acceptance_rejected(self):
        for key,value in [('recordKind','written-plan'),('execSessionId',''),
                ('normalSupervisorPid',999),('leaseHolderPID',999),
                ('packetSha256','wrong'),('normalSupervisorStartTicks','wrong')]:
            with self.subTest(key=key):
                old=self.ack[key];self.ack[key]=value
                with self.assertRaises(RuntimeError):self.check()
                self.ack[key]=old
    def test_actual_entry_invokes_gate_before_backend_or_consumption(self):
        tree=ast.parse(Path(a.__file__).read_text())
        fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='execute_once')
        calls=[n for n in ast.walk(fn) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name)]
        gate=next(n for n in calls if n.func.id=='check_admission')
        backend=next(n for n in calls if n.func.id=='LinuxBackend')
        self.assertLess(gate.lineno,backend.lineno)
        self.assertEqual(len([n for n in calls if n.func.id=='run_partial']),1)


class IOTests(unittest.TestCase):
    def test_evidence_exclusive_no_overwrite(self):
        with tempfile.TemporaryDirectory() as root:
            p=Path(root)/'evidence.json';a.exclusive_json(p,{'safe':True})
            before=p.read_bytes()
            with self.assertRaises(FileExistsError):a.exclusive_json(p,{'overwrite':True})
            self.assertEqual(p.read_bytes(),before)

    def test_linked_evidence_ancestor_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            base=Path(root);real=base/'real';real.mkdir();link=base/'link';link.symlink_to(real)
            with self.assertRaises(OSError):a.exclusive_json(link/'no.json',{'safe':True})
            self.assertFalse((real/'no.json').exists())

    def test_bounded_evidence_and_control_type(self):
        with tempfile.TemporaryDirectory() as root:
            p=Path(root)/'file.json'
            with self.assertRaises(RuntimeError):a.exclusive_json(p,{'large':'x'*65537})
            self.assertFalse(p.exists())
            p.symlink_to(Path(root)/'missing')
            with self.assertRaises(RuntimeError):a.bounded_json(p)

    def test_file_pin_detects_content_metadata_and_rejects_symlink(self):
        with tempfile.TemporaryDirectory() as root:
            p=Path(root)/'p';p.write_bytes(b'fixture')
            pin=a.file_pin(p,a.time.monotonic()+10)
            self.assertEqual(pin['st_size'],7)
            link=Path(root)/'link';link.symlink_to(p)
            with self.assertRaises(RuntimeError):a.file_pin(link,a.time.monotonic()+10)

    def test_graph_rejects_new_descendant_outside_original_group(self):
        self.exercise_graph('extra')

    def test_graph_rejects_same_read_identity_drift(self):
        self.exercise_graph('drift')

    def test_graph_retains_typed_full_reader_failure(self):
        self.exercise_graph('reader')

    def exercise_graph(self,scenario):
        rows={1:row(1,1002,'/anchor'),2:row(2,1,'/qemu'),3:row(3,2,'/netsimd'),4:row(4,1,'/adb')}
        if scenario=='extra':rows[5]=dict(row(5,4,'/unknown'),pgid=5,sid=5)
        counts={}
        def state(pid):
            counts[pid]=counts.get(pid,0)+1
            r=rows[pid]
            ticks='999' if scenario=='drift' and pid==2 and counts[pid]>1 else r['ticks']
            return(pid,ticks,r['ppid'],r['pgid'],r['sid'],r['uid'],r['state'])
        def proc(pid):return None if scenario=='reader' and pid==2 else copy.deepcopy(rows[pid])
        boot=types.SimpleNamespace(absent_pid_state=state,proc=proc,
              _take_proc_read_failure=lambda p:{'pid':p,'stage':'cmdline_read','exceptionType':'OSError','errno':5},
              argv_hash=lambda x:'synthetic')
        b=a.LinuxBackend.__new__(a.LinuxBackend);b.packet={'anchorPID':1,'qemuPID':2,'netsimdPID':3}
        b.expected={p:a.identity(r) for p,r in rows.items() if p<5};b.boot=boot
        b.deadline=100;b.clock=lambda:0;b.last_census=None
        real_path=Path
        with tempfile.TemporaryDirectory() as root:
            fake=Path(root)
            for pid in rows:(fake/str(pid)).mkdir()
            with patch.object(a,'Path',side_effect=lambda p:fake if p=='/proc' else real_path(p)):
                if scenario=='extra':
                    actual=b.graph();self.assertIn(5,actual)
                else:
                    with self.assertRaises(RuntimeError):b.graph()
            if scenario=='reader':self.assertEqual(b.last_census['fullReadFailure']['errno'],5)


class SettlementCensusTests(unittest.TestCase):
    """Only held exit proof may explain an original member disappearing."""
    def backend(self, before, after, full=None):
        original={1:row(1,1002,'/anchor'),2:row(2,1,'/qemu'),
              3:row(3,2,'/netsimd'),4:row(4,1,'/adb')}
        rows=copy.deepcopy(original)
        if full is not None: rows.update(full)
        b=a.LinuxBackend.__new__(a.LinuxBackend)
        b.packet={'anchorPID':1,'qemuPID':2,'netsimdPID':3}
        b.expected={p:a.identity(r) for p,r in original.items()}
        b.deadline=100;b.clock=lambda:0;b.last_census=None
        snapshots=iter((before,after))
        b._basic_graph=lambda:next(snapshots)
        b.boot=types.SimpleNamespace(
            proc=lambda pid:copy.deepcopy(rows.get(pid)),
            absent_pid_state=lambda pid:None,
            _take_proc_read_failure=lambda pid:None,
            argv_hash=lambda args:'synthetic')
        return b

    def snapshots(self):
        rows={1:row(1,1002,'/anchor'),2:row(2,1,'/qemu'),
              3:row(3,2,'/netsimd'),4:row(4,1,'/adb')}
        return {p:tuple(r[k] for k in ('pid','ticks','ppid','pgid','sid','uid'))
                for p,r in rows.items()}

    def test_retained_exit_during_census_is_never_tolerated(self):
        before=self.snapshots()
        with self.assertRaisesRegex(RuntimeError,'retained anchor'):
            self.backend(before,before).graph(refresh_exits=lambda:{1})

    def test_new_held_exit_during_census_is_refreshed(self):
        before=self.snapshots();after={p:v for p,v in before.items()if p!=2}
        b=self.backend(before,after);exits=set();proc=b.boot.proc
        def read(pid):
            if pid==2:exits.add(2);return None
            return proc(pid)
        b.boot.proc=read
        self.assertEqual(set(b.graph(refresh_exits=lambda:exits)),{1,3,4})

    def test_new_held_qemu_exit_proves_in_census_adoption(self):
        before=self.snapshots();after=dict(before);after[3]=(3,before[3][1],1,*before[3][3:])
        b=self.backend(before,after,{3:row(3,1,'/netsimd')});calls=[]
        def exits():
            calls.append(1)
            return {2} if len(calls)>1 else set()
        self.assertEqual(b.graph(refresh_exits=exits)[3]['ppid'],1)

    def test_private_observer_exit_stays_out_of_original_exit_set(self):
        before=self.snapshots();before[5]=(5,'50',1,1,1,1000);after={p:v for p,v in before.items()if p!=5}
        b=self.backend(before,after,{5:row(5,1,'/observer')});original=set();seen=[]
        def observer(pid,basic=None,row=None):
            seen.append(pid);return pid==5 and basic==before[5]
        self.assertEqual(set(b.graph(allowed_exits=original,observed_exit=observer)),{1,2,3,4})
        self.assertEqual(original,set());self.assertIn(5,seen)
        with self.assertRaises(RuntimeError):self.backend(before,after,{5:row(5,1,'/observer')}).graph()

    def test_unrelated_pid_cannot_join_original_exit_proof(self):
        before=self.snapshots()
        with self.assertRaisesRegex(RuntimeError,'non-original'):
            self.backend(before,before).graph(refresh_exits=lambda:{5})

    def test_proved_qemu_exit_between_reads_is_allowed(self):
        before=self.snapshots();after={p:v for p,v in before.items() if p!=2}
        b=self.backend(before,after)
        self.assertEqual(set(b.graph(allowed_exits={2})),{1,3,4})
        self.assertEqual(len(b.last_census['before']),4)

    def test_same_exit_without_held_proof_is_rejected(self):
        before=self.snapshots();after={p:v for p,v in before.items() if p!=2}
        with self.assertRaisesRegex(RuntimeError,'unproved process census transition'):
            self.backend(before,after).graph()

    def test_drift_then_proved_exit_still_rejected(self):
        before=self.snapshots();after={p:v for p,v in before.items() if p!=3}
        before[3]=(3,before[3][1],99,*before[3][3:])
        with self.assertRaisesRegex(RuntimeError,'original identity drift'):
            self.backend(before,after).graph(allowed_exits={3})

    def test_full_identity_drift_then_proved_exit_still_rejected(self):
        before=self.snapshots();after={p:v for p,v in before.items() if p!=3}
        drift=row(3,2,'/unknown-image')
        with self.assertRaisesRegex(RuntimeError,'original full identity drift'):
            self.backend(before,after,{3:drift}).graph(allowed_exits={3})

    def test_unreadable_original_cannot_reappear_after_held_exit(self):
        before=self.snapshots();b=self.backend(before,dict(before))
        original_proc=b.boot.proc
        b.boot.proc=lambda pid:None if pid==2 else original_proc(pid)
        with self.assertRaises(RuntimeError):b.graph(allowed_exits={2})

    def test_actual_v4_shape_new_qemu_child_between_reads_is_rejected(self):
        before=self.snapshots();after=dict(before)
        after[631210]=(631210,'15967976',2,1,1,1000)
        b=self.backend(before,after)
        with self.assertRaisesRegex(RuntimeError,'unproved process census transition'):
            b.graph(allowed_exits={2})
        self.assertIn(after[631210],b.last_census['after'])

    def test_proved_netsimd_reparent_is_narrowly_allowed(self):
        before=self.snapshots();after=dict(before)
        after[3]=(3,before[3][1],1,*before[3][3:])
        adopted=row(3,1,'/netsimd')
        b=self.backend(before,after,{3:adopted})
        self.assertEqual(b.graph(allowed_exits={2})[3]['ppid'],1)
        with self.assertRaisesRegex(RuntimeError,'unproved process census transition'):
            self.backend(before,after,{3:adopted}).graph()

    def test_identity_drift_during_reparent_is_rejected(self):
        before=self.snapshots();after=dict(before)
        after[3]=(3,'reused',1,*before[3][3:])
        with self.assertRaisesRegex(RuntimeError,'unproved process census transition'):
            self.backend(before,after).graph(allowed_exits={2})


class RealEntryTests(unittest.TestCase):
    """Actual execute_once, synthetic I/O/lease/backend; never an OS signal."""
    def exercise(self, scenario):
        with tempfile.TemporaryDirectory(prefix='entry-sdkfree-') as temp:
            root=Path(temp);output=root/'ADMITTED_EXECUTION';output.mkdir();st=output.stat()
            module=root/'adapter.py';module.write_text('synthetic module fixture')
            packet={'schema':'settleora-exact-qemu-only-partial-cleanup-v2',
                'adapterSha256':'adapter-pin','reviewCandidateSha256':'candidate-pin',
                'resultPath':str(output/'RESULT_V5.json'),'consumedPath':str(output/'CONSUMED_V5.json'),
                'outputDirectoryIdentity':{'device':st.st_dev,'inode':st.st_ino},
                'controlPins':[{'path':str(root/'control'),'pin':{'sha256':'control-pin'}}],
                'protectedFiles':[{'path':str(root/'protected'),'pin':{'sha256':'protected-pin'}}],
                'leases':[{'path':str(root/'lease'),'device':1,'inode':2}],
                'toolsRoot':str(root)}
            decision={'recordKind':'REPOSITORY_TECHNICAL_DECISION_NOT_PLATFORM_PERMISSION',
                'decisionMaker':'Atlas','decision':'APPROVE_EXACT_QEMU_ONLY_PARTIAL_CLEANUP',
                'packetSha256':'packet-pin','adapterSha256':'adapter-pin',
                'reviewCandidateSha256':'candidate-pin','runtimeBudget':1,'automaticRetries':0,
                'independentReviews':{k:{'path':str(root/(k+'.json')),'sha256':'review-pin'}for k in ['codex','grok']}}
            ticks=Path('/proc/self/stat').read_text().rsplit(') ',1)[1].split()[19]
            ack={'recordKind':'ACTUAL_NORMAL_TOOL_RETURN_ACK','execSessionId':'synthetic',
                 'normalSupervisorPid':os.getpid(),'leaseHolderPID':os.getpid(),
                 'packetSha256':'packet-pin','normalSupervisorStartTicks':ticks}
            if scenario=='bad_ack':ack['leaseHolderPID']=-1
            review={'status':'PASS','reviewCandidateSha256':'candidate-pin','operationPacketSha256':'packet-pin'}
            inputs={'packet.json':(packet,'packet-pin'),'decision.json':(decision,'d'),
                    'ack.json':(ack,'a'),'codex.json':(review,'c'),'grok.json':(review,'g')}
            counts={}
            def filepin(path, deadline):
                name=Path(path).name;counts[name]=counts.get(name,0)+1
                values={'adapter.py':'adapter-pin','packet.json':'packet-pin',
                        'codex.json':'review-pin','grok.json':'review-pin',
                        'control':'control-pin','protected':'protected-pin'}
                digest=values[name]
                if scenario=='post_drift' and name=='protected' and counts[name]>1:digest='changed'
                return {'sha256':digest}
            backend=types.SimpleNamespace(effect_attempted=False,effect_confirmed=False,
                                          last_census={'synthetic':True},stage='synthetic')
            def partial(*args):
                backend.effect_attempted=backend.effect_confirmed=True
                return {'status':'PARTIAL_QEMU_NETSIMD_EXIT_PROVEN','syntheticOnly':True,
                        'allProcessesCleaned':False,'nativeReady':False,
                        'qemuHeldExit':True,'netsimdHeldExit':True,'retainedPIDs':[1,4]}
            real_open=os.open;real_stat=os.fstat;real_close=os.close
            def opened(path,*args,**kw):return 900001 if str(path)==str(root/'lease') else real_open(path,*args,**kw)
            def stated(fd):return types.SimpleNamespace(st_dev=1,st_ino=2)if fd==900001 else real_stat(fd)
            def closed(fd):
                if fd==900001:
                    if scenario=='close_timeout':raise TimeoutError('synthetic close deadline')
                    return
                return real_close(fd)
            old_path=list(sys.path)
            try:
                with contextlib.ExitStack() as stack:
                    stack.enter_context(patch.object(a,'__file__',str(module)))
                    stack.enter_context(patch.object(a,'bounded_json',side_effect=lambda p:inputs[Path(p).name]))
                    stack.enter_context(patch.object(a,'file_pin',side_effect=filepin))
                    stack.enter_context(patch.object(a,'LinuxBackend',return_value=backend))
                    stack.enter_context(patch.object(a,'load_crashpad_module',return_value=types.SimpleNamespace(check_fresh_peer_ack=lambda *args:None)))
                    run=stack.enter_context(patch.object(a,'run_partial',side_effect=partial))
                    stack.enter_context(patch.object(a.os,'open',side_effect=opened))
                    stack.enter_context(patch.object(a.os,'fstat',side_effect=stated))
                    stack.enter_context(patch.object(a.os,'close',side_effect=closed))
                    stack.enter_context(patch.object(fcntl,'flock'))
                    stack.enter_context(patch.object(a.signal,'getitimer',return_value=(0.0,0.0)))
                    stack.enter_context(patch.object(a.signal,'getsignal',return_value=signal.SIG_DFL))
                    timers=stack.enter_context(patch.object(a.signal,'setitimer'))
                    handler=stack.enter_context(patch.object(a.signal,'signal'))
                    send=stack.enter_context(patch.object(a.signal,'pidfd_send_signal'))
                    stack.enter_context(patch.dict(sys.modules,{'fixture_row_source_boot':types.SimpleNamespace(),
                                                               'fixture_row_source_watchdog':types.SimpleNamespace()}))
                    if scenario in ['success','write_timeout','after_write_deadline']:
                        real_writer=a.exclusive_json
                        def writing(path,value,*args):
                            real_writer(path,value,*args)
                            if Path(path).name=='RESULT_V5.json':
                                if scenario=='write_timeout':raise TimeoutError('synthetic receipt deadline')
                                if scenario=='after_write_deadline':clock[0]=1000
                        clock=[0]
                        stack.enter_context(patch.object(a.time,'monotonic',side_effect=lambda:clock[0]))
                        stack.enter_context(patch.object(a,'exclusive_json',side_effect=writing))
                    if scenario=='success':result=a.execute_once(root/'packet.json',root/'decision.json',root/'ack.json')
                    else:
                        with self.assertRaises((RuntimeError,TimeoutError)):
                            a.execute_once(root/'packet.json',root/'decision.json',root/'ack.json')
                        result=None
                    send.assert_not_called()
                    self.assertEqual(timers.call_args.args,(signal.ITIMER_REAL,0))
                    self.assertEqual(handler.call_args.args,(signal.SIGALRM,signal.SIG_DFL))
                    if scenario=='bad_ack':run.assert_not_called()
                    if scenario=='success':
                        self.assertEqual(result['status'],'PENDING_ACTUAL_NORMAL_TOOL_COMPLETION')
                        self.assertFalse(result['nativeReady'])
                        self.assertGreaterEqual(counts['control'],2)
                        self.assertGreaterEqual(counts['protected'],2)
                    if scenario in ['write_timeout','after_write_deadline']:
                        saved=json.loads((output/'RESULT_V5.json').read_text())
                        self.assertEqual(saved['status'],'PENDING_ACTUAL_NORMAL_TOOL_COMPLETION')
                        completion={'recordKind':'ACTUAL_NORMAL_TOOL_COMPLETION_FROM_TOOL_RETURN',
                            'actualExitCode':1,'operationElapsedSeconds':31,'execSessionId':'synthetic',
                            'resultSha256':'synthetic-result','packetSha256':'packet-pin',
                            'runtimePID':os.getpid(),'operationBeganMonotonic':saved['operationBeganMonotonic']}
                        with self.assertRaises(RuntimeError):
                            a.verify_normal_completion(saved,'synthetic-result',completion,'packet-pin',observation_pin=OBS_PIN)
                    if scenario=='post_drift':
                        self.assertEqual(json.loads((output/'RESULT_V5.json').read_text())['status'],'FAIL')
            finally:sys.path[:]=old_path

    def test_actual_entry_positive_synthetic_and_postguards(self):self.exercise('success')
    def test_actual_entry_bad_ack_prevents_backend(self):self.exercise('bad_ack')
    def test_actual_entry_post_protection_drift_is_failure(self):self.exercise('post_drift')
    def test_deadline_while_closing_still_restores_original_handler(self):self.exercise('close_timeout')
    def test_deadline_during_receipt_write_leaves_only_provisional(self):self.exercise('write_timeout')
    def test_deadline_after_receipt_write_leaves_only_provisional(self):self.exercise('after_write_deadline')


class CompletionTests(unittest.TestCase):
    def setUp(self):
        self.result={'status':'PENDING_ACTUAL_NORMAL_TOOL_COMPLETION','packetSha256':'packet',
            'runtimePID':123,'operationBeganMonotonic':10,'qemuHeldExit':True,
            'netsimdHeldExit':True,'effectAttempted':True,'effectConfirmed':True,
            'protectedInputsExact':True,'within30Seconds':True,
            'requiresExternalActualToolExit0':True,'allProcessesCleaned':False,
            'nativeReady':False,'retainedPIDs':[1,4,5],
            'observationOnlyCrashpad':{'pid':5,'ticks':'50','currentTaskAnchorAndPeerProven':True,
                'historicalCreatorClaimed':False,'heldExitObserved':False,'retainedPID':5,
                'signalAuthority':False,'deadlineExtended':False}}
        self.completion={'recordKind':'ACTUAL_NORMAL_TOOL_COMPLETION_FROM_TOOL_RETURN',
            'actualExitCode':0,'operationElapsedSeconds':2,'execSessionId':'synthetic',
            'resultSha256':'result','packetSha256':'packet','runtimePID':123,
            'operationBeganMonotonic':10}
    def test_qualified_partial_only_after_actual_completion(self):
        result=a.verify_normal_completion(self.result,'result',self.completion,'packet',observation_pin=OBS_PIN)
        self.assertEqual(result['status'],'PARTIAL_QEMU_NETSIMD_EXIT_PROVEN')
        self.assertFalse(result['nativeReady'])
    def test_completion_mismatch_nonzero_or_timeout_rejected(self):
        for key,value in [('recordKind','plan'),('actualExitCode',1),('actualExitCode',False),
            ('operationElapsedSeconds',30),('operationElapsedSeconds',31),
            ('operationElapsedSeconds',float('nan')),('execSessionId',''),
            ('resultSha256','wrong'),('packetSha256','wrong'),('runtimePID',999),
            ('operationBeganMonotonic',999)]:
            with self.subTest(key=key,value=value):
                c=dict(self.completion);c[key]=value
                with self.assertRaises(RuntimeError):a.verify_normal_completion(self.result,'result',c,'packet',observation_pin=OBS_PIN)
    def test_missing_exit_proof_or_protection_rejected(self):
        for key in ['qemuHeldExit','netsimdHeldExit','effectConfirmed',
                    'protectedInputsExact','requiresExternalActualToolExit0']:
            r=dict(self.result);r[key]=False
            with self.assertRaises(RuntimeError):a.verify_normal_completion(r,'result',self.completion,'packet',observation_pin=OBS_PIN)
    def test_neutral_qualification_requires_exact_private_observer_proof(self):
        for key,value in [('pid',99),('ticks','999'),('signalAuthority',True),
            ('currentTaskAnchorAndPeerProven',False),('deadlineExtended',True),
            ('historicalCreatorClaimed',True),('retainedPID',None),('heldExitObserved',True)]:
            r=copy.deepcopy(self.result);r['observationOnlyCrashpad'][key]=value
            with self.assertRaises(RuntimeError):
                a.verify_normal_completion(r,'result',self.completion,'packet',observation_pin=OBS_PIN)


class CrashpadCoreIntegrationTests(unittest.TestCase):
    def exercise(self,scenario):
        from test_crashpad_observer_v1 import CrashpadTests
        fixture=CrashpadTests(methodName='test_complete_initial_proof_projects_exact_only_without_mutation')
        fixture.setUp()
        try:
            class WithCrashpad(Fake):
                def __init__(self):
                    super().__init__();self.original[1]=copy.deepcopy(fixture.anchor)
                    self.original[2]=copy.deepcopy(fixture.qemu)
                    self.expected={p:a.identity(r)for p,r in self.original.items()}
                    self.held=[]
                def graph(self, allowed_exits=frozenset(), refresh_exits=None, observed_exit=None):
                    rows=super().graph(allowed_exits=allowed_exits)
                    if self.sent and scenario=='natural_exit':
                        fixture.rows.pop(5,None);fixture.poll.poll.return_value=[(999,select.POLLIN)]
                    if 5 in fixture.rows:rows[5]=copy.deepcopy(fixture.rows[5])
                    if scenario=='unrelated' or(self.sent and scenario=='future_unknown'):
                        rows[6]=row(6,1,str(fixture.image))
                    return rows
                def crashpad_observer(self,deadline):return fixture.observer()
                def hold(self,pid):self.held.append(pid);return super().hold(pid)
            backend=WithCrashpad()
            if scenario=='wrong_uid':fixture.rows[5]['uid']=1001
            if scenario in ['wrong_uid','unrelated','future_unknown']:
                with self.assertRaises(RuntimeError):a.run_partial(PACKET,backend,30)
            else:
                result=a.run_partial(PACKET,backend,30)
                self.assertEqual(result['retainedPIDs'],[1,4]if scenario=='natural_exit'else[1,4,5])
                self.assertFalse(result['observationOnlyCrashpad']['signalAuthority'])
            self.assertNotIn(5,backend.held)
            self.assertNotIn(999,backend.closed)
            self.assertTrue(all(pid==2 and fd==102 and sig==signal.SIGTERM
                                for fd,pid,sig in backend.sent))
            if scenario in ['wrong_uid','unrelated']:self.assertFalse(backend.sent)
            else:self.assertEqual(len(backend.sent),1)
        finally:
            fixture.cleanup();fixture.temp.cleanup()
    def test_exact_private_observer_not_in_original_signal_or_member_sets(self):self.exercise('retained')
    def test_observed_natural_exit_has_private_held_proof(self):self.exercise('natural_exit')
    def test_unrelated_same_image_name_rejected(self):self.exercise('unrelated')
    def test_future_unknown_not_projected(self):self.exercise('future_unknown')
    def test_wrong_existing_observer_uid_rejected_before_effect(self):self.exercise('wrong_uid')


class LoaderTests(unittest.TestCase):
    def test_other_module_path_rejected_without_loading(self):
        with patch.object(a,'file_pin')as read:
            with self.assertRaises(RuntimeError):
                a.load_crashpad_module({'crashpadModule':{'path':'/unrelated/module.py','sha256':'x'}},a.time.monotonic()+10)
            read.assert_not_called()
    def test_module_hash_change_rejected(self):
        path=Path(a.__file__).resolve().with_name('crashpad_observer_v1.py')
        with patch.object(a,'file_pin',return_value={'sha256':'changed'}):
            with self.assertRaises(RuntimeError):
                a.load_crashpad_module({'crashpadModule':{'path':str(path),'sha256':'expected'}},a.time.monotonic()+10)


if __name__=='__main__':unittest.main()
