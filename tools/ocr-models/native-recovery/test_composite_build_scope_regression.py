from pathlib import Path
import hashlib,json,subprocess,sys,tempfile,unittest
from unittest.mock import patch
import composite_build_scope_regression as fixture

class FixtureTimeoutTests(unittest.TestCase):
    def test_timeout_preserves_failed_case_and_stops_new_cases(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);launcher=root/'gradle';launcher.write_bytes(b'not executed')
            output=root/'evidence'
            args=['fixture','--gradle',str(launcher),'--gradle-sha256',hashlib.sha256(launcher.read_bytes()).hexdigest(),'--prior-helper',str(Path(fixture.__file__).with_name('gradle_dependency_closure.py')),'--output',str(output)]
            with patch.object(sys,'argv',args),patch.object(fixture,'run_owned',return_value=(None,True,[123]))as run:
                with self.assertRaisesRegex(RuntimeError,'did not finish and settle'):fixture.main()
            self.assertEqual(run.call_count,1)
            self.assertEqual(run.call_args.kwargs['timeout'],300)
            rows=json.loads((output/'RESULT.json').read_text())
            self.assertEqual(len(rows),1);self.assertEqual(rows[0]['case'],'prior')
            self.assertFalse(rows[0]['success']);self.assertIsNone(rows[0]['exitCode'])
            self.assertEqual(rows[0]['timeoutSeconds'],300)
            self.assertFalse(rows[0]['cleanupVerified']);self.assertEqual(rows[0]['remainingOwnedRoots'],[123])
            self.assertTrue((output/'prior/stdout.log').exists())
            self.assertFalse((output/'fixed').exists())

    def test_root_timeout_uses_one_original_pidfd_term_and_observes_descendants(self):
        from unittest.mock import Mock
        proc=Mock(pid=22);proc.wait.side_effect=[subprocess.TimeoutExpired('owned',300),0];proc.poll.side_effect=[None,0]
        with patch.object(fixture,'child_ids',side_effect=[[],[23],[23],[23],[23]]),patch.object(fixture.ctypes,'CDLL')as libc,patch.object(fixture.subprocess,'Popen',return_value=proc),patch.object(fixture.os,'pidfd_open',return_value=99),patch.object(fixture.signal,'pidfd_send_signal')as term,patch.object(fixture.os,'close')as close,patch.object(fixture.os,'waitpid',return_value=(0,0)),patch.object(fixture.time,'monotonic',side_effect=[0,11]):
            libc.return_value.prctl.return_value=0
            code,timed_out,remaining=fixture.run_owned(['synthetic'],{},None,None)
        self.assertEqual(code,0);self.assertTrue(timed_out);self.assertEqual(remaining,[23])
        term.assert_called_once_with(99,fixture.signal.SIGTERM,None,0);close.assert_called_once_with(99)

    def test_normal_root_is_not_enough_while_adopted_child_remains(self):
        from unittest.mock import Mock
        proc=Mock(pid=22);proc.wait.return_value=0;proc.poll.return_value=0
        with patch.object(fixture,'child_ids',side_effect=[[],[23],[23]]),patch.object(fixture.ctypes,'CDLL')as libc,patch.object(fixture.subprocess,'Popen',return_value=proc),patch.object(fixture.os,'pidfd_open',return_value=99),patch.object(fixture.signal,'pidfd_send_signal')as term,patch.object(fixture.os,'close'),patch.object(fixture.os,'waitpid',return_value=(0,0)),patch.object(fixture.time,'monotonic',side_effect=[0,11]):
            libc.return_value.prctl.return_value=0
            code,timed_out,remaining=fixture.run_owned(['synthetic'],{},None,None)
        self.assertEqual(code,0);self.assertFalse(timed_out);self.assertEqual(remaining,[23]);term.assert_not_called()

    def test_root_exit_between_poll_and_term_still_observes_descendants(self):
        from unittest.mock import Mock
        proc=Mock(pid=22);proc.wait.side_effect=[subprocess.TimeoutExpired('owned',300),0];proc.poll.side_effect=[None,0]
        with patch.object(fixture,'child_ids',side_effect=[[],[23],[23]]),patch.object(fixture.ctypes,'CDLL')as libc,patch.object(fixture.subprocess,'Popen',return_value=proc),patch.object(fixture.os,'pidfd_open',return_value=99),patch.object(fixture.signal,'pidfd_send_signal',side_effect=ProcessLookupError)as term,patch.object(fixture.os,'close'),patch.object(fixture.os,'waitpid',return_value=(0,0))as reap,patch.object(fixture.time,'monotonic',side_effect=[0,11]):
            libc.return_value.prctl.return_value=0
            code,timed_out,remaining=fixture.run_owned(['synthetic'],{},None,None)
        self.assertTrue(timed_out);self.assertEqual(remaining,[23]);self.assertEqual(code,0)
        term.assert_called_once();reap.assert_called_once_with(23,fixture.os.WNOHANG)

    def test_pidfd_setup_failure_still_observes_root_and_never_signals(self):
        from unittest.mock import Mock
        proc=Mock(pid=22);proc.poll.return_value=None
        with patch.object(fixture,'child_ids',side_effect=[[],[22],[22]]),patch.object(fixture.ctypes,'CDLL')as libc,patch.object(fixture.subprocess,'Popen',return_value=proc),patch.object(fixture.os,'pidfd_open',side_effect=PermissionError('synthetic hold denied')),patch.object(fixture.signal,'pidfd_send_signal')as term,patch.object(fixture.os,'close')as close,patch.object(fixture.time,'monotonic',side_effect=[0,11]):
            libc.return_value.prctl.return_value=0
            with self.assertRaises(fixture.OwnedFixtureFailure)as caught:fixture.run_owned(['synthetic'],{},None,None)
        self.assertEqual(caught.exception.remaining,[22]);self.assertFalse(caught.exception.cleanup_verified)
        term.assert_not_called();close.assert_not_called();proc.wait.assert_not_called()

    def test_post_launch_failure_writes_failed_result_without_later_case(self):
        with tempfile.TemporaryDirectory()as directory:
            root=Path(directory);launcher=root/'gradle';launcher.write_bytes(b'not executed');output=root/'evidence'
            args=['fixture','--gradle',str(launcher),'--gradle-sha256',hashlib.sha256(launcher.read_bytes()).hexdigest(),'--prior-helper',str(Path(fixture.__file__).with_name('gradle_dependency_closure.py')),'--output',str(output)]
            failure=fixture.OwnedFixtureFailure('synthetic setup failure');failure.remaining=[22];failure.cleanup_verified=False
            with patch.object(sys,'argv',args),patch.object(fixture,'run_owned',side_effect=failure):
                with self.assertRaises(fixture.OwnedFixtureFailure):fixture.main()
            rows=json.loads((output/'RESULT.json').read_text());self.assertFalse(rows[0]['success']);self.assertFalse(rows[0]['cleanupVerified']);self.assertEqual(rows[0]['remainingOwnedRoots'],[22]);self.assertFalse((output/'fixed').exists())
