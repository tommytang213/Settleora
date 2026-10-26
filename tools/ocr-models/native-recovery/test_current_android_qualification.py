"""SDK-free failures/ownership/lifecycle tests; no native executable is invoked."""
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import time
import types
import unittest
from unittest.mock import Mock, patch

s = importlib.util.spec_from_file_location('current_fixture', Path(__file__).with_name('current_android_qualification.py'))
r = importlib.util.module_from_spec(s)
s.loader.exec_module(r)


def fixture(root):
    p = dict(schema='settleora-current-android-qualification-v1', head='a' * 40, repo=str(root),
        runRoot=str(r.state_parent() / 'new-run'), sourceArchive=dict(path=str(root / 'source.tar'), sha256='b' * 64),
        image=dict(path=str(root / 'system.img'), sha256='c' * 64),
        filePins={str(root / 'source.py'): 'd' * 64},
        tools={x: dict(path=str(root / x), sha256='e' * 64) for x in ('adb', 'emulator', 'avdmanager', 'flutter', 'node', 'java')},
        network=dict(Status='Connected', Server='dedicated-fixture', Country='United States', City='Boston',
                     IP='192.0.2.1', Protocol='NordLynx', **{'Kill Switch': 'enabled', 'Firewall': 'enabled'}),
        locks=[dict(path=str(root / str(i)), device=1, inode=i) for i in range(5)],
        jobID='atlas-ocr-current-execute-fixture', jobsPath=str(root / 'jobs.json'),
        bounds=dict(prepare=300, boot=600, test=10800, cleanup=90, retries=0), review={},
        sdkRoot=str(root / 'sdk'), flutterRoot=str(root / 'flutter-sdk'), pubCache=str(root / 'pub-cache'),
        gradleReadOnlyCache=str(root / 'gradle-read-only'), models=[dict(path=str(root / 'model'),
            relativePath='apps/mobile/assets/model', sha256='f' * 64)], bootID='fixture-boot',
        pidNamespace=1, netNamespace=2, writeScope=['fresh test scratch and explicitly admitted normal SDK cache effects'])
    p['image']['path'] = str(Path(p['sdkRoot']) / 'system-images/android-35/google_apis/x86_64/system.img')
    for role, rel in {'adb': 'platform-tools/adb', 'emulator': 'emulator/emulator', 'avdmanager': 'cmdline-tools/latest/bin/avdmanager'}.items():
        p['tools'][role]['path'] = str(Path(p['sdkRoot']) / rel)
    p['tools']['flutter']['path'] = str(Path(p['flutterRoot']) / 'bin/flutter')
    p['imageFiles'] = {'system.img': p['image']['sha256']}
    p['writeScope'] = r.write_scope(p)
    return p


class Fake:
    last = None
    fail = None
    def __init__(self, p, digest):
        self.events = []
        Fake.last = self
    def event(self, name):
        self.events.append(name)
        if Fake.fail == name:
            raise RuntimeError('synthetic:' + str(name))
    def setup(self): self.event('setup')
    def execute(self): self.event('execute'); return 17
    def cleanup(self): self.event('cleanup')
    def retain(self, code, clean): self.event(('retain', code, clean))
    def release(self): self.event('release')


class CurrentRunnerTests(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.addCleanup(self.t.cleanup)
        self.root = Path(self.t.name)
        state = self.root / 'qualification-history'
        state.mkdir()
        self.real_state_parent = r.state_parent
        setting = patch.object(r, 'state_parent', return_value=state)
        setting.start()
        self.addCleanup(setting.stop)
        self.p = fixture(self.root)
        self.token = object()
        self.previous = r._invocation
        r._invocation = self.token
        self.addCleanup(setattr, r, '_invocation', self.previous)
        Fake.fail = None

    def test_import_cannot_launch_and_run_needs_normal_context(self):
        with patch.object(r.subprocess, 'Popen') as popen, self.assertRaises(PermissionError):
            r.run(self.p, 'x', object(), Fake)
        popen.assert_not_called()

    def test_exact_packet_scope_and_deadlines_reject_changed_contract(self):
        r.validate(self.p)
        for mutate in (lambda p: p.update(extra=True), lambda p: p['bounds'].update(retries=True),
                       lambda p: p['bounds'].update(test=21600), lambda p: p['network'].update(City='Japan'),
                       lambda p: p['network'].update({'Firewall': 'disabled'}),
                       lambda p: p['models'][0].update(relativePath='../../outside'),
                       lambda p: p['locks'].__setitem__(4, p['locks'][0])):
            p = copy.deepcopy(self.p)
            mutate(p)
            with self.assertRaises(ValueError):
                r.validate(p)

    def test_native_test_exit_is_retained_and_never_native_readiness(self):
        result = r.run(self.p, 'x', self.token, Fake)
        self.assertEqual(result['testExitCode'], 17)
        self.assertFalse(result['nativeReady'])
        self.assertEqual(Fake.last.events, ['setup', 'execute', 'cleanup', ('retain', 17, True), 'release'])

    def test_setup_and_execute_failures_still_cleanup_retain_release(self):
        for failure in ('setup', 'execute'):
            Fake.fail = failure
            with self.assertRaises(RuntimeError):
                r.run(self.p, 'x', self.token, Fake)
            self.assertIn('cleanup', Fake.last.events)
            self.assertEqual(Fake.last.events[-2:], [('retain', 98, True), 'release'])

    def test_cleanup_failure_is_not_success_and_release_still_occurs(self):
        Fake.fail = 'cleanup'
        with self.assertRaises(RuntimeError):
            r.run(self.p, 'x', self.token, Fake)
        self.assertEqual(Fake.last.events[-2:], [('retain', 17, False), 'release'])

    def test_retention_failure_cannot_report_success_or_skip_release(self):
        Fake.fail = ('retain', 17, True)
        with self.assertRaises(RuntimeError):
            r.run(self.p, 'x', self.token, Fake)
        self.assertEqual(Fake.last.events[-1], 'release')

    def test_launch_signal_rejects_blocked_ignored_and_missing_without_mutation(self):
        r.check_signal_context('SigBlk: 0\nSigIgn: 0\n')
        for text in ('SigBlk: 4000\nSigIgn: 0', 'SigBlk: 0\nSigIgn: 4000', 'SigBlk: 0'):
            with self.assertRaises((RuntimeError, KeyError)):
                r.check_signal_context(text)

    def archive(self, members):
        path = self.root / 'source.tar'
        with tarfile.open(path, 'w') as tar:
            for name, kind in members:
                m = tarfile.TarInfo(name)
                if kind == 'symlink':
                    m.type = tarfile.SYMTYPE
                    m.linkname = '/outside'
                    tar.addfile(m)
                else:
                    m.size = 3
                    tar.addfile(m, io.BytesIO(b'abc'))
        return path

    def test_source_extraction_rejects_links_escape_and_duplicate_before_extract(self):
        destination = self.root / 'destination'
        destination.mkdir()
        for members in ([('../outside', 'file')], [('/outside', 'file')], [('link', 'symlink')],
                        [('same', 'file'), ('same', 'file')]):
            with self.assertRaises(ValueError):
                r.extract_source(self.archive(members), destination)
            self.assertEqual(list(destination.iterdir()), [])
        r.extract_source(self.archive([('ordinary.txt', 'file')]), destination)
        self.assertEqual((destination / 'ordinary.txt').read_bytes(), b'abc')

    def backend(self):
        b = r.Backend(self.p, 'fixture')
        b.root.mkdir()
        b.scratch.mkdir()
        b.deadline = time.monotonic() + 60
        b.verify_tool = Mock()
        return b

    def test_existing_run_is_never_modified_during_failed_setup_retention(self):
        b = self.backend()
        (b.root / 'terminal.json').write_bytes(b'old failure')
        b.life = Mock()
        b.retain(98, False)
        b.life.capture.assert_not_called()
        self.assertEqual((b.root / 'terminal.json').read_bytes(), b'old failure')

    def test_record_is_exclusive_and_preserves_original_evidence(self):
        b = self.backend()
        b.record('CONSUMED.json', {'original': True})
        original = (b.root / 'CONSUMED.json').read_bytes()
        with self.assertRaises(FileExistsError):
            b.record('CONSUMED.json', {'original': False})
        self.assertEqual((b.root / 'CONSUMED.json').read_bytes(), original)

    def child(self, b):
        proc = Mock(pid=22)
        proc.poll.return_value = None
        b.children['adb'] = dict(proc=proc, pidfd=101, ticks='123', termAttempted=False)
        stat = self.root / 'stat'
        fields = ['S', str(os.getpid()), '22', '22'] + ['0'] * 15 + ['123']
        stat.write_text('22 (adb) ' + ' '.join(fields))
        original_path = Path
        def path(*parts):
            if parts == ('/proc', '22', 'stat'):
                return stat
            return original_path(*parts)
        return path

    def test_only_original_child_pidfd_gets_one_term_and_uncertain_is_not_retried(self):
        b = self.backend()
        path = self.child(b)
        with patch.object(r, 'Path', path), patch.object(r.signal, 'pidfd_send_signal', side_effect=OSError('uncertain')) as send:
            with self.assertRaises(OSError): b.stop('adb')
            with self.assertRaises(RuntimeError): b.stop('adb')
        self.assertEqual(send.call_count, 1)
        self.assertEqual(send.call_args.args, (101, r.signal.SIGTERM, None, 0))
        self.assertTrue((b.root / 'TERM_ATTEMPTED_adb.json').exists())

    def test_durable_intent_cost_cannot_signal_after_deadline(self):
        b = self.backend()
        path = self.child(b)
        original = b.record
        def record(*args):
            original(*args)
            b.deadline = time.monotonic() - 1
        with patch.object(r, 'Path', path), patch.object(b, 'record', record), patch.object(r.signal, 'pidfd_send_signal') as send:
            with self.assertRaises(TimeoutError): b.stop('adb')
        send.assert_not_called()
        self.assertTrue(b.children['adb']['termAttempted'])

    def test_new_launch_uncertainty_cannot_be_repeated(self):
        b = self.backend()
        b.env = {}
        for name in ('jobs', 'policy', 'native_census'): setattr(b, name, Mock())
        with patch.object(r, 'check_signal_context'), patch.object(r.subprocess, 'Popen', side_effect=OSError('uncertain')) as popen:
            with self.assertRaises(OSError): b.start('adb', ['synthetic'])
            with self.assertRaises(RuntimeError): b.start('adb', ['synthetic'])
        self.assertEqual(popen.call_count, 1)
        for f in b.streams: f.close()

    def test_no_children_precheck_failure_does_not_probe_or_stop_other_work(self):
        b = self.backend()
        b.native_census = Mock(side_effect=AssertionError('unrelated work'))
        with patch.object(r.signal, 'pidfd_send_signal') as send:
            b.cleanup()
        b.native_census.assert_not_called()
        send.assert_not_called()

    def test_policy_requires_exact_dedicated_server_and_keeps_home_only(self):
        b = self.backend()
        status = '\n'.join(k + ': ' + v for k, v in self.p['network'].items())
        responses = [types.SimpleNamespace(returncode=0, stdout=status.encode()), types.SimpleNamespace(returncode=0, stdout=b'')]
        with patch.object(r.subprocess, 'run', side_effect=responses) as command:
            b.policy()
        self.assertEqual(set(command.call_args.kwargs['env']), {'HOME', 'PATH', 'LANG', 'LC_ALL'})
        responses[0].stdout = status.replace('192.0.2.1', '192.0.2.2').encode()
        with patch.object(r.subprocess, 'run', side_effect=responses), self.assertRaises(RuntimeError):
            b.policy()

    def test_root_reuse_is_not_an_exclusion_for_unrelated_native_work(self):
        b = self.backend()
        b.children['adb'] = dict(proc=types.SimpleNamespace(pid=22, poll=lambda: None), ticks='123')
        proc = self.root / 'proc'
        (proc / '22').mkdir(parents=True)
        fields = ['S', '1', '22', '22'] + ['0'] * 15 + ['456']
        (proc / '22/stat').write_text('22 (java) ' + ' '.join(fields))
        original = Path
        def path(*args): return proc if args == ('/proc',) else original(*args)
        with patch.object(r, 'Path', path), self.assertRaises(RuntimeError):
            b.native_census()

    def test_extracted_dart_outside_two_entrypoints_must_match_git_blob(self):
        source = self.root / 'extracted'
        (source / 'apps/mobile/lib').mkdir(parents=True)
        target = source / 'apps/mobile/lib/parser.dart'
        target.write_bytes(b'unchanged parser')
        object_id = hashlib.sha1(b'blob 16\0unchanged parser').hexdigest()
        listing = ('100644 blob ' + object_id + '\tapps/mobile/lib/parser.dart\0').encode()
        with patch.object(r.subprocess, 'check_output', return_value=listing):
            r.verify_source_tree('/synthetic', 'a' * 40, source)
            target.write_bytes(b'replaced parser')
            with self.assertRaises(RuntimeError):
                r.verify_source_tree('/synthetic', 'a' * 40, source)

    def test_untracked_source_archive_member_cannot_be_accepted(self):
        source = self.root / 'extracted'
        source.mkdir()
        (source / 'unexpected.dart').write_bytes(b'new behavior')
        with patch.object(r.subprocess, 'check_output', return_value=b''), self.assertRaises(RuntimeError):
            r.verify_source_tree('/synthetic', 'a' * 40, source)

    def test_boot_liveness_ignores_completed_preparation_children(self):
        b = self.backend()
        b.children = {'cmd_1': {'proc': types.SimpleNamespace(poll=lambda: 0)}}
        def start(role, *args, **kwargs):
            b.children[role] = {'proc': types.SimpleNamespace(poll=lambda: None)}
        b.start = Mock(side_effect=start)
        b.require_server = Mock()
        b.log_bounds = Mock()
        b.adb = Mock(side_effect=['1', '', '', '', '', '1', 'enabled', '0', '0'])
        b.wait = Mock(return_value=0)
        b.verify_runtime_inputs = Mock()
        with patch.object(r, 'verify_source_tree'):
            self.assertEqual(b.execute(), 0)
        self.assertEqual(b.start.call_args_list[-1].args[0], 'runner')

    def test_adb_clients_use_exact_numeric_loopback_and_never_default_autostart(self):
        b = self.backend()
        b.require_server = Mock()
        b.command = Mock(return_value='1\n')
        self.assertEqual(b.adb(['shell', 'getprop', 'sys.boot_completed']), '1\n')
        self.assertEqual(b.command.call_args.args[0][1:7], ['-H', '127.0.0.1', '-P', '5037', '-s', 'emulator-5554'])
        self.assertEqual(b.require_server.call_count, 2)

    def test_missing_foreground_server_forbids_client_command(self):
        b = self.backend()
        b.command = Mock()
        with self.assertRaises(RuntimeError):
            b.adb(['shell', 'settings', 'put', 'global', 'airplane_mode_on', '1'])
        b.command.assert_not_called()

    def test_sdk_command_timeout_retains_child_for_owned_cleanup_without_run_kill(self):
        b = self.backend()
        b.start = Mock()
        b.wait = Mock(side_effect=TimeoutError('synthetic child timeout'))
        with patch.object(r.subprocess, 'run') as hidden_run, self.assertRaises(TimeoutError):
            b.command(['synthetic-sdk'], timeout=1)
        hidden_run.assert_not_called()
        self.assertEqual(b.start.call_args.args[0], 'cmd_1')

    def test_write_scope_cannot_omit_shared_sdk_cache_effects(self):
        self.assertIn(str(Path(self.p['flutterRoot']) / 'bin/cache/lockfile'), self.p['writeScope'])
        self.p['writeScope'] = [self.p['runRoot']]
        with self.assertRaises(ValueError):
            r.validate(self.p)

    def test_post_consumed_no_child_cleanup_still_checks_live_candidates(self):
        b = self.backend()
        b.created = b.consumption_confirmed = True
        b.verify_preserved_inputs = Mock()
        b.native_census = Mock(side_effect=RuntimeError('new competing native work'))
        with self.assertRaises(RuntimeError):
            b.cleanup()
        b.native_census.assert_called_once_with(initial=True)
        self.assertFalse((b.root / 'CLEANUP_OBSERVED.json').exists())

    def test_long_source_hash_and_extraction_check_deadlines_without_sdk_launch(self):
        p = self.root / 'large'
        p.write_bytes(b'x' * 100)
        check = Mock(side_effect=TimeoutError('phase expired'))
        with self.assertRaises(TimeoutError):
            r.sha(p, check)
        destination = self.root / 'extracted'
        destination.mkdir()
        with self.assertRaises(TimeoutError):
            r.extract_source(self.archive([('plain', 'file')]), destination, check)
        self.assertEqual(list(destination.iterdir()), [])

    def test_wrong_owned_listener_blocks_before_emulator_launch(self):
        b = self.backend()
        def start(role, *args, **kwargs):
            b.children[role] = {'proc': types.SimpleNamespace(poll=lambda: 1)}
        b.start = Mock(side_effect=start)
        b.require_server = Mock(side_effect=RuntimeError('no exact owned IPv4 listener'))
        with self.assertRaises(RuntimeError):
            b.execute()
        self.assertEqual(b.start.call_count, 1)
        self.assertEqual(b.start.call_args.args[0], 'adb')

    def test_last_adb_listener_check_is_after_intent_and_before_popen(self):
        b = self.backend()
        b.env = {}
        for name in ('jobs', 'policy', 'native_census'): setattr(b, name, Mock())
        def check():
            self.assertTrue((b.root / 'LAUNCH_ATTEMPTED_cmd_1.json').exists())
            raise RuntimeError('server drift after observers')
        b.require_server = Mock(side_effect=check)
        with patch.object(r, 'check_signal_context'), patch.object(r.subprocess, 'Popen') as popen:
            with self.assertRaises(RuntimeError):
                b.start('cmd_1', ['synthetic-adb'], require_server=True)
        popen.assert_not_called()
        for f in b.streams: f.close()

    def test_subreaper_adopted_arbitrary_name_child_is_not_invisible(self):
        b = self.backend()
        b.subreaper = True
        proc = self.root / 'proc'
        (proc / '77').mkdir(parents=True)
        fields = ['S', str(os.getpid()), '88', '88'] + ['0'] * 15 + ['456']
        (proc / '77/stat').write_text('77 (arbitrary-helper) ' + ' '.join(fields))
        original = Path
        def path(*args): return proc if args == ('/proc',) else original(*args)
        with patch.object(r, 'Path', path):
            rows = b.native_census()
        self.assertIn((77, '456'), b.owned_descendants)
        self.assertEqual(rows[77]['ppid'], os.getpid())

    def test_generated_files_do_not_allow_tracked_runtime_drift_after_pub(self):
        source = self.root / 'generated-source'
        source.mkdir()
        target = source / 'parser.dart'
        target.write_bytes(b'original')
        (source / '.dart_tool').mkdir()
        (source / '.dart_tool' / 'generated').write_bytes(b'normal build metadata')
        obj = hashlib.sha1(b'blob 8\0original').hexdigest()
        listing = ('100644 blob ' + obj + '\tparser.dart\0').encode()
        with patch.object(r.subprocess, 'check_output', return_value=listing):
            r.verify_source_tree('/synthetic', 'a' * 40, source, strict_inventory=False)
            target.write_bytes(b'drift')
            with self.assertRaises(RuntimeError):
                r.verify_source_tree('/synthetic', 'a' * 40, source, strict_inventory=False)

    def test_emulator_and_runner_launches_request_adjacent_owned_adb_check(self):
        b = self.backend()
        def start(role, *args, **kwargs):
            b.children[role] = {'proc': types.SimpleNamespace(poll=lambda: None)}
        b.start = Mock(side_effect=start)
        b.require_server = Mock()
        b.log_bounds = Mock()
        b.adb = Mock(side_effect=['1', '', '', '', '', '1', 'enabled', '0', '0'])
        b.wait = Mock(return_value=0)
        b.verify_runtime_inputs = Mock()
        with patch.object(r, 'verify_source_tree'):
            b.execute()
        calls = {x.args[0]: x for x in b.start.call_args_list}
        self.assertTrue(calls['emulator'].kwargs['require_server'])
        self.assertTrue(calls['runner'].kwargs['require_server'])

    def test_post_consumed_adopted_helper_prevents_zero_root_clean_proof(self):
        b = self.backend()
        b.created = b.subreaper = b.consumption_confirmed = True
        b.verify_preserved_inputs = Mock()
        b.native_census = Mock(return_value={77: {'ppid': os.getpid()}})
        with self.assertRaises(RuntimeError):
            b.cleanup()
        self.assertFalse((b.root / 'CLEANUP_OBSERVED.json').exists())

    def test_every_declared_write_filesystem_is_checked_not_only_run_root(self):
        good = types.SimpleNamespace(free=100 * 1024**3)
        full = types.SimpleNamespace(free=1 * 1024**3)
        with patch.object(r.shutil, 'disk_usage', side_effect=[good, full]) as probe:
            with self.assertRaises(RuntimeError):
                r.check_write_space([str(self.root / 'run'), str(self.root / 'shared-sdk-cache')])
        self.assertEqual(probe.call_count, 2)

    def test_arbitrary_hashed_image_cannot_substitute_for_launched_package(self):
        p = copy.deepcopy(self.p)
        p['image']['path'] = str(self.root / 'unrelated.img')
        with self.assertRaises(ValueError):
            r.validate(p)

    def test_emulator_gets_explicit_exact_hashed_system_image_arguments(self):
        b = self.backend()
        def start(role, *args, **kwargs):
            b.children[role] = {'proc': types.SimpleNamespace(poll=lambda: None)}
        b.start = Mock(side_effect=start)
        b.require_server = Mock()
        b.log_bounds = Mock()
        b.adb = Mock(side_effect=['1', '', '', '', '', '1', 'enabled', '0', '0'])
        b.wait = Mock(return_value=0)
        b.verify_runtime_inputs = Mock()
        with patch.object(r, 'verify_source_tree'):
            b.execute()
        argv = next(x.args[1] for x in b.start.call_args_list if x.args[0] == 'emulator')
        self.assertEqual(argv[argv.index('-system') + 1], self.p['image']['path'])
        self.assertEqual(argv[argv.index('-sysdir') + 1], str(Path(self.p['image']['path']).parent))

    def test_actual_test_status_survives_later_source_verification_failure(self):
        class PostCheckFailure(Fake):
            def execute(self):
                self.observed_test_exit = 0
                raise RuntimeError('post-test source drift')
        with self.assertRaises(RuntimeError):
            r.run(self.p, 'fixture', self.token, PostCheckFailure)
        self.assertIn(('retain', 0, True), Fake.last.events)

    def test_postflight_immutable_input_drift_blocks_success(self):
        b = self.backend()
        p = self.root / 'pinned-source'
        p.write_bytes(b'preserved')
        b.p['filePins'] = {str(p): hashlib.sha256(b'preserved').hexdigest()}
        b.p['models'] = []
        b.p['image'] = b.p['sourceArchive'] = {'path': str(p), 'sha256': hashlib.sha256(b'preserved').hexdigest()}
        b.verify_image_bundle = Mock()
        b.verify_preserved_inputs()
        p.write_bytes(b'changed')
        with self.assertRaises(RuntimeError):
            b.verify_preserved_inputs()

    def test_subreaper_failure_is_always_after_durable_consumption(self):
        b = self.backend()
        libc = Mock()
        libc.prctl.return_value = -1
        with patch.object(r.ctypes, 'CDLL', return_value=libc), self.assertRaises(OSError):
            b.consume_and_adopt()
        self.assertTrue((b.root / 'CONSUMED.json').exists())
        self.assertTrue(b.consumed)
        self.assertTrue(b.consumption_confirmed)
        self.assertFalse(b.subreaper)

    def test_uncertain_consumption_never_changes_subreaper_or_launches(self):
        b = self.backend()
        b.record = Mock(side_effect=OSError('uncertain fsync'))
        with patch.object(r.ctypes, 'CDLL') as libc, self.assertRaises(OSError):
            b.consume_and_adopt()
        libc.assert_not_called()
        self.assertTrue(b.consumed)
        self.assertFalse(b.consumption_confirmed)
        self.assertFalse(b.children)

    def test_failed_cleanup_history_blocks_future_attempt_even_if_pid_disappears(self):
        parent = r.state_parent()
        old = parent / 'old-failed'
        old.mkdir()
        (old / 'terminal.json').write_text(json.dumps({'schema': 'settleora-native-run-terminal-v1', 'cleanupVerified': False}))
        (old / 'SUPERVISOR_FINALIZED.json').write_text(json.dumps({'cleanupVerified': False}))
        with self.assertRaises(RuntimeError):
            r.check_previous_runs(parent)
        (old / 'terminal.json').write_text(json.dumps({'schema': 'settleora-native-run-terminal-v1', 'cleanupVerified': True}))
        (old / 'SUPERVISOR_FINALIZED.json').write_text(json.dumps({'cleanupVerified': True}))
        r.check_previous_runs(parent)

    def test_missing_finalization_history_cannot_be_ignored_or_choose_another_parent(self):
        old = r.state_parent() / 'partial'
        old.mkdir()
        with self.assertRaises(FileNotFoundError):
            r.check_previous_runs(r.state_parent())
        self.p['runRoot'] = str(self.root / 'alternate-parent' / 'run')
        self.p['writeScope'] = r.write_scope(self.p)
        with self.assertRaises(ValueError):
            r.validate(self.p)

    def test_kernel_and_vendor_are_bound_not_only_system_img(self):
        b = self.backend()
        parent = self.root / 'image-package'
        parent.mkdir()
        for name in ('system.img', 'kernel-ranchu', 'ramdisk.img', 'vendor.img'):
            (parent / name).write_bytes(name.encode())
        b.p['image']['path'] = str(parent / 'system.img')
        b.p['imageFiles'] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in parent.iterdir()}
        b.verify_image_bundle()
        (parent / 'vendor.img').write_bytes(b'drift')
        with self.assertRaises(RuntimeError):
            b.verify_image_bundle()

    def test_pidfd_without_proved_start_identity_is_failed_cleanup_not_guess_signal(self):
        b = self.backend()
        b.children['adb'] = {'proc': Mock(pid=22, poll=Mock(return_value=None)), 'pidfd': 101, 'ticks': None, 'termAttempted': False}
        with patch.object(r.signal, 'pidfd_send_signal') as send, self.assertRaises(RuntimeError):
            b.stop('adb')
        send.assert_not_called()

    def test_history_parent_uses_uid_account_record_not_home_environment(self):
        with patch.dict(os.environ, {'HOME': '/alternate-home'}), patch.object(r.pwd, 'getpwuid', return_value=types.SimpleNamespace(pw_dir='/account-home')):
            self.assertEqual(self.real_state_parent(), Path('/account-home/.local/state/settleora-native-qualification'))

    def test_uncertain_consumption_cannot_create_clean_proof_even_without_children(self):
        b = self.backend()
        b.created = b.consumed = True
        b.native_census = Mock()
        with self.assertRaises(RuntimeError):
            b.cleanup()
        b.native_census.assert_not_called()
        self.assertFalse((b.root / 'CLEANUP_OBSERVED.json').exists())

    def test_child_exited_before_identity_capture_is_still_failed_epoch(self):
        b = self.backend()
        b.children['adb'] = {'proc': types.SimpleNamespace(poll=lambda: 0), 'ticks': None, 'identityConfirmed': False}
        with self.assertRaises(RuntimeError):
            b.stop('adb')

    def test_adopted_child_in_final_census_cannot_be_ignored(self):
        b = self.backend()
        b.created = b.consumption_confirmed = b.subreaper = True
        b.children['runner'] = {'proc': types.SimpleNamespace(pid=22, poll=lambda: 0), 'ticks': '123', 'identityConfirmed': True}
        adopted = {77: dict(ppid=os.getpid(), pgid=77, sid=77, ticks='456')}
        b.native_census = Mock(side_effect=[{}, {}, adopted])
        b.verify_preserved_inputs = Mock()
        with self.assertRaises(RuntimeError):
            b.cleanup()
        self.assertFalse((b.root / 'CLEANUP_OBSERVED.json').exists())

    def test_emulator_port_recheck_follows_intent_before_popen(self):
        b = self.backend()
        b.env = {}
        for name in ('jobs', 'policy', 'native_census'): setattr(b, name, Mock())
        def ports():
            self.assertTrue((b.root / 'LAUNCH_ATTEMPTED_emulator.json').exists())
            raise RuntimeError('new listener after preparation')
        with patch.object(r, 'check_signal_context'), patch.object(r, 'check_free_emulator_ports', ports), patch.object(r.subprocess, 'Popen') as popen:
            with self.assertRaises(RuntimeError):
                b.start('emulator', ['synthetic-emulator'], require_server=True)
        popen.assert_not_called()
        for f in b.streams: f.close()

    def test_offline_gradle_init_exists_before_settings_and_never_overwrites(self):
        parent = self.root / 'gradle-home'
        parent.mkdir()
        path = r.install_gradle_offline_init(parent)
        self.assertEqual(path.read_text().strip(), 'gradle.startParameter.offline = true')
        with self.assertRaises(FileExistsError):
            r.install_gradle_offline_init(parent)

    def test_tool_changed_after_durable_intent_never_reaches_popen(self):
        b = self.backend()
        tool = self.root / 'tool'
        tool.write_bytes(b'original')
        b.p['tools']['adb'] = {'path': str(tool), 'sha256': hashlib.sha256(b'original').hexdigest()}
        b.verify_tool = lambda argv: r.Backend.verify_tool(b, argv)
        b.env = {}
        for name in ('jobs', 'policy', 'native_census'): setattr(b, name, Mock())
        original = b.record
        def record(*args):
            original(*args)
            tool.write_bytes(b'changed')
        b.record = record
        with patch.object(r, 'check_signal_context'), patch.object(r.subprocess, 'Popen') as popen:
            with self.assertRaises(RuntimeError): b.start('adb', [str(tool)])
        popen.assert_not_called()
        for f in b.streams: f.close()

    def test_cleanup_log_overflow_cannot_record_empty_clean_proof(self):
        b = self.backend()
        b.created = b.consumption_confirmed = True
        b.children['adb'] = {'proc': types.SimpleNamespace(pid=22, poll=lambda: 0), 'ticks': '123', 'identityConfirmed': True}
        b.native_census = Mock(return_value={})
        b.verify_preserved_inputs = Mock()
        (b.scratch / 'adb_stdout.log').write_bytes(b'x' * (r.CAP + 1))
        with self.assertRaises(RuntimeError):
            b.cleanup()
        self.assertFalse((b.root / 'CLEANUP_OBSERVED.json').exists())

    def test_descendant_ledger_survives_earlier_diagnostic_capture_failure(self):
        b = self.backend()
        b.created = True
        b.life = Mock()
        b.life.capture.side_effect = RuntimeError('changing diagnostic')
        b.owned_descendants[(77, '456')] = dict(ppid=os.getpid(), pgid=77, sid=77, ticks='456', comm='helper')
        (b.scratch / 'emulator_stdout.log').write_bytes(b'log')
        with self.assertRaises(RuntimeError): b.retain(98, False)
        ledger = json.loads((b.root / 'OWNED_DESCENDANTS.json').read_text())
        self.assertEqual(ledger['observed'][0]['pid'], 77)
        self.assertFalse(ledger['cleanupVerified'])

    def test_ignored_sigchld_cannot_fabricate_actual_wait_status(self):
        with self.assertRaises(RuntimeError):
            r.check_signal_context('SigBlk: 0\nSigIgn: 10000\n')

    def test_positive_policy_failure_during_boot_is_not_a_transient_device_poll(self):
        b = self.backend()
        def start(role, *args, **kwargs):
            b.children[role] = {'proc': types.SimpleNamespace(poll=lambda: None)}
        b.start = Mock(side_effect=start)
        b.require_server = Mock()
        b.log_bounds = Mock()
        b.adb = Mock(side_effect=RuntimeError('Boston drift or maintenance hold'))
        with self.assertRaises(RuntimeError):
            b.execute()
        self.assertEqual(b.adb.call_count, 1)
        self.assertFalse(any(x.args[0] == 'runner' for x in b.start.call_args_list))

    def test_history_rechecked_after_all_leases_are_acquired(self):
        b = self.backend()
        locks = []
        for i in range(5):
            p = self.root / ('lease' + str(i))
            p.write_bytes(b'')
            st = p.stat()
            locks.append({'path': str(p), 'device': st.st_dev, 'inode': st.st_ino})
        b.p['locks'] = locks
        def history(parent):
            self.assertEqual(len(b.leases), 5)
            raise RuntimeError('a previous failed epoch appeared while acquiring leases')
        try:
            with patch.object(r, 'check_previous_runs', side_effect=history), self.assertRaises(RuntimeError):
                b.acquire_leases()
        finally:
            b.release()

    def test_final_native_census_is_after_long_preservation_rehash(self):
        b = self.backend()
        b.created = b.consumption_confirmed = True
        b.children['adb'] = {'proc': types.SimpleNamespace(pid=22, poll=lambda: 0), 'ticks': '123', 'identityConfirmed': True}
        events = []
        def census(initial=False):
            events.append('final-census' if initial else 'census')
            return {}
        b.native_census = Mock(side_effect=census)
        b.verify_preserved_inputs = Mock(side_effect=lambda: events.append('rehash'))
        b.cleanup()
        self.assertLess(events.index('rehash'), events.index('final-census'))

    def test_history_uses_effective_uid_lookup(self):
        with patch.object(r.os, 'geteuid', return_value=4321), patch.object(r.pwd, 'getpwuid', return_value=types.SimpleNamespace(pw_dir='/effective-home')) as lookup:
            self.assertEqual(self.real_state_parent(), Path('/effective-home/.local/state/settleora-native-qualification'))
        lookup.assert_called_once_with(4321)

    def test_bounded_pipe_records_exact_discarded_process_bytes(self):
        path = self.root / 'bounded.log'
        capture = r.PipeCapture(io.BytesIO(b'abcdefghij'), path.open('xb'), 4)
        report = capture.finish(2)
        self.assertEqual(path.read_bytes(), b'abcd')
        self.assertEqual(report['totalBytes'], 10)
        self.assertEqual(report['retainedBytes'], 4)
        self.assertTrue(report['processOutputTruncated'])
        self.assertTrue(report['complete'])

    def test_direct_flutter_root_replaces_unsafe_numeric_group_cancellation(self):
        b = self.backend()
        def start(role, *args, **kwargs):
            b.children[role] = {'proc': types.SimpleNamespace(poll=lambda: None)}
        b.start = Mock(side_effect=start)
        b.require_server = Mock()
        b.log_bounds = Mock()
        b.adb = Mock(side_effect=['1', '', '', '', '', '1', 'enabled', '0', '0'])
        b.wait = Mock(return_value=0)
        b.verify_runtime_inputs = Mock()
        with patch.object(r, 'verify_source_tree'):
            b.execute()
        argv = next(x.args[1] for x in b.start.call_args_list if x.args[0] == 'runner')
        self.assertEqual(argv[0], b.p['tools']['flutter']['path'])
        self.assertIn('integration_test/receipt_ocr_real_provider_test.dart', argv)
        self.assertNotIn(str(b.scratch / 'source/tools/ocr-models/bounded-process-capture.mjs'), argv)

    def test_zero_root_final_census_follows_immutable_rehash(self):
        b = self.backend()
        b.created = b.consumption_confirmed = True
        events = []
        b.verify_preserved_inputs = Mock(side_effect=lambda: events.append('rehash'))
        b.native_census = Mock(side_effect=lambda initial=False: events.append('census') or {})
        b.cleanup()
        self.assertEqual(events, ['rehash', 'census'])

    def test_runtime_model_drift_after_boot_blocks_runner(self):
        b = self.backend()
        with patch.object(r, 'verify_source_tree'), patch.object(r, 'sha', return_value='changed'):
            with self.assertRaisesRegex(RuntimeError, 'before runner launch'):
                b.verify_runtime_inputs()

    def test_hash_detects_path_replacement_during_read(self):
        path = self.root / 'hash-input'
        path.write_bytes(b'old')
        def replace():
            other = self.root / 'hash-new'
            other.write_bytes(b'new')
            other.replace(path)
        with self.assertRaisesRegex(RuntimeError, 'path/inode changed'):
            r.sha(path, replace)

    def test_capture_close_error_is_recorded(self):
        class BadClose(io.BytesIO):
            def close(self):
                super().close()
                raise OSError('synthetic close failure')
        capture = r.PipeCapture(BadClose(b'input'), (self.root / 'close.log').open('xb'), 16)
        self.assertEqual(capture.finish(2)['error'], 'OSError')

    def test_incomplete_capture_construction_cannot_finalize(self):
        b = self.backend()
        b.created = True
        b.life = Mock()
        b.children['adb'] = dict(captures=[], captureSetupComplete=False)
        with self.assertRaisesRegex(RuntimeError, 'capture incomplete'):
            b.retain(0, True)
        b.life.finish.assert_not_called()

    def test_zero_root_census_crossing_deadline_cannot_clean(self):
        b = self.backend()
        b.created = b.consumption_confirmed = True
        b.verify_preserved_inputs = Mock()
        def census(initial=False):
            b.deadline = time.monotonic() - 1
            return {}
        b.native_census = Mock(side_effect=census)
        with self.assertRaises(TimeoutError):
            b.cleanup()
        self.assertFalse((b.root / 'CLEANUP_OBSERVED.json').exists())

    def test_git_blob_path_replacement_with_same_size_mtime_is_rejected(self):
        source = self.root / 'extracted'
        source.mkdir()
        target = source / 'input.dart'
        target.write_bytes(b'old')
        original = target.stat()
        listing = ('100644 blob ' + hashlib.sha1(b'blob 3\0old').hexdigest() + '\tinput.dart\0').encode()
        calls = []
        def check():
            calls.append(1)
            if len(calls) == 2:
                other = self.root / 'replacement'
                other.write_bytes(b'new')
                os.utime(other, ns=(original.st_atime_ns, original.st_mtime_ns))
                other.replace(target)
        with patch.object(r.subprocess, 'check_output', return_value=listing), self.assertRaises(RuntimeError):
            r.verify_source_tree('/synthetic', 'a' * 40, source, check)

    def test_wait_records_finished_child_at_deadline_boundary(self):
        b = self.backend()
        b.deadline = time.monotonic() - 1
        b.children['runner'] = dict(proc=types.SimpleNamespace(poll=lambda: 17))
        self.assertEqual(b.wait('runner', 1), 17)

    def test_expired_boot_isolation_cannot_renew_test_deadline(self):
        b = self.backend()
        b.require_server = Mock()
        def start(role, *args, **kwargs):
            b.children[role] = {'proc': types.SimpleNamespace(poll=lambda: None)}
        b.start = Mock(side_effect=start)
        b.log_bounds = Mock()
        calls = []
        def adb(args):
            calls.append(args)
            if len(calls) == 9:
                b.deadline = time.monotonic() - 1
            return ['1', '', '', '', '', '1', 'enabled', '0', '0'][len(calls) - 1]
        b.adb = Mock(side_effect=adb)
        with self.assertRaises(TimeoutError):
            b.execute()
        self.assertFalse(any(x.args[0] == 'runner' for x in b.start.call_args_list))

    def test_java_drift_blocks_indirect_sdk_invocation(self):
        b = self.backend()
        b.verify_tool = types.MethodType(r.Backend.verify_tool, b)
        for role in ('avdmanager', 'flutter'):
            with patch.object(r, 'sha', side_effect=[b.p['tools'][role]['sha256'], 'changed']):
                with self.assertRaisesRegex(RuntimeError, 'Java'):
                    b.verify_tool([b.p['tools'][role]['path']])

    def test_expired_preparation_cannot_renew_boot_deadline(self):
        b = self.backend()
        b.require_server = Mock()
        def start(role, *args, **kwargs):
            b.children[role] = dict(proc=types.SimpleNamespace(poll=lambda: None))
            if role == 'emulator':
                b.deadline = time.monotonic() - 1
        b.start = Mock(side_effect=start)
        b.adb = Mock()
        with self.assertRaises(TimeoutError):
            b.execute()
        b.adb.assert_not_called()

    def test_run_never_turns_failed_test_into_native_acceptance(self):
        result = r.run(self.p, 'fixture', self.token, Fake)
        self.assertEqual(result, {'testExitCode': 17, 'cleanupVerified': True, 'nativeReady': False, 'automaticRetries': 0})


if __name__ == '__main__':
    unittest.main()
