#!/usr/bin/env python3
"""Offline runtime-controller contracts. No SDK, simulator or provider call."""
import hashlib,importlib.util,json,os
from pathlib import Path
import re,stat,subprocess,sys,tempfile,time,unittest

sys.dont_write_bytecode=True
MODULE=Path(__file__).resolve().parents[1]/"ios-paddle-arm64-runtime.py"
spec=importlib.util.spec_from_file_location("runtime_controller",MODULE)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def env():
    return dict(GITHUB_ACTIONS="true",GITHUB_EVENT_NAME="workflow_dispatch",
      GITHUB_REPOSITORY="tommytang213/Settleora",GITHUB_JOB="ios-paddle-arm64-runtime",
      GITHUB_RUN_ATTEMPT="1",SETTLEORA_ARM64_MODE=m.MODE,EXPECTED_HEAD="1"*40,
      GITHUB_SHA="1"*40,CAPTURE_WORKFLOW_SHA="1"*40,DIAGNOSTIC_SOURCE_HEAD="1"*40,
      DIAGNOSTIC_WORKFLOW_SHA="1"*40,DIAGNOSTIC_SOURCE_TREE="2"*40,
      DIAGNOSTIC_SOURCE_FINGERPRINT="3"*64,GITHUB_RUN_ID="123456")

class RuntimeControllerTests(unittest.TestCase):
    def test_context_requires_the_new_explicit_runtime_job_not_the_compile_or_x86_job(self):
        self.assertEqual(m.context(env())["runAttempt"],"1")
        for key,value in [("GITHUB_JOB","ios-paddle-arm64-compatibility"),
                          ("GITHUB_JOB","ios-ridge-phase-diagnostic"),
                          ("SETTLEORA_ARM64_MODE","paddle_arm64_compile_v1"),
                          ("GITHUB_RUN_ATTEMPT","2"),("GITHUB_SHA","4"*40)]:
            bad=env();bad[key]=value
            with self.subTest(key=key,value=value),self.assertRaises(ValueError):m.context(bad)

    def test_exclusive_capture_does_not_replace_and_rejects_hardlinked_input(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);file=root/"first.json"
            m.exclusive(file,b"synthetic",100)
            with self.assertRaises(FileExistsError):m.exclusive(file,b"replacement",100)
            self.assertEqual(file.read_bytes(),b"synthetic")
            os.link(file,root/"alias")
            with self.assertRaises(ValueError):m.read_owned(file,100)

    def test_owned_reader_rejects_fifo_without_blocking(self):
        with tempfile.TemporaryDirectory() as temporary:
            fifo=Path(temporary)/"fifo";os.mkfifo(fifo,0o600)
            with self.assertRaises(ValueError):m.read_owned(fifo,100)

    def test_complete_readiness_is_bound_to_phase_and_native_call_count(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            value=dict(schemaVersion=1,purpose=m.MODE,stage="first_ready",providerCalls=1,
                bytes=100,sha256="0"*64,wallTimeMs=10,blockCount=1)
            file=root/"first-ready.json";file.write_text(json.dumps(value));file.chmod(0o400)
            self.assertEqual(m.ready(root,"first",time.time()+1,os.getpid())[0]["providerCalls"],1)
            file.chmod(0o600);value["providerCalls"]=3;file.write_text(json.dumps(value));file.chmod(0o400)
            with self.assertRaises(ValueError):m.ready(root,"first",time.time()+1,os.getpid())

    def test_model_inventory_uses_only_verified_tracked_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            repo=Path(temporary);prefix="apps/mobile/assets/receipt_ocr_models/"
            file=repo/(prefix+"catalog.json");file.parent.mkdir(parents=True);file.write_bytes(b"synthetic")
            (file.parent/"untracked-private").write_bytes(b"SYNTHETIC_PRIVATE")
            tracked={prefix+"catalog.json":hashlib.sha256(file.read_bytes()).hexdigest()}
            self.assertEqual([r["path"] for r in m.model_rows(repo,tracked)],["receipt_ocr_models/catalog.json"])
            file.write_bytes(b"changed")
            with self.assertRaises(ValueError):m.model_rows(repo,tracked)

    def test_private_input_checkout_retains_original_local_dependency_layout_and_hashes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);repo=root/"repo";repo.mkdir();owned=root/"owned";owned.mkdir()
            files={"apps/mobile/pubspec.yaml":b"synthetic pubspec",
              "apps/mobile/pubspec.lock":b"synthetic lock",
              "apps/mobile/lib/normalizer.dart":b"synthetic normalizer",
              "apps/mobile/l10n/app_en.arb":b"synthetic localization",
              "packages/client-dart/pubspec.yaml":b"synthetic client",
              "packages/google_mlkit_commons/pubspec.yaml":b"synthetic local override",
              "apps/mobile/assets/unrelated":b"not a runtime dependency"}
            tracked={}
            for name,data in files.items():
                file=repo/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(data)
                tracked[name]=hashlib.sha256(data).hexdigest()
            project=m.input_project(repo,owned,tracked)
            self.assertEqual((project/"pubspec.lock").read_bytes(),files["apps/mobile/pubspec.lock"])
            for name in ("client-dart","google_mlkit_commons"):
                self.assertTrue((project/"../../packages"/name/"pubspec.yaml").is_file())
            self.assertTrue((project/"l10n/app_en.arb").is_file())
            self.assertFalse((project/"assets/unrelated").exists())
            with self.assertRaises(FileExistsError):m.input_project(repo,owned,tracked)

    def test_strict_json_rejects_duplicate_counters_and_nonfinite_values(self):
        for raw in [b'{"providerCalls":1,"providerCalls":3}',b'{"value":NaN}']:
            with self.assertRaises(ValueError):m.strict_json(raw)

    def test_all_dispatch_modes_select_exactly_their_intended_jobs(self):
        workflow=(MODULE.parents[2]/".github/workflows/mobile-ocr-native-acceptance.yml").read_text()
        chunks=re.split(r"(?m)^  ([A-Za-z_][A-Za-z0-9_-]*):[ \t]*$",workflow.split("\njobs:\n",1)[1])
        jobs=dict(zip(chunks[1::2],chunks[2::2]))
        legacy={"android-native-acceptance","ios-native-acceptance"}
        for event in ("pull_request","workflow_dispatch"):
            for mode in ("full101","paddle_arm64_compile_v1",m.MODE,"unknown"):
                actual=set()
                for name,body in jobs.items():
                    expr=re.search(r"(?m)^    if: (.+)$",body).group(1)
                    expr=expr.removeprefix("$"+"{{").removesuffix("}}").strip()
                    expr=expr.replace("github.event_name",repr(event)).replace("inputs.mode",repr(mode))
                    remaining=re.sub(r"'[A-Za-z0-9_-]*'","",expr)
                    self.assertRegex(remaining,r"^[ ()=&|]*$")
                    expr=expr.replace("&&"," and ").replace("||"," or ")
                    if eval(expr,{"__builtins__":{}}):actual.add(name)
                expected=legacy if event=="pull_request" or mode=="full101" else (
                    {"ios-paddle-arm64-compatibility"} if mode=="paddle_arm64_compile_v1" else
                    {"ios-paddle-arm64-runtime"} if mode==m.MODE else set())
                self.assertEqual(actual,expected,(event,mode))

    def test_unapproved_cli_never_uses_sdk_or_exposes_context(self):
        r=subprocess.run([sys.executable,"-I","-B",str(MODULE)],
          env={"PATH":os.environ["PATH"],"EXPECTED_HEAD":"SYNTHETIC_PRIVATE"},
          stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
        self.assertEqual(r.returncode,98);self.assertEqual(r.stdout,b"")
        self.assertEqual(r.stderr,b"arm64_runtime_failed\n")


    @staticmethod
    def capture_fixture(root, bad_warm=False):
        fixture=m.load_module(MODULE.parent/"test/ios-paddle-arm64-runtime-bundle.test.py","runtime_synthetic_bundle")
        documents=root/"Documents";documents.mkdir()
        private=root/"private";private.mkdir(mode=0o700)
        first=fixture.capture();warm=fixture.capture("warm")
        if bad_warm:warm["inputSha256"]="0"*64
        raw=fixture.encode(first);warm_raw=fixture.encode(warm)
        for phase,data in [("first",raw),("warm",warm_raw)]:
            (documents/(phase+".json")).write_bytes(data);(documents/(phase+".json")).chmod(0o400)
        def receipt(data,calls):
            return dict(schemaVersion=1,purpose=m.MODE,providerCalls=calls,bytes=len(data),
                sha256=hashlib.sha256(data).hexdigest(),wallTimeMs=100,blockCount=1)
        return fixture,documents,private,first,raw,warm_raw,receipt

    def test_warm_timeout_readiness_capture_or_read_failure_stops_before_source_and_bundle(self):
        from unittest.mock import patch
        for failure in ("timeout","readiness","capture","read","stop"):
            with self.subTest(failure=failure),tempfile.TemporaryDirectory() as temporary:
                fixture,documents,private,first,raw,warm_raw,receipt=self.capture_fixture(
                    Path(temporary),bad_warm=failure=="capture")
                def readiness(documents,phase,*_):
                    if phase=="first":return receipt(raw,1),None
                    if failure=="readiness":raise ValueError("SYNTHETIC_PRIVATE")
                    if failure in ("timeout","stop"):return None,{"failureCode":"native_call_deadline"}
                    return receipt(warm_raw,2),None
                original_read=m.read_owned;original_bundle=m.build_private_bundle
                def read(path,*args):
                    if failure=="read" and path.name=="warm.json":raise OSError("SYNTHETIC_PRIVATE")
                    return original_read(path,*args)
                events=[]
                def stop():
                    events.append("terminate-owned")
                    if failure=="stop":raise OSError("SYNTHETIC_PRIVATE")
                def verify():events.append("verify-source")
                def bundle(*args):
                    events.append("bundle");return original_bundle(*args)
                report=dict(providerCallsAdmitted=1,completedCalls=0)
                with patch.object(m,"ready",side_effect=readiness),patch.object(m,"read_owned",side_effect=read),patch.object(m,"build_private_bundle",side_effect=bundle):
                    _,status=m.capture_and_package(documents,private,fixture.IDENTITY,fixture.MODELS,
                        first["modelManifestSha256"],fixture.m,time.time()+1000,os.getpid(),report,
                        lambda _:1000,stop,verify,dict(startedAt=fixture.START,
                        expiresAt=fixture.START+24*60*60*1000))
                self.assertEqual(events,["terminate-owned","verify-source","bundle"])
                self.assertEqual(status,"failed")
                if failure=="stop":self.assertTrue(report["ownedRuntimeStopUnconfirmed"])
                manifest=fixture.m.validate_zip((private/"bundle.zip").read_bytes(),fixture.IDENTITY)
                self.assertEqual((manifest["providerCalls"],manifest["completedCalls"],manifest["warmStatus"]),(2,1,"failed"))
                self.assertEqual((private/"first.json").read_bytes(),raw)

    def test_recovered_first_never_bypasses_source_failure_or_creates_ready_bundle(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as temporary:
            fixture,documents,private,first,raw,warm_raw,receipt=self.capture_fixture(Path(temporary))
            events=[]
            def ready(documents,phase,*_):
                return (receipt(raw,1),None) if phase=="first" else (None,{"failureCode":"native_call_deadline"})
            def verify():
                events.append("verify-source");raise ValueError("source_changed")
            with patch.object(m,"ready",side_effect=ready),patch.object(m,"build_private_bundle") as bundle:
                with self.assertRaises(ValueError):
                    m.capture_and_package(documents,private,fixture.IDENTITY,fixture.MODELS,
                        first["modelManifestSha256"],fixture.m,time.time()+1000,os.getpid(),
                        dict(providerCallsAdmitted=1,completedCalls=0),lambda _:1000,
                        lambda:events.append("terminate-owned"),verify,
                        dict(startedAt=fixture.START,expiresAt=fixture.START+24*60*60*1000))
                bundle.assert_not_called()
            self.assertEqual(events,["terminate-owned","verify-source"])
            self.assertEqual((private/"first.json").read_bytes(),raw)
            self.assertFalse((private/"bundle.zip").exists())

    def test_completed_or_unadmitted_warm_has_no_failure_stop_and_keeps_supported_state(self):
        from unittest.mock import patch
        for remaining in (1000,100):
            with self.subTest(remaining=remaining),tempfile.TemporaryDirectory() as temporary:
                fixture,documents,private,first,raw,warm_raw,receipt=self.capture_fixture(Path(temporary))
                def ready(documents,phase,*_):
                    return (receipt(raw,1),None) if phase=="first" else (receipt(warm_raw,2),None)
                events=[];report=dict(providerCallsAdmitted=1,completedCalls=0)
                with patch.object(m,"ready",side_effect=ready):
                    _,status=m.capture_and_package(documents,private,fixture.IDENTITY,fixture.MODELS,
                        first["modelManifestSha256"],fixture.m,time.time()+1000,os.getpid(),report,
                        lambda _:remaining,lambda:events.append("unexpected-stop"),
                        lambda:events.append("verify-source"),
                        dict(startedAt=fixture.START,expiresAt=fixture.START+24*60*60*1000))
                self.assertEqual(events,["verify-source"])
                self.assertEqual(status,"completed" if remaining==1000 else "not_admitted")
                manifest=fixture.m.validate_zip((private/"bundle.zip").read_bytes(),fixture.IDENTITY)
                self.assertEqual(manifest["completedCalls"],2 if remaining==1000 else 1)

    def test_total_stop_deadline_kills_and_reaps_real_sigterm_ignoring_child(self):
        from unittest.mock import patch
        import signal
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);marker=root/"ready"
            code="import pathlib,signal,sys,time\nsignal.signal(signal.SIGTERM,signal.SIG_IGN)\npathlib.Path(sys.argv[1]).write_text('ready')\ntime.sleep(60)\n"
            process=subprocess.Popen([sys.executable,"-I","-B","-c",code,str(marker)],
                stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                start_new_session=True)
            try:
                startup=time.monotonic()+10
                while not marker.exists() and time.monotonic()<startup:
                    self.assertIsNone(process.poll());time.sleep(.01)
                self.assertTrue(marker.exists(),"synthetic stubborn worker did not start")
                started=time.monotonic()
                with patch.object(m.subprocess,"Popen",return_value=process) as launch:
                    result=m.bounded_owned_stop(["SYNTHETIC_OWNED_STOP"],root,time.time()+2)
                elapsed=time.monotonic()-started
                self.assertLess(elapsed,2.5)  # Detect the prior ~12–22sec teardown, allow scheduler noise.
                self.assertTrue(launch.call_args.kwargs["start_new_session"])
                self.assertEqual(process.returncode,-signal.SIGKILL)
                self.assertEqual(result["exitCode"],-signal.SIGKILL)
                self.assertFalse(result["confirmed"]);self.assertTrue(result["timedOut"])
                self.assertTrue(result["reaped"]);self.assertLessEqual(result["totalBudgetSeconds"],2)
            finally:
                if process.poll() is None:
                    os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=2)

    def test_total_stop_normal_completion_confirms_without_kill(self):
        with tempfile.TemporaryDirectory() as temporary:
            result=m.bounded_owned_stop([sys.executable,"-I","-B","-c","pass"],
                Path(temporary),time.time()+2)
            self.assertTrue(result["confirmed"]);self.assertFalse(result["timedOut"])
            self.assertEqual(result["exitCode"],0);self.assertTrue(result["reaped"])

    def test_total_stop_expired_global_budget_never_spawns_a_child(self):
        from unittest.mock import patch
        with patch.object(m.subprocess,"Popen") as launch:
            result=m.bounded_owned_stop(["SYNTHETIC"],Path.cwd(),time.time()-1)
            launch.assert_not_called()
        self.assertFalse(result["confirmed"]);self.assertTrue(result["timedOut"])
        self.assertEqual(result["totalBudgetSeconds"],0)

class PhaseAndAdmissionTests(unittest.TestCase):
    def test_query_success_keeps_global_deadline_and_captures_stderr_without_reporting_payload(self):
        from unittest.mock import Mock,patch
        report={};remaining=Mock(return_value=3.5);environment={"SYNTHETIC_PRIVATE":"hidden"}
        with patch.object(m.subprocess,"check_output",return_value="SYNTHETIC_PRIVATE") as command:
            output=m.bounded_query(["SYNTHETIC_PRIVATE"],"owned-container",report,123,remaining,environment)
        self.assertEqual(output,"SYNTHETIC_PRIVATE");remaining.assert_called_once_with(123)
        self.assertEqual(command.call_args.kwargs["timeout"],3.5)
        self.assertIs(command.call_args.kwargs["env"],environment)
        self.assertEqual(command.call_args.kwargs["stderr"],subprocess.PIPE)
        self.assertTrue(command.call_args.kwargs["text"])
        self.assertEqual(report["queries"]["owned-container"]["exitCode"],0)
        self.assertEqual(report["lastOperation"],"owned-container")
        self.assertNotIn("SYNTHETIC_PRIVATE",json.dumps(report))

    def test_query_timeout_exit_oserror_and_unexpected_failures_are_redacted_and_not_retried(self):
        from unittest.mock import Mock,patch
        cases=[(subprocess.TimeoutExpired(["SYNTHETIC_PRIVATE"],20,output="SYNTHETIC_PRIVATE",stderr="SYNTHETIC_PRIVATE"),"timeout",None),
          (subprocess.CalledProcessError(71,["SYNTHETIC_PRIVATE"],output="SYNTHETIC_PRIVATE",stderr="SYNTHETIC_PRIVATE"),"command_exit",71),
          (OSError(5,"SYNTHETIC_PRIVATE"),"os_error",None),
          (RuntimeError("SYNTHETIC_PRIVATE"),"unexpected",None)]
        for error,kind,exit_code in cases:
            with self.subTest(kind=kind):
                report={};remaining=Mock(return_value=200)
                with patch.object(m.subprocess,"check_output",side_effect=error) as command:
                    with self.assertRaises(type(error)):
                        m.bounded_query(["SYNTHETIC_PRIVATE"],"owned-launch",report,123,remaining,{})
                    command.assert_called_once();self.assertEqual(command.call_args.kwargs["timeout"],20)
                row=report["queries"]["owned-launch"]
                self.assertEqual(row["failure"]["kind"],kind)
                self.assertEqual(row["failure"].get("exitCode"),exit_code)
                self.assertEqual(row["failure"]["phase"],"owned-launch")
                self.assertNotIn("SYNTHETIC_PRIVATE",json.dumps(report))

    def test_query_expired_budget_or_unknown_phase_never_starts_command(self):
        from unittest.mock import Mock,patch
        with patch.object(m.subprocess,"check_output") as command:
            for phase,remaining in [("owned-launch",Mock(side_effect=ValueError("SYNTHETIC_PRIVATE"))),
                                    ("SYNTHETIC_PRIVATE",Mock(return_value=20))]:
                report={}
                with self.assertRaises(ValueError):m.bounded_query(["SYNTHETIC_PRIVATE"],phase,report,123,remaining,{})
                self.assertNotIn("SYNTHETIC_PRIVATE",json.dumps(report))
            command.assert_not_called()

    def test_launch_reserves_attempt_and_first_call_before_effect_and_rejects_duplicate(self):
        report=dict(appLaunchAttempts=0,appLaunchesAdmitted=0,appLaunches=0,providerCallsAdmitted=0,completedCalls=0)
        calls=[]
        def query(argv,label):
            calls.append((argv,label))
            self.assertEqual((report["appLaunchAttempts"],report["appLaunchesAdmitted"],report["providerCallsAdmitted"]),(1,1,1))
            raise subprocess.TimeoutExpired("SYNTHETIC_PRIVATE",20)
        with self.assertRaises(subprocess.TimeoutExpired):m.launch_owned(query,"OWNED_DEVICE",report)
        self.assertEqual((report["appLaunches"],report["completedCalls"]),(0,0))
        self.assertEqual(report["launchResponse"],"unconfirmed")
        with self.assertRaises(ValueError):m.launch_owned(query,"OWNED_DEVICE",report)
        self.assertEqual(len(calls),1);self.assertNotIn("SYNTHETIC_PRIVATE",json.dumps(report))

    def test_launch_response_is_confirmed_only_for_exact_positive_bundle_pid(self):
        from unittest.mock import Mock
        for output in [m.BUNDLE_ID+": 0",m.BUNDLE_ID+": -1","other.bundle: 123",m.BUNDLE_ID+": 123 trailing","SYNTHETIC_PRIVATE"]:
            with self.subTest(output=output):
                report={};query=Mock(return_value=output)
                with self.assertRaises(ValueError):m.launch_owned(query,"OWNED_DEVICE",report)
                self.assertEqual((report["appLaunchAttempts"],report["providerCallsAdmitted"],report.get("appLaunches",0)),(1,1,0))
                self.assertEqual(report["launchResponse"],"unconfirmed")
                self.assertEqual(report["lastOperation"],"owned-launch-validate")
                self.assertNotIn("SYNTHETIC_PRIVATE",json.dumps(report))
        report={};query=Mock(return_value=m.BUNDLE_ID+": 123\n")
        self.assertEqual(m.launch_owned(query,"OWNED_DEVICE",report),123)
        self.assertEqual((report["appLaunchesAdmitted"],report["appLaunches"],report["providerCallsAdmitted"]),(1,1,1))
        self.assertEqual(report["launchResponse"],"confirmed")
        query.assert_called_once_with(["xcrun","simctl","launch","OWNED_DEVICE",m.BUNDLE_ID],"owned-launch")

    def test_container_rejections_report_only_boolean_predicates_and_keep_all_guards(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary).resolve();device="11111111-2222-3333-4444-555555555555"
            valid=root/"Devices"/device/"data/Containers/Data/Application/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
            valid.mkdir(parents=True);report={}
            self.assertEqual(m.validate_owned_container(valid,device,report),valid)
            self.assertTrue(all(report["containerChecks"].values()))
            link=valid.parent/"bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";link.symlink_to(valid,target_is_directory=True)
            for path,owned in [(Path("relative/SYNTHETIC_PRIVATE"),device),(valid,"other-device"),
                               (valid.parent/"invalid-uuid",device),(link,device),
                               (valid.parent/"cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee",device)]:
                report={}
                with self.subTest(path=path,owned=owned),self.assertRaises(ValueError):m.validate_owned_container(path,owned,report)
                self.assertEqual(set(report["containerChecks"]),{"absolute","ownedDeviceSuffix","uuid","canonical","directory"})
                self.assertTrue(all(type(v) is bool for v in report["containerChecks"].values()))
                self.assertFalse(all(report["containerChecks"].values()))
                self.assertNotIn("SYNTHETIC_PRIVATE",json.dumps(report));self.assertNotIn(str(root),json.dumps(report))

    def test_structurally_foreign_container_is_rejected_before_filesystem_inspection(self):
        from unittest.mock import patch
        with patch.object(Path,"resolve") as resolve,patch.object(Path,"is_dir") as is_dir:
            with self.assertRaises(ValueError):m.validate_owned_container(Path("/SYNTHETIC_PRIVATE"),"OWNED_DEVICE",{})
            resolve.assert_not_called();is_dir.assert_not_called()

    def test_primary_failure_keeps_pre_cleanup_phase_without_exception_text(self):
        report={};m.set_phase(report,"owned-container-validate")
        m.record_primary_failure(report,ValueError("SYNTHETIC_PRIVATE"))
        m.set_phase(report,"owned-delete")
        m.record_primary_failure(report,OSError("SYNTHETIC_PRIVATE"))
        self.assertEqual(report["primaryFailure"],dict(phase="owned-container-validate",kind="validation"))
        self.assertEqual(report["lastOperation"],"owned-delete")
        self.assertNotIn("SYNTHETIC_PRIVATE",json.dumps(report))

if __name__=="__main__":unittest.main()
