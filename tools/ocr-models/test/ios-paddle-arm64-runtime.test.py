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

if __name__=="__main__":unittest.main()
