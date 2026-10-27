"""Separate bounded official-registry cache seed, followed by offline APK compilation.

This never invokes the native acceptance entry point, creates an emulator, installs
an APK, or runs OCR cases. Exact plan admission remains an ordinary tool decision.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import stat
import time
import types
import zipfile

SEED_BUILD = '''plugins { id 'java' }
repositories {
    maven { url = uri('https://dl.google.com/dl/android/maven2/') }
    maven { url = uri('https://repo.maven.apache.org/maven2/') }
}
dependencies { runtimeOnly 'com.android.tools.build:gradle:8.11.0' }
tasks.register('resolveClosure') {
    doLast {
        def rows = configurations.runtimeClasspath.resolvedConfiguration.resolvedArtifacts.collect { a ->
            def digest = java.security.MessageDigest.getInstance('SHA-256')
            a.file.withInputStream { input ->
                byte[] buffer = new byte[1048576]
                int n
                while ((n = input.read(buffer)) != -1) { digest.update(buffer, 0, n) }
            }
            [coordinate: a.moduleVersion.id.toString(), fileName: a.file.name,
             bytes: a.file.length(), sha256: digest.digest().encodeHex().toString()]
        }.sort { a, b -> (a.coordinate + a.fileName) <=> (b.coordinate + b.fileName) }
        file('resolved-closure.json').text = groovy.json.JsonOutput.prettyPrint(groovy.json.JsonOutput.toJson(rows))
    }
}
'''
SEED_SETTINGS = "rootProject.name = 'settleora-agp-closure'\n"
MAX_FILES = 20000
MAX_ENTRIES = 60000
MAX_BYTES = 8 * 1024**3


def decode_plan(raw):
    def unique(items):
        result={}
        for key,value in items:
            if key in result:raise ValueError('duplicate staging JSON key')
            result[key]=value
        return result
    def invalid(value):raise ValueError('non-finite staging JSON number')
    def finite(value):
        try:result=float(value)
        except OverflowError:invalid(value)
        if not math.isfinite(result):invalid(value)
        return result
    return json.loads(raw,object_pairs_hook=unique,parse_constant=invalid,parse_float=finite)


def cache_files(root, check=lambda: None, exclude_coordination=True):
    """Stream directory entries so deadlines also apply inside one huge directory."""
    check()
    root = Path(root)
    if root.is_symlink() or not root.is_dir():
        raise RuntimeError('ordinary dependency cache root required')
    result, pending = [], [root]
    total, entries = 0, 0
    while pending:
        check()
        base = pending.pop()
        with os.scandir(base) as stream:
            for entry in stream:
                check()
                entries += 1
                if entries > MAX_ENTRIES:
                    raise RuntimeError('bounded dependency cache entries exceeded')
                metadata = entry.stat(follow_symlinks=False)
                path = base / entry.name
                if stat.S_ISDIR(metadata.st_mode):
                    pending.append(path)
                    continue
                if not stat.S_ISREG(metadata.st_mode):
                    raise RuntimeError('linked/special dependency cache member')
                if exclude_coordination and (entry.name.endswith('.lock') or entry.name == 'gc.properties'):
                    continue
                total += metadata.st_size
                result.append(path)
                if total > MAX_BYTES or len(result) > MAX_FILES:
                    raise RuntimeError('bounded dependency cache exceeded')
    return sorted(result)


def copy_cache(source, destination, check):
    source, destination = Path(source), Path(destination)
    paths = cache_files(source, check)
    destination.mkdir(parents=True, exist_ok=False)
    inventory = {}
    for path in paths:
        check()
        relative = str(path.relative_to(source))
        out = destination / relative
        out.parent.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256()
        with path.open('rb') as src, out.open('xb') as dst:
            while chunk := src.read(1024*1024):
                check()
                digest.update(chunk)
                dst.write(chunk)
        inventory[relative] = digest.hexdigest()
    return inventory



def verify_keeper_locks(pins, keeper_pid, lines):
    if type(pins) is not list or len(pins) != 5 or type(keeper_pid) is not int or keeper_pid <= 0 or len({p['path'] for p in pins}) != 5 or len({(p['device'],p['inode']) for p in pins}) != 5:
        raise RuntimeError('five distinct source lock pins required')
    for pin in pins:
        current=os.stat(pin['path'],follow_symlinks=False)
        if not stat.S_ISREG(current.st_mode) or current.st_uid!=os.geteuid() or (current.st_dev,current.st_ino)!=(pin['device'],pin['inode']):
            raise RuntimeError('source lock inode/ownership differs')
        needle=f'{os.major(pin["device"]):02x}:{os.minor(pin["device"]):02x}:{pin["inode"]}'
        if not any(len(row.split())>=6 and row.split()[1:6]==['FLOCK','ADVISORY','WRITE',str(keeper_pid),needle] for row in lines):
            raise RuntimeError('source keeper lock continuity lost')


def load_supervisor(path, wanted):
    with Path(path).open('rb') as stream:raw=stream.read(2*1024**2+1)
    if len(raw) > 2*1024**2 or hashlib.sha256(raw).hexdigest() != wanted:
        raise RuntimeError('exact supervisor source required')
    namespace = dict(__file__=str(path), __name__='closure_owned_backend')
    exec(compile(raw, str(path), 'exec'), namespace)
    return types.SimpleNamespace(**namespace)


def validate_plan(plan, plan_path):
    if set(plan) != {'schema','context','supervisorPath','supervisorSHA256','keeperPID','baseCache','distributionZIP','gradleScriptSHA256'} or plan['schema'] != 'settleora-gradle-closure-stage-v1':
        raise RuntimeError('exact closure staging plan required')
    p = plan['context']
    required={'head','repo','runRoot','jobID','jobsPath','bounds','network','locks','filePins','sourceArchive','tools','flutterRoot','sdkRoot','pubCache','models','pluginCache','bootID','pidNamespace','netNamespace','writeScope'}
    if type(p) is not dict or not required <= set(p) or type(p['models']) is not list or not p['models'] or type(p['filePins']) is not dict or not p['filePins']:
        raise RuntimeError('complete staging preservation context required')
    for pin in [p['sourceArchive']] + p['models'] + list(p['tools'].values()):
        if type(pin) is not dict or not {'path','sha256'} <= set(pin) or type(pin['path']) is not str or not Path(pin['path']).is_absolute() or '..' in Path(pin['path']).parts or type(pin['sha256']) is not str or not re.fullmatch('[0-9a-f]{64}',pin['sha256']):
            raise RuntimeError('canonical staging input bindings required')
    if set(p['tools']) != {'flutter','java','gradle'}:
        raise RuntimeError('complete fixed staging tool bindings required')
    for pin in p['models']:
        if set(pin) != {'path','relativePath','sha256'} or not pin['relativePath'] or Path(pin['relativePath']).is_absolute() or '..' in Path(pin['relativePath']).parts:
            raise RuntimeError('canonical staging model bindings required')
    if any(type(k) is not str or not Path(k).is_absolute() or '..' in Path(k).parts or type(v) is not str or not re.fullmatch('[0-9a-f]{64}',v) for k,v in p['filePins'].items()):
        raise RuntimeError('canonical staging preservation pins required')
    if Path(plan['supervisorPath']) != Path(__file__).with_name('current_android_qualification.py') or p['filePins'].get(plan['supervisorPath']) != plan['supervisorSHA256']:
        raise RuntimeError('pinned sibling supervisor required')
    root = Path(p['runRoot'])
    if root.parent != Path(plan_path).resolve().parent or not re.fullmatch(r'ocr-gradle-closure-[0-9a-f]{32}',root.name) or root.exists():
        raise RuntimeError('fresh sibling staging root required; never reuse a consumed root')
    if not re.fullmatch(r'atlas-ocr-gradle-closure-source-[0-9]{8}-v[1-9][0-9]*', p['jobID']) or type(plan['keeperPID']) is not int or plan['keeperPID'] <= 0:
        raise RuntimeError('registered source epoch and keeper required')
    if p['bounds'] != dict(prepare=2700,boot=600,test=1800,cleanup=90,retries=0):
        raise RuntimeError('fixed staging bounds and zero retry required')
    if Path(plan['distributionZIP']).name != 'gradle-8.14-all.zip' or Path(plan['baseCache']).name != 'modules-2':
        raise RuntimeError('fixed Gradle cache inputs required')
    if Path(p['tools']['gradle']['path']) != root/'warm/wrapper/dists/gradle-8.14-all/c2qonpi39x1mddn7hk5gh9iqj/gradle-8.14/bin/gradle' or p['tools']['gradle']['sha256'] != plan['gradleScriptSHA256']:
        raise RuntimeError('private original Gradle launcher required')
    return p


def execute(plan, plan_path, digest):
    p = validate_plan(plan, plan_path)
    m = load_supervisor(plan['supervisorPath'], plan['supervisorSHA256'])
    m.validate_network_policy(p['network'])
    if p['writeScope'] != [p['runRoot']] + m.write_scope(p)[2:]:
        raise RuntimeError('exact staging and shared SDK/cache write scope required')

    class StageBackend(m.Backend):
        def __init__(self,p,digest):
            super().__init__(p,digest)
            self.hard_deadline=self.deadline
            self.deadline=self.hard_deadline-180  # Reserve bounded cleanup/capture/verification.

        def capture_limit(self,role):return 32*1024*1024
        def command_output_limit(self,role):return 64*1024*1024

        def jobs(self):
            super().jobs()
            verify_keeper_locks(self.p['locks'],plan['keeperPID'],Path('/proc/locks').read_text().splitlines())

        def verify_preserved_inputs(self):
            self.verify_cache()
            for path,wanted in self.p['filePins'].items():
                if m.sha(path,self.clock)!=wanted:raise RuntimeError('staging protected source/history input changed')
            for role in ('java','flutter'):
                pin=self.p['tools'][role]
                if m.sha(pin['path'],self.clock)!=pin['sha256']:raise RuntimeError('existing staging tool drift before consumption')
            for pin in [self.p['sourceArchive']]+self.p['models']:
                if m.sha(pin['path'],self.clock)!=pin['sha256']:raise RuntimeError('staging archive/model input changed')

        def verify_tool(self, argv):
            pin=next((value for value in self.p['tools'].values() if value['path']==argv[0]),None)
            if pin is None or m.sha(pin['path'],self.clock)!=pin['sha256']:
                raise RuntimeError('adjacent staging executable identity changed')
            if m.sha(self.p['tools']['java']['path'],self.clock)!=self.p['tools']['java']['sha256']:
                raise RuntimeError('adjacent indirect Java identity changed')

    b = StageBackend(p, digest)
    b.jobs(); b.policy(); b.native_census(initial=True)
    m.check_signal_context(Path('/proc/thread-self/status').read_text())
    if p['tools']['gradle']['sha256']!=m.GRADLE_LAUNCHER_SHA256:
        raise RuntimeError('fixed Gradle launcher identity required before consumption')
    if p['filePins'].get(plan['distributionZIP']) != m.GRADLE_SHA256:
        raise RuntimeError('exact wrapper pin required before staging consumption')
    if m.sha(plan['distributionZIP'],b.clock) != m.GRADLE_SHA256:
        raise RuntimeError('tracked wrapper checksum must match distribution before staging')
    b.verify_preserved_inputs()
    m.check_write_space(p['writeScope'])
    if os.stat('/proc/self/ns/pid').st_ino != p['pidNamespace'] or os.stat('/proc/self/ns/net').st_ino != p['netNamespace'] or Path('/proc/sys/kernel/random/boot_id').read_text().strip() != p['bootID']:
        raise RuntimeError('staging observer changed')
    b.clock()
    head=m.subprocess.check_output(['git','-C',p['repo'],'rev-parse','HEAD'],text=True,timeout=min(5,max(.01,b.deadline-time.monotonic()))).strip()
    b.clock()
    worktree=m.subprocess.check_output(['git','--no-optional-locks','-C',p['repo'],'status','--porcelain'],text=True,timeout=min(5,max(.01,b.deadline-time.monotonic()))).strip()
    b.clock()
    if head!=p['head'] or worktree:
        raise RuntimeError('exact clean source required')
    b.root.mkdir(mode=0o700, exist_ok=False)
    b.created = True
    failure = None
    outcome = {}
    frozen_pins = {}
    try:
        b.consume_and_adopt()
        b.scratch.mkdir(mode=0o700)
        for name in ('home','tmp','source','android-user'):(b.scratch/name).mkdir(mode=0o700)
        source = b.scratch/'source'
        m.extract_source(p['sourceArchive']['path'],source,b.clock)
        m.verify_source_tree(p['repo'],p['head'],source,b.clock)
        properties = source/'apps/mobile/android/gradle/wrapper/gradle-wrapper.properties'
        warm = b.root/'warm';warm.mkdir(mode=0o700)
        distribution = m.install_gradle_distribution(Path(plan['distributionZIP']).parent,warm,properties,p['filePins'],b.clock)
        baseline = copy_cache(plan['baseCache'],warm/'caches/modules-2',b.clock)
        if any(p['filePins'].get(str(Path(plan['baseCache'])/rel))!=h for rel,h in baseline.items()):raise RuntimeError('copied dependency baseline differs from pinned inputs')
        b.record('BASE_CACHE_COPIED.json',baseline)
        resolver = b.root/'resolver';resolver.mkdir(mode=0o700)
        (resolver/'settings.gradle').write_text(SEED_SETTINGS)
        (resolver/'build.gradle').write_text(SEED_BUILD)
        (resolver/'gradle').mkdir()
        shutil.copyfile(source/'apps/mobile/android/gradle/verification-metadata.xml',resolver/'gradle/verification-metadata.xml')
        b.record('RESOLVER_RECIPE.json',dict(settingsSHA256=hashlib.sha256(SEED_SETTINGS.encode()).hexdigest(),buildSHA256=hashlib.sha256(SEED_BUILD.encode()).hexdigest(),repositories=['https://dl.google.com/dl/android/maven2/','https://repo.maven.apache.org/maven2/'],coordinate='com.android.tools.build:gradle:8.11.0',dependencyVerification='strict'))
        b.env = dict(PATH=':'.join([p['flutterRoot']+'/bin',str(Path(p['tools']['java']['path']).parent),'/usr/bin','/bin']),HOME=str(b.scratch/'home'),TMPDIR=str(b.scratch/'tmp'),JAVA_HOME=str(Path(p['tools']['java']['path']).parent.parent),JAVA_TOOL_OPTIONS='-Duser.home='+str(b.scratch/'home'),ANDROID_USER_HOME=str(b.scratch/'android-user'),GRADLE_USER_HOME=str(warm),GRADLE_OPTS='-Dorg.gradle.daemon=false -Dorg.gradle.workers.max=2 -Dorg.gradle.project.android.builder.sdkDownload=false',CI='true',LANG='C.UTF-8',LC_ALL='C.UTF-8')
        b.command([p['tools']['gradle']['path'],'--no-daemon','--max-workers=2','--console=plain','--info','--dependency-verification=strict','resolveClosure'],cwd=resolver,timeout=900)
        _, remaining = b.observe_owned_quiescence()
        if remaining:raise RuntimeError('seed children remain; do not freeze cache')
        closure = json.loads((resolver/'resolved-closure.json').read_text())
        if not closure or not any(x['coordinate']=='com.android.tools.build:gradle:8.11.0' for x in closure):raise RuntimeError('requested closure absent')
        frozen = b.root/'frozen-cache';frozen.mkdir(mode=0o700)
        inventory = copy_cache(warm/'caches/modules-2',frozen/'modules-2',b.clock)
        with Path(plan['distributionZIP']).open('rb')as src,(frozen/'gradle-8.14-all.zip').open('xb')as dst:
            total=0
            while chunk:=src.read(1024*1024):
                b.clock();total+=len(chunk)
                if total>512*1024**2:raise RuntimeError('bounded distribution copy exceeded')
                dst.write(chunk)
        frozen_pins = {str(frozen/'modules-2'/rel):h for rel,h in inventory.items()};frozen_pins[str(frozen/'gradle-8.14-all.zip')]=m.GRADLE_SHA256
        b.record('FROZEN_DEPENDENCY_INVENTORY.json',frozen_pins)
        probe = b.root/'probe';probe.mkdir(mode=0o700)
        m.install_gradle_distribution(frozen,probe,properties,frozen_pins,b.clock)
        m.install_gradle_offline_init(probe)
        b.env.update(GRADLE_USER_HOME=str(probe),GRADLE_RO_DEP_CACHE=str(frozen),ORG_GRADLE_PROJECT_settleoraReleaseEvidence='true',ORG_GRADLE_PROJECT_settleoraReleaseOffline='true',ANDROID_HOME=p['sdkRoot'],ANDROID_SDK_ROOT=p['sdkRoot'],PUB_CACHE=p['pubCache'],FLUTTER_SUPPRESS_ANALYTICS='true',FLUTTER_TOOL_ARGS='',BOT='true')
        b.command([p['tools']['flutter']['path'],'pub','get','--offline'],cwd=source/'apps/mobile',timeout=120)
        links=m.verified_plugin_links(source,p['pubCache'],p['filePins'],p['pluginCache'],b.clock)
        m.verify_source_tree(p['repo'],p['head'],source,b.clock,strict_inventory=False,generated_links=links)
        b.command([p['tools']['flutter']['path'],'build','apk','--debug','--no-pub','--target','integration_test/receipt_ocr_real_provider_test.dart'],cwd=source/'apps/mobile',timeout=1800)
        m.verify_source_tree(p['repo'],p['head'],source,b.clock,strict_inventory=False,generated_links=links)
        for path,wanted in frozen_pins.items():
            if m.sha(path,b.clock)!=wanted:raise RuntimeError('frozen cache changed during offline probe')
        apk=source/'apps/mobile/build/app/outputs/flutter-apk/app-debug.apk'
        m.filesystem_space(apk)
        outcome=dict(seedClosure=closure,frozenCache=str(frozen),frozenFiles=len(frozen_pins),offlineAPK=dict(path=str(apk),sha256=m.sha(apk,b.clock),bytes=apk.stat().st_size),distribution=distribution,offlineCompileVerified=True)
    except BaseException as error:
        failure=error;outcome['failure']=type(error).__name__+': '+str(error)
    finally:
        clean=False
        try:b.cleanup();clean=True
        except BaseException as error:
            outcome['cleanupFailure']=type(error).__name__+': '+str(error)
            failure=failure or error
        b.deadline=b.hard_deadline
        if frozen_pins:
            try:
                actual=cache_files(b.root/'frozen-cache',b.clock,exclude_coordination=False)
                if {str(q)for q in actual}!=set(frozen_pins):raise RuntimeError('frozen dependency inventory changed')
                for path,wanted in frozen_pins.items():
                    if m.sha(path,b.clock)!=wanted:raise RuntimeError('frozen dependency bytes changed')
            except BaseException as error:
                outcome['frozenValidationFailure']=type(error).__name__+': '+str(error);failure=failure or error
        capture={role+':'+str(i):c.finish(max(0,min(5,b.hard_deadline-time.monotonic())))for role,child in b.children.items()for i,c in enumerate(child['captures'])}
        complete=all(child.get('captureSetupComplete')for child in b.children.values()) and all(c['complete']and not c['error']and not c['processOutputTruncated']for c in capture.values())
        for stream in b.streams:
            try:stream.close()
            except OSError:complete=False
        if not complete:failure=failure or RuntimeError('incomplete staging capture')
        if time.monotonic()>=b.hard_deadline:failure=failure or TimeoutError('shared staging deadline expired before finalization')
        if failure is not None:outcome.setdefault('failure',type(failure).__name__+': '+str(failure))
        try:b.record('STAGE_TERMINAL.json',dict(outcome,success=failure is None,cleanupVerified=clean,capture=capture,children={role:dict(pid=c['proc'].pid,ticks=c['ticks'],returnCode=c['proc'].poll(),termAttempted=c['termAttempted'])for role,c in b.children.items()},nativeReady=False,OCRImageCasesExecuted=0,automaticRetries=0))
        finally:b.release()
    if failure:raise failure
    return outcome


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--execute-staging',action='store_true',required=True);ap.add_argument('--plan',required=True);ap.add_argument('--sha256',required=True);args=ap.parse_args()
    with Path(args.plan).open('rb') as stream:raw=stream.read(4*1024**2+1)
    if len(raw)>4*1024**2 or hashlib.sha256(raw).hexdigest()!=args.sha256:raise RuntimeError('exact fresh staging plan required')
    print(json.dumps(execute(decode_plan(raw),args.plan,args.sha256)))

if __name__=='__main__':main()
