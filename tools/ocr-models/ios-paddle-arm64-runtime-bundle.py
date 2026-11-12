#!/usr/bin/env python3
"""Bounded private native-channel capture validation; never invokes OCR."""
import argparse
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import zipfile

PURPOSE = "arm64_ridge_runtime_v1"
FIRST_MAX = 128 * 1024
WARM_MAX = 64 * 1024
ZIP_MAX = 256 * 1024
INPUT_SHA = "261b6f1831617873bad6da93cefe54c050e70d10ec283dfdc6af9286602e10ec"
SOURCE_SHA = "ee60af99bb233c8d99b4678373b713d22e74127c44cf68e61db794f448e1356e"
HEAD = re.compile(r"[0-9a-f]{40}\Z")
SHA = re.compile(r"[0-9a-f]{64}\Z")

def require(value):
    if not value:
        raise ValueError("arm64_runtime_capture_rejected")

def exact(value, fields):
    require(type(value) is dict and set(value) == set(fields))

def finite(value, minimum=0, maximum=10**12):
    require(type(value) in (int, float) and math.isfinite(value) and minimum <= value <= maximum)

def decode(raw, maximum):
    require(type(raw) is bytes and 0 < len(raw) <= maximum)
    def reject_constant(_): raise ValueError("arm64_runtime_capture_rejected")
    def no_duplicate_pairs(pairs):
        value = {}
        for key, item in pairs:
            require(key not in value)
            value[key] = item
        return value
    return json.loads(raw.decode("utf-8"), parse_constant=reject_constant,
                      object_pairs_hook=no_duplicate_pairs)

def bounded_metadata(value, depth=0):
    require(depth <= 8)
    if type(value) is dict:
        require(len(value) <= 64)
        for key, item in value.items():
            require(type(key) is str and 0 < len(key) <= 64)
            bounded_metadata(item, depth + 1)
    elif type(value) is list:
        require(len(value) <= 256)
        for item in value: bounded_metadata(item, depth + 1)
    elif type(value) is str:
        require(len(value) <= 128)
    elif type(value) in (int, float):
        finite(value, -10**9, 10**9)
    else:
        require(value is None or type(value) is bool)

def validate_capture(raw, identity, phase, model_ids):
    value = decode(raw, FIRST_MAX if phase == "first" else WARM_MAX)
    exact(value, ["schemaVersion", "purpose", "phase", "sourceHead", "sourceTree",
          "sourceFingerprint", "runId", "runAttempt", "fixtureId", "inputSha256",
          "inputBytes", "width", "height", "fallbackCurrency", "modelManifestSha256",
          "modelPackIds", "providerCalls", "wallTimeMs", "engineInitializedThisCall",
          "processLifetimePeakRssBytes", "capturedAtMs", "channel"])
    require(type(value["schemaVersion"]) is int and value["schemaVersion"] == 1 and value["purpose"] == PURPOSE and value["phase"] == phase)
    for key in ("sourceHead", "sourceTree", "sourceFingerprint", "runId", "runAttempt"):
        require(value[key] == identity[key])
    require(value["fixtureId"] == "existing_13_ridge_restaurant_en_US" and
            value["inputSha256"] == INPUT_SHA and value["inputBytes"] == 263039 and
            value["width"] == 1086 and value["height"] == 1448 and value["fallbackCurrency"] == "USD")
    require(type(value["modelManifestSha256"]) is str and SHA.fullmatch(value["modelManifestSha256"]))
    require(value["modelPackIds"] == model_ids and len(set(model_ids)) == len(model_ids) == 8)
    require(type(value["providerCalls"]) is int and value["providerCalls"] == (1 if phase == "first" else 2))
    require(value["engineInitializedThisCall"] is (phase == "first"))
    finite(value["wallTimeMs"], 0, (10 if phase == "first" else 5) * 60 * 1000 + 2000)
    finite(value["capturedAtMs"], 1, 8_640_000_000_000_000)
    if value["processLifetimePeakRssBytes"] is not None:
        require(type(value["processLifetimePeakRssBytes"]) is int)
        finite(value["processLifetimePeakRssBytes"], 1, 128 * 1024**3)
    channel = value["channel"]
    exact(channel, ["blocks", "detectionModelPackId", "detectionModelVersion", "runtime",
          "coldLoadTimeMs", "detectionTimeMs", "recognitionTimeMs", "totalTimeMs",
          "numericRoutingObservation"])
    require(channel["runtime"] == "onnxruntime-objc:1.24.3:cpu" and
            channel["detectionModelPackId"] in model_ids and
            type(channel["detectionModelVersion"]) is str and len(channel["detectionModelVersion"]) <= 64)
    for key in ("coldLoadTimeMs", "detectionTimeMs", "recognitionTimeMs", "totalTimeMs"):
        require(type(channel[key]) is int)
        finite(channel[key], 0, 15 * 60 * 1000)
    bounded_metadata(channel["numericRoutingObservation"])
    require(type(channel["blocks"]) is list and len(channel["blocks"]) <= 256)
    seen = set()
    for block in channel["blocks"]:
        exact(block, ["text", "confidence", "modelPackId", "modelVersion",
                      "textDirection", "order", "row", "points"])
        require(type(block["text"]) is str and 0 < len(block["text"].strip()) <= 4096)
        finite(block["confidence"], 0, 1)
        require(block["modelPackId"] in model_ids and type(block["modelVersion"]) is str and
                len(block["modelVersion"]) <= 64 and block["textDirection"] in ("ltr", "rtl"))
        require(type(block["order"]) is int and 0 <= block["order"] < 256 and block["order"] not in seen)
        seen.add(block["order"])
        require(type(block["row"]) is int and 0 <= block["row"] < 256)
        require(type(block["points"]) is list and len(block["points"]) == 4)
        for point in block["points"]:
            exact(point, ["x", "y"])
            finite(point["x"], -32768, 32768); finite(point["y"], -32768, 32768)
    return value


def validate_model_identity(value, catalog):
    packs = {row["modelPackId"]: row for row in catalog["packs"]}
    channel = value["channel"]
    detection = packs.get(channel["detectionModelPackId"])
    require(detection is not None and detection["role"] == "detection" and
            channel["detectionModelVersion"] == detection["modelVersion"])
    for block in channel["blocks"]:
        pack = packs.get(block["modelPackId"])
        require(pack is not None and pack["role"] in ("recognition", "recognition_recovery") and
                block["modelVersion"] == pack["modelVersion"])

def read_private(root, name, maximum):
    require(root.is_absolute() and root.resolve() == root and
            root.stat().st_uid == os.getuid() and stat.S_IMODE(root.stat().st_mode) == 0o700)
    require(name in ("bundle.zip", "bundle-sealed.zip", "bundle-plain.zip", "slot.json", "envelope.json", "ciphertext.bin", "sealed-receipt.json", "manifest.json", "first.json", "warm.json"))
    fd = os.open(root / name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid() and
                before.st_nlink == 1 and stat.S_IMODE(before.st_mode) == 0o600 and
                0 < before.st_size <= maximum)
        with os.fdopen(fd, "rb", closefd=False) as source: raw = source.read(maximum + 1)
        after = os.fstat(fd)
        require(len(raw) == before.st_size and (before.st_dev, before.st_ino, before.st_size,
                before.st_mtime_ns, before.st_ctime_ns) == (after.st_dev, after.st_ino,
                after.st_size, after.st_mtime_ns, after.st_ctime_ns))
        return raw
    finally: os.close(fd)

def validate_zip(raw, identity):
    require(22 <= len(raw) <= ZIP_MAX and raw.startswith(b"PK\x03\x04"))
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries = archive.infolist()
        require(not archive.comment and 2 <= len(entries) <= 3)
        names = [entry.filename for entry in entries]
        require(set(names) in ({"manifest.json", "first.json"}, {"manifest.json", "first.json", "warm.json"})
                and len(names) == len(set(names)))
        members = {}
        for entry in entries:
            maximum = FIRST_MAX if entry.filename == "first.json" else WARM_MAX
            require(entry.orig_filename == entry.filename and entry.compress_type == zipfile.ZIP_STORED and
                    entry.file_size == entry.compress_size and 0 < entry.file_size <= maximum and
                    not entry.flag_bits & 1 and stat.S_IFMT(entry.external_attr >> 16) in (0, stat.S_IFREG))
            with archive.open(entry) as source: body = source.read(maximum + 1)
            require(len(body) == entry.file_size)
            members[entry.filename] = body
    manifest = decode(members["manifest.json"], WARM_MAX)
    exact(manifest, ["schemaVersion", "purpose", "sourceHead", "sourceTree", "sourceFingerprint",
          "runId", "runAttempt", "fixtureId", "inputSha256", "inputBytes", "sourceImageSha256",
          "modelManifestSha256", "modelPackIds", "providerCalls", "completedCalls",
          "warmStatus", "captureWindowStartedAtMs", "requestedExpiresAtMs", "captures"])
    require(type(manifest["schemaVersion"]) is int and manifest["schemaVersion"] == 1 and manifest["purpose"] == PURPOSE and
            manifest["sourceImageSha256"] == SOURCE_SHA and
            manifest["fixtureId"] == "existing_13_ridge_restaurant_en_US" and
            manifest["inputSha256"] == INPUT_SHA and manifest["inputBytes"] == 263039)
    for key in ("sourceHead", "sourceTree", "sourceFingerprint", "runId", "runAttempt"):
        require(manifest[key] == identity[key])
    require(type(manifest["providerCalls"]) is int and manifest["providerCalls"] in (1, 2))
    require(type(manifest["completedCalls"]) is int and manifest["completedCalls"] == len(entries) - 1 and
            manifest["warmStatus"] in ("not_admitted", "completed", "failed"))
    captures = manifest["captures"]
    phases = ["first", "warm"] if "warm.json" in members else ["first"]
    exact(captures, phases)
    require(manifest["completedCalls"] <= manifest["providerCalls"] and
            (("warm" in phases) == (manifest["warmStatus"] == "completed")))
    start = manifest["captureWindowStartedAtMs"]; expiry = manifest["requestedExpiresAtMs"]
    require(type(start) is int and type(expiry) is int and 0 < start < expiry <= start + 24 * 60 * 60 * 1000)
    for phase in phases:
        body = members[phase + ".json"]
        receipt = captures[phase];exact(receipt, ["bytes", "sha256"])
        require(receipt["bytes"] == len(body) and receipt["sha256"] == hashlib.sha256(body).hexdigest())
        value = validate_capture(body, identity, phase, manifest["modelPackIds"])
        require(value["modelManifestSha256"] == manifest["modelManifestSha256"] and
                start <= value["capturedAtMs"] < expiry)
    return manifest


def expected_envelope_context(root, identity):
    import base64
    slot = decode(read_private(root, "slot.json", 16 * 1024), 16 * 1024)
    for local, remote in [("sourceHead", "head"), ("sourceTree", "tree"),
                          ("sourceFingerprint", "fingerprint"), ("runId", "runId"),
                          ("runAttempt", "runAttempt")]:
        require(slot["identity"][remote] == identity[local])
    require(slot["purpose"] == PURPOSE)
    public = os.environ.get("ARM64_RUNTIME_RECIPIENT_KEY", "")
    try: key = base64.b64decode(public, validate=True)
    except Exception: raise ValueError("arm64_runtime_capture_rejected")
    require(len(key) == 44 and base64.b64encode(key).decode() == public and
            key[:12] == bytes.fromhex("302a300506032b656e032100"))
    context = dict(head=identity["sourceHead"], tree=identity["sourceTree"],
                   fingerprint=identity["sourceFingerprint"], runId=identity["runId"],
                   runAttempt="1", name=slot["name"])
    return context, hashlib.sha256(key).hexdigest()

def validate_sealed_members(header, ciphertext, expected_context, expected_recipient):
    import base64
    value = decode(header, 4096)
    exact(value, ["schemaVersion", "purpose", "algorithm", "context", "recipientKeySha256",
          "ephemeralPublicKey", "salt", "nonce", "plaintextBytes", "ciphertextBytes"])
    require(type(value["schemaVersion"]) is int and value["schemaVersion"] == 1 and
            value["purpose"] == PURPOSE and
            value["algorithm"] == "X25519-HKDF-SHA256-AES-256-GCM" and
            value["context"] == expected_context and value["recipientKeySha256"] == expected_recipient)
    require(json.dumps(value, sort_keys=True, separators=(",", ":")).encode() == header)
    for name, length in [("ephemeralPublicKey", 44), ("salt", 32), ("nonce", 12)]:
        require(type(value[name]) is str)
        try: decoded = base64.b64decode(value[name], validate=True)
        except Exception: raise ValueError("arm64_runtime_capture_rejected")
        require(len(decoded) == length and base64.b64encode(decoded).decode() == value[name])
        if name == "ephemeralPublicKey":
            require(decoded[:12] == bytes.fromhex("302a300506032b656e032100"))
    require(type(value["plaintextBytes"]) is int and 22 <= value["plaintextBytes"] <= ZIP_MAX and
            type(value["ciphertextBytes"]) is int and
            value["ciphertextBytes"] == value["plaintextBytes"] + 16 == len(ciphertext))
    return value

def sealed_zip(header, ciphertext):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        for name, data in [("envelope.json", header), ("ciphertext.bin", ciphertext)]:
            entry = zipfile.ZipInfo(name); entry.compress_type = zipfile.ZIP_STORED
            entry.external_attr = (stat.S_IFREG | 0o600) << 16
            archive.writestr(entry, data)
    raw = output.getvalue()
    require(len(raw) <= ZIP_MAX)
    return raw

def read_sealed_zip(raw):
    require(22 <= len(raw) <= ZIP_MAX)
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        infos = archive.infolist()
        require(len(infos) == 2 and {v.filename for v in infos} == {"envelope.json", "ciphertext.bin"} and
                not archive.comment)
        result = {}
        for info in infos:
            maximum = 4096 if info.filename == "envelope.json" else ZIP_MAX
            require(info.orig_filename == info.filename and info.compress_type == zipfile.ZIP_STORED and
                    info.file_size == info.compress_size and 0 < info.file_size <= maximum and
                    not info.flag_bits & 1 and stat.S_IFMT(info.external_attr >> 16) in (0, stat.S_IFREG))
            with archive.open(info) as stream: body = stream.read(maximum + 1)
            require(len(body) == info.file_size); result[info.filename] = body
    return result["envelope.json"], result["ciphertext.bin"]

def sealed_operation(root, identity, mode):
    context, recipient = expected_envelope_context(root, identity)
    if mode == "seal-container":
        header = read_private(root, "envelope.json", 4096)
        ciphertext = read_private(root, "ciphertext.bin", ZIP_MAX)
        raw = sealed_zip(header, ciphertext)
    else:
        raw = read_private(root, "bundle.zip", ZIP_MAX)
        header, ciphertext = read_sealed_zip(raw)
    value = validate_sealed_members(header, ciphertext, context, recipient)
    receipt = decode(read_private(root, "sealed-receipt.json", 4096), 4096)
    exact(receipt, ["schemaVersion", "purpose", "context", "recipientKeySha256",
          "plaintextSha256", "plaintextBytes", "ciphertextSha256", "ciphertextBytes", "headerSha256"])
    require(type(receipt["schemaVersion"]) is int and receipt["schemaVersion"] == 1 and receipt["purpose"] == PURPOSE and
            receipt["context"] == context and receipt["recipientKeySha256"] == recipient and
            receipt["headerSha256"] == hashlib.sha256(header).hexdigest() and
            receipt["ciphertextSha256"] == hashlib.sha256(ciphertext).hexdigest() and
            receipt["ciphertextBytes"] == len(ciphertext))
    plain_name = "bundle.zip" if mode == "seal-container" else "bundle-plain.zip"
    plain = read_private(root, plain_name, ZIP_MAX)
    require(len(plain) == receipt["plaintextBytes"] == value["plaintextBytes"] and
            hashlib.sha256(plain).hexdigest() == receipt["plaintextSha256"])
    validate_zip(plain, identity)
    if mode == "seal-container":
        target = root / "bundle-sealed.zip"
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            with os.fdopen(fd, "wb", closefd=False) as output:
                output.write(raw); output.flush(); os.fsync(fd)
        finally: os.close(fd)
    return raw

def main():
    class RedactedParser(argparse.ArgumentParser):
        def error(self, message):
            raise ValueError("arm64_runtime_capture_rejected")
    parser = RedactedParser()
    parser.add_argument("mode", choices=["verify", "seal-container", "verify-sealed"])
    for field in ("private-root", "source-head", "source-tree", "source-fingerprint", "run-id", "run-attempt"):
        parser.add_argument("--" + field, required=True)
    args = parser.parse_args()
    require(HEAD.fullmatch(args.source_head) and HEAD.fullmatch(args.source_tree) and
            SHA.fullmatch(args.source_fingerprint) and args.run_attempt == "1" and
            re.fullmatch(r"[1-9][0-9]{0,23}", args.run_id))
    repo = Path(__file__).resolve().parents[2]
    env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    env["GIT_NO_REPLACE_OBJECTS"] = "1"
    def git(*argv):
        return subprocess.check_output(["git", "--no-replace-objects", "-C", str(repo), *argv], env=env, timeout=15).decode().strip()
    require(Path(git("rev-parse", "--show-toplevel")).resolve() == repo)
    require(git("rev-parse", "HEAD") == args.source_head and git("rev-parse", "HEAD^{tree}") == args.source_tree and
            not git("status", "--porcelain", "--untracked-files=no"))
    # Bind every raw tracked blob/mode, including assume-unchanged paths.
    tracked = subprocess.check_output(["git", "--no-replace-objects", "-C", str(repo),
                                      "ls-tree", "-rz", "HEAD"], env=env, timeout=15)
    regular, links = set(), []
    for entry in tracked.split(b'\x00'):
        if not entry: continue
        metadata, name = entry.split(b'\t', 1)
        mode, kind, oid = metadata.decode().split()
        require(kind == "blob" and mode in ("100644", "100755", "120000"))
        relative = Path(name.decode())
        require(not relative.is_absolute() and ".." not in relative.parts)
        file = repo / relative; info = file.lstat()
        if mode == "120000":
            require(stat.S_ISLNK(info.st_mode))
            data = os.readlink(file).encode(); links.append(file)
        else:
            require(stat.S_ISREG(info.st_mode) and bool(info.st_mode & 0o111) == (mode == "100755"))
            data = file.read_bytes(); regular.add(file)
        require(hashlib.sha1(b"blob " + str(len(data)).encode() + b'\x00' + data).hexdigest() == oid)
    for file in links:
        require(file.resolve(strict=True) in regular)
    fingerprint = subprocess.check_output(["node", "--input-type=module", "-e",
        "import { reviewedSourceTreeFingerprint } from './tools/ocr-models/verify-mobile-package.mjs'; process.stdout.write(reviewedSourceTreeFingerprint(process.cwd(),process.argv[1]));",
        args.source_head], cwd=repo, env=env, timeout=20).decode()
    require(fingerprint == args.source_fingerprint)
    identity = dict(sourceHead=args.source_head, sourceTree=args.source_tree,
                    sourceFingerprint=args.source_fingerprint, runId=args.run_id, runAttempt=args.run_attempt)
    if args.mode != "verify":
        raw = sealed_operation(Path(args.private_root), identity, args.mode)
        print(json.dumps(dict(schemaVersion=1, purpose=PURPOSE, **identity,
              size=len(raw), sha256=hashlib.sha256(raw).hexdigest()), separators=(",", ":")))
        return
    raw = read_private(Path(args.private_root), "bundle.zip", ZIP_MAX)
    manifest = validate_zip(raw, identity)
    catalog = json.loads((repo / "apps/mobile/assets/receipt_ocr_models/catalog.json").read_bytes())
    require(manifest["modelPackIds"] == [row["modelPackId"] for row in catalog["packs"]])
    model_root = repo / "apps/mobile/assets/receipt_ocr_models"
    rows = [{"path": "receipt_ocr_models/" + str(file.relative_to(model_root)),
             "bytes": file.stat().st_size, "sha256": hashlib.sha256(file.read_bytes()).hexdigest()}
            for file in sorted(model_root.rglob("*")) if file.is_file()]
    model_bytes = json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()
    require(manifest["modelManifestSha256"] == hashlib.sha256(model_bytes).hexdigest())
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        for phase in manifest["captures"]:
            value = validate_capture(archive.read(phase + ".json"), identity, phase, manifest["modelPackIds"])
            validate_model_identity(value, catalog)
    print(json.dumps(dict(schemaVersion=1, purpose=PURPOSE, **identity, size=len(raw),
                          sha256=hashlib.sha256(raw).hexdigest()), separators=(",", ":")))

if __name__ == "__main__":
    try: main()
    except Exception:
        print("arm64_runtime_bundle_rejected", file=sys.stderr)
        sys.exit(98)
