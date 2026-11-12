#!/usr/bin/env python3
"""Synthetic private-capture contract tests. No OCR, SDK or service call."""
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
import zipfile
import hashlib

sys.dont_write_bytecode = True
MODULE = Path(__file__).resolve().parents[1] / "ios-paddle-arm64-runtime-bundle.py"
spec = importlib.util.spec_from_file_location("runtime_bundle", MODULE)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
IDENTITY = dict(sourceHead="1"*40, sourceTree="2"*40, sourceFingerprint="3"*64,
                runId="123456", runAttempt="1")
MODELS = ["synthetic" + str(i) for i in range(8)]
START = 1794509000000

def capture(phase="first"):
    return dict(schemaVersion=1, purpose=m.PURPOSE, phase=phase, **IDENTITY,
        fixtureId="existing_13_ridge_restaurant_en_US", inputSha256=m.INPUT_SHA,
        inputBytes=263039, width=1086, height=1448, fallbackCurrency="USD",
        modelManifestSha256="4"*64, modelPackIds=MODELS,
        providerCalls=1 if phase=="first" else 2, wallTimeMs=100,
        engineInitializedThisCall=phase=="first", processLifetimePeakRssBytes=1024,
        capturedAtMs=START+1000,
        channel=dict(blocks=[dict(text="synthetic row", confidence=.8,
            modelPackId=MODELS[1], modelVersion="synthetic", textDirection="ltr", order=0, row=0,
            points=[dict(x=0,y=0),dict(x=10,y=0),dict(x=10,y=10),dict(x=0,y=10)])],
            detectionModelPackId=MODELS[0], detectionModelVersion="synthetic",
            runtime="onnxruntime-objc:1.24.3:cpu", coldLoadTimeMs=1, detectionTimeMs=2,
            recognitionTimeMs=3,totalTimeMs=5,numericRoutingObservation=dict(state="unavailable")))

def encode(value):return json.dumps(value,sort_keys=True,separators=(",",":")).encode()

def archive(first=None,warm=None,attempted=1,warm_status="not_admitted",extras=None,compression=zipfile.ZIP_STORED):
    first=first or capture();bodies={"first.json":encode(first)}
    if warm is not None:bodies["warm.json"]=encode(warm)
    manifest=dict(schemaVersion=1,purpose=m.PURPOSE,**IDENTITY,
        fixtureId="existing_13_ridge_restaurant_en_US",inputSha256=m.INPUT_SHA,inputBytes=263039,
        sourceImageSha256=m.SOURCE_SHA,modelManifestSha256="4"*64,modelPackIds=MODELS,
        providerCalls=attempted,completedCalls=len(bodies),warmStatus=warm_status,
        captureWindowStartedAtMs=START,requestedExpiresAtMs=START+24*60*60*1000,
        captures={name[:-5]:dict(bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
                  for name,data in bodies.items()})
    bodies["manifest.json"]=encode(manifest)
    bodies.update(extras or {})
    output=io.BytesIO()
    with zipfile.ZipFile(output,"w") as result:
        for name,data in bodies.items():
            info=zipfile.ZipInfo(name);info.compress_type=compression
            info.external_attr=(stat.S_IFREG|0o600)<<16
            result.writestr(info,data)
    return output.getvalue()

class RuntimeBundleTests(unittest.TestCase):
    def test_valid_first_and_same_image_warm_have_distinct_correct_call_counts(self):
        self.assertEqual(m.validate_zip(archive(),IDENTITY)["completedCalls"],1)
        self.assertEqual(m.validate_zip(archive(warm=capture("warm"),attempted=2,warm_status="completed"),IDENTITY)["completedCalls"],2)

    def test_failed_warm_preserves_the_first_without_inventing_a_completed_call(self):
        value=m.validate_zip(archive(attempted=2,warm_status="failed"),IDENTITY)
        self.assertEqual((value["providerCalls"],value["completedCalls"]),(2,1))

    def test_changed_input_source_run_and_actual_call_count_reject(self):
        for field,value in [("inputSha256","0"*64),("sourceHead","5"*40),
                            ("runId","7"),("providerCalls",3),("engineInitializedThisCall",False)]:
            bad=capture();bad[field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):
                m.validate_zip(archive(first=bad),IDENTITY)

    def test_geometry_confidence_and_nonfinite_numbers_reject(self):
        for field,value in [("confidence",1.1),("row",True),("order",-1),("text"," "*8)]:
            bad=capture();bad["channel"]["blocks"][0][field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):
                m.validate_zip(archive(first=bad),IDENTITY)
        bad=capture();bad["channel"]["blocks"][0]["points"][0]["x"]=float("nan")
        with self.assertRaises(ValueError):m.validate_zip(archive(first=bad),IDENTITY)

    def test_unknown_members_compression_and_duplicate_json_keys_reject(self):
        for raw in [archive(extras={"../escape":b"x"}),archive(compression=zipfile.ZIP_DEFLATED)]:
            with self.assertRaises(ValueError):m.validate_zip(raw,IDENTITY)
        with self.assertRaises(ValueError):m.decode(b'{"x":1,"x":2}',100)

    def test_payload_caps_do_not_truncate_and_unknown_channel_fields_reject(self):
        with self.assertRaises(ValueError):m.decode(b"x"*(m.FIRST_MAX+1),m.FIRST_MAX)
        bad=capture();bad["channel"]["unexpected"]="synthetic"
        with self.assertRaises(ValueError):m.validate_zip(archive(first=bad),IDENTITY)

    def test_private_reader_does_not_follow_symlink_or_hardlink(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary).resolve();root.chmod(0o700)
            target=root/"unrelated";target.write_bytes(b"synthetic");target.chmod(0o600)
            alias=root/"bundle.zip";alias.symlink_to(target)
            with self.assertRaises((OSError,ValueError)):m.read_private(root,"bundle.zip",1024)
            alias.unlink();os.link(target,alias)
            with self.assertRaises(ValueError):m.read_private(root,"bundle.zip",1024)
            self.assertEqual(target.read_bytes(),b"synthetic")

    def test_current_epoch_milliseconds_and_lifetime_rss_are_not_misclassified(self):
        value=m.validate_capture(encode(capture()),IDENTITY,"first",MODELS)
        self.assertGreater(value["capturedAtMs"],10**12)
        bad=capture();bad["processLifetimePeakRssBytes"]=True
        with self.assertRaises(ValueError):m.validate_capture(encode(bad),IDENTITY,"first",MODELS)

    def test_unapproved_cli_masks_supplied_private_context(self):
        r=subprocess.run([sys.executable,"-I","-B",str(MODULE),"SYNTHETIC_PRIVATE"],
                         stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
        self.assertEqual(r.returncode,98);self.assertEqual(r.stdout,b"")
        self.assertEqual(r.stderr,b"arm64_runtime_bundle_rejected\n")

if __name__=="__main__":unittest.main()
