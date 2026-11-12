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
        self.assertEqual(m.decode(encode({"value":"under-limit"}),m.FIRST_MAX),{"value":"under-limit"})
        with self.assertRaises(ValueError):m.decode(encode({"value":"x"*m.FIRST_MAX}),m.FIRST_MAX)
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

    def test_schema_counters_reject_boolean_aliases_and_catalog_roles_versions_must_match(self):
        bad=capture();bad["schemaVersion"]=True
        with self.assertRaises(ValueError):m.validate_capture(encode(bad),IDENTITY,"first",MODELS)
        catalog={"packs":[{"modelPackId":item,"modelVersion":"synthetic",
                  "role":"detection" if i==0 else "recognition"} for i,item in enumerate(MODELS)]}
        good=capture();m.validate_model_identity(good,catalog)
        for field,value in [("modelPackId",MODELS[0]),("modelVersion","substituted")]:
            bad=copy.deepcopy(good);bad["channel"]["blocks"][0][field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):m.validate_model_identity(bad,catalog)
        bad=copy.deepcopy(good);bad["channel"]["detectionModelPackId"]=MODELS[1]
        with self.assertRaises(ValueError):m.validate_model_identity(bad,catalog)

    def test_encrypted_outer_inventory_contains_only_header_and_ciphertext(self):
        header,cipher,context,recipient=self.sealed_fixture()
        outer=m.sealed_zip(header,cipher)
        with zipfile.ZipFile(io.BytesIO(outer)) as archive:
            self.assertEqual(set(archive.namelist()),{"envelope.json","ciphertext.bin"})
        actual_header,actual_cipher=m.read_sealed_zip(outer)
        self.assertEqual((actual_header,actual_cipher),(header,cipher))
        m.validate_sealed_members(actual_header,actual_cipher,context,recipient)
        with self.assertRaises(ValueError):m.read_sealed_zip(globals()["archive"]())
        self.assertNotIn(b"synthetic row",outer)

    def test_sealed_context_recipient_canonical_header_and_lengths_cannot_be_substituted(self):
        header,cipher,context,recipient=self.sealed_fixture()
        for field,value in [("schemaVersion",True),("recipientKeySha256","5"*64),
                            ("plaintextBytes",25),("context",{**context,"runId":"999"})]:
            bad=json.loads(header);bad[field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):
                m.validate_sealed_members(encode(bad),cipher,context,recipient)
        with self.assertRaises(ValueError):m.validate_sealed_members(header+b" ",cipher,context,recipient)
        with self.assertRaises(ValueError):m.validate_sealed_members(header,cipher[:-1],context,recipient)

    def test_seal_receipt_binds_encrypted_and_retained_raw_bytes_without_replacing_them(self):
        from unittest.mock import patch
        header,cipher,context,recipient=self.sealed_fixture()
        raw=archive()
        receipt=dict(schemaVersion=1,purpose=m.PURPOSE,context=context,recipientKeySha256=recipient,
          plaintextSha256=hashlib.sha256(raw).hexdigest(),plaintextBytes=len(raw),
          ciphertextSha256=hashlib.sha256(cipher).hexdigest(),ciphertextBytes=len(cipher),
          headerSha256=hashlib.sha256(header).hexdigest())
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary).resolve();root.chmod(0o700)
            for name,data in {"bundle.zip":raw,"envelope.json":header,"ciphertext.bin":cipher,
                              "sealed-receipt.json":encode(receipt)}.items():
                (root/name).write_bytes(data);(root/name).chmod(0o600)
            with patch.object(m,"expected_envelope_context",return_value=(context,recipient)):
                outer=m.sealed_operation(root,IDENTITY,"seal-container")
                self.assertEqual((root/"bundle.zip").read_bytes(),raw)
                (root/"bundle.zip").rename(root/"bundle-plain.zip")
                (root/"bundle-sealed.zip").rename(root/"bundle.zip")
                self.assertEqual(m.sealed_operation(root,IDENTITY,"verify-sealed"),outer)
                changed=bytearray(cipher);changed[0]^=1
                (root/"bundle.zip").write_bytes(m.sealed_zip(header,bytes(changed)))
                with self.assertRaises(ValueError):m.sealed_operation(root,IDENTITY,"verify-sealed")

    @staticmethod
    def sealed_fixture():
        import base64
        raw=archive();context=dict(head=IDENTITY["sourceHead"],tree=IDENTITY["sourceTree"],
          fingerprint=IDENTITY["sourceFingerprint"],runId=IDENTITY["runId"],runAttempt="1",
          name="settleora-arm64-ridge-private-123456-11111111-1111-4111-8111-111111111111")
        recipient="7"*64
        header=encode(dict(schemaVersion=1,purpose=m.PURPOSE,
          algorithm="X25519-HKDF-SHA256-AES-256-GCM",context=context,recipientKeySha256=recipient,
          ephemeralPublicKey=base64.b64encode(bytes.fromhex("302a300506032b656e032100")+b"x"*32).decode(),
          salt=base64.b64encode(b"s"*32).decode(),nonce=base64.b64encode(b"n"*12).decode(),
          plaintextBytes=len(raw),ciphertextBytes=len(raw)+16))
        return header,b"\x01"*(len(raw)+16),context,recipient

    def test_only_consistent_admitted_completed_warm_states_are_accepted(self):
        for calls,status in [(1,"failed"),(2,"not_admitted"),(1,"completed")]:
            with self.subTest(calls=calls,status=status),self.assertRaises(ValueError):
                m.validate_zip(archive(attempted=calls,warm_status=status),IDENTITY)

    def test_outer_zip_rejects_plaintext_in_prefix_trailer_entry_extra_or_comment(self):
        import struct
        header,cipher,context,recipient=self.sealed_fixture()
        valid=m.sealed_zip(header,cipher)
        invalid=[b"SYNTHETIC_PRIVATE"+valid,valid+b"SYNTHETIC_PRIVATE"]
        for field in ("extra","comment"):
            out=io.BytesIO()
            with zipfile.ZipFile(out,"w") as result:
                for name,data in [("envelope.json",header),("ciphertext.bin",cipher)]:
                    info=zipfile.ZipInfo(name);info.compress_type=zipfile.ZIP_STORED
                    info.external_attr=(stat.S_IFREG|0o600)<<16
                    if field=="extra":info.extra=struct.pack("<HH",0xCAFE,17)+b"SYNTHETIC_PRIVATE"
                    else:info.comment=b"SYNTHETIC_PRIVATE"
                    result.writestr(info,data)
            invalid.append(out.getvalue())
        for raw in invalid:
            with self.subTest(length=len(raw)),self.assertRaises(ValueError):m.read_sealed_zip(raw)
        self.assertEqual(m.read_sealed_zip(valid),(header,cipher))

    @staticmethod
    def replay_value():
        return dict(schemaVersion=1,purpose="arm64_native_channel_replay",nativeCalls=0,
          sourceHead=IDENTITY["sourceHead"],captureSha256="8"*64,captureRunId=IDENTITY["runId"],
          captureRunAttempt="1",replaySource=m.replay_source(IDENTITY),replayPackageConfigSha256="6"*64,inputSha256=m.INPUT_SHA,
          phase="first",status="extracted",fieldMismatches=[],reviewMatched=True,
          preview={"merchant":"SYNTHETIC_PRIVATE"})

    def test_replay_writer_establishes_private_mode_before_any_receipt_byte_write(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary).resolve();root.chmod(0o700);output=root/"replay-first.json"
            raw=encode(self.replay_value());original=os.fdopen;observed=[]
            def before_write(fd,*args,**kwargs):
                observed.append(stat.S_IMODE(os.fstat(fd).st_mode))
                self.assertEqual(os.fstat(fd).st_size,0)
                self.assertEqual(stat.S_IMODE(root.stat().st_mode),0o700)
                return original(fd,*args,**kwargs)
            previous=os.umask(0o022)
            try:
                with patch.object(m.os,"fdopen",side_effect=before_write):
                    m.write_replay_result(root,output,raw,IDENTITY)
            finally:os.umask(previous)
            self.assertEqual(observed,[0o600])
            self.assertEqual(stat.S_IMODE(output.stat().st_mode),0o600)
            self.assertEqual(output.read_bytes(),raw)

    def test_replay_writer_rejects_accessible_directory_existing_alias_and_wrong_source(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary).resolve();output=root/"replay-first.json";raw=encode(self.replay_value())
            root.chmod(0o755)
            with self.assertRaises(ValueError):m.write_replay_result(root,output,raw,IDENTITY)
            self.assertFalse(output.exists());root.chmod(0o700)
            unrelated=root/"unrelated";unrelated.write_bytes(b"SYNTHETIC_EXISTING");unrelated.chmod(0o600)
            output.symlink_to(unrelated)
            with self.assertRaises(OSError):m.write_replay_result(root,output,raw,IDENTITY)
            self.assertEqual(unrelated.read_bytes(),b"SYNTHETIC_EXISTING")
            output.unlink();output.write_bytes(b"SYNTHETIC_EXISTING");output.chmod(0o600)
            with self.assertRaises(OSError):m.write_replay_result(root,output,raw,IDENTITY)
            self.assertEqual(output.read_bytes(),b"SYNTHETIC_EXISTING")
            bad=self.replay_value();bad["replaySource"]["head"]="9"*40
            with self.assertRaises(ValueError):m.write_replay_result(root,root/"replay-warm.json",encode(bad),IDENTITY)

    def test_both_model_binding_paths_share_tracked_only_catalog_inventory(self):
        with tempfile.TemporaryDirectory() as temporary:
            repo=Path(temporary);relative="apps/mobile/assets/receipt_ocr_models/catalog.json"
            file=repo/relative;file.parent.mkdir(parents=True);file.write_bytes(b"synthetic")
            (file.parent/"untracked-private").write_bytes(b"SYNTHETIC_PRIVATE")
            rows=m.model_rows(repo,{relative:hashlib.sha256(file.read_bytes()).hexdigest()})
            self.assertEqual([row["path"] for row in rows],["receipt_ocr_models/catalog.json"])

if __name__=="__main__":unittest.main()
