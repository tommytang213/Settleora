"""SDK-free cache-copy and closed-recipe regression coverage."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('closure',Path(__file__).with_name('gradle_dependency_closure.py'));c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)

class ClosureTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(dir=Path(__file__).parent);self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)

    def test_cache_copy_excludes_locks_gc_and_never_reuses_destination(self):
        source=self.root/'modules-2';source.mkdir();(source/'payload.jar').write_bytes(b'payload');(source/'modules-2.lock').write_bytes(b'lock');(source/'gc.properties').write_bytes(b'gc')
        target=self.root/'copy';inventory=c.copy_cache(source,target,lambda:None)
        self.assertEqual(list(inventory),['payload.jar']);self.assertEqual((target/'payload.jar').read_bytes(),b'payload');self.assertFalse((target/'modules-2.lock').exists())
        with self.assertRaises(FileExistsError):c.copy_cache(source,target,lambda:None)
        self.assertEqual((source/'modules-2.lock').read_bytes(),b'lock')

    def test_linked_cache_is_rejected_before_creating_output(self):
        source=self.root/'modules-2';source.mkdir();(source/'escape').symlink_to(self.root)
        with self.assertRaisesRegex(RuntimeError,'linked/special'):c.copy_cache(source,self.root/'copy',lambda:None)
        self.assertFalse((self.root/'copy').exists())

    def test_copy_is_bounded_and_deadline_checked(self):
        source=self.root/'modules-2';source.mkdir();(source/'payload').write_bytes(b'12')
        with patch.object(c,'MAX_BYTES',1),self.assertRaisesRegex(RuntimeError,'bounded'):c.copy_cache(source,self.root/'copy',lambda:None)
        def timeout():raise TimeoutError('fixed deadline')
        with self.assertRaises(TimeoutError):c.copy_cache(source,self.root/'copy',timeout)

    def test_empty_directory_inventory_is_bounded_and_checks_deadline(self):
        source=self.root/'modules-2';source.mkdir();(source/'empty1').mkdir();(source/'empty2').mkdir()
        with patch.object(c,'MAX_ENTRIES',1),self.assertRaisesRegex(RuntimeError,'entries exceeded'):c.cache_files(source)
        def expired():raise TimeoutError('global deadline')
        with self.assertRaises(TimeoutError):c.cache_files(source,expired)

    def test_directory_scan_does_not_materialize_entries_before_deadline(self):
        import stat,types
        from unittest.mock import MagicMock
        source=self.root/'modules-2';source.mkdir();seen=[];checks=[]
        def entries():
            for i in range(4):
                seen.append(i)
                if i>2:raise AssertionError('directory was materialized before the deadline callback')
                yield types.SimpleNamespace(name=str(i),stat=lambda **kw:types.SimpleNamespace(st_mode=stat.S_IFREG|0o644,st_size=1),is_dir=lambda **kw:False,is_symlink=lambda:False)
        stream=MagicMock();stream.__enter__.return_value=entries()
        def check():
            checks.append(1)
            if len(checks)>3:raise TimeoutError('deadline inside directory')
        with patch.object(c.os,'scandir',return_value=stream),self.assertRaises(TimeoutError):c.cache_files(source,check)
        self.assertLessEqual(len(seen),2)

    def test_seed_recipe_is_fixed_official_and_does_not_apply_agp(self):
        self.assertIn("runtimeOnly 'com.android.tools.build:gradle:8.11.0'",c.SEED_BUILD)
        self.assertIn('https://dl.google.com/dl/android/maven2/',c.SEED_BUILD);self.assertIn('https://repo.maven.apache.org/maven2/',c.SEED_BUILD)
        self.assertNotIn("id 'com.android",c.SEED_BUILD);self.assertNotIn('mavenLocal',c.SEED_BUILD)


class StageAdapterTests(unittest.TestCase):
    def exercise(self,fail_compile=False,missing_zip_pin=False,bad_tool=False):
        import hashlib,json,os,types,subprocess,time
        from unittest.mock import Mock
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent)as tmp:
            root=Path(tmp);base=root/'modules-2';base.mkdir();payload=base/'existing.jar';payload.write_bytes(b'original')
            archive=root/'gradle-8.14-all.zip';archive.write_bytes(b'synthetic zip')
            (root/'source.tar').write_bytes(b'source fixture')
            stage=root/'stage';calls=[];actions=[]
            for name in ('java','flutter'):(root/name).write_bytes(name.encode())
            def sha(path,*args):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
            p=dict(runRoot=str(stage),bounds=dict(prepare=2700),jobsPath=str(root/'jobs'),locks=[],filePins={str(payload):sha(payload),str(archive):sha(archive)},sourceArchive=dict(path=str(root/'source.tar'),sha256=hashlib.sha256(b'source fixture').hexdigest()),repo=str(root/'repo'),head='a'*40,writeScope=[str(stage)],pidNamespace=os.stat('/proc/self/ns/pid').st_ino,netNamespace=os.stat('/proc/self/ns/net').st_ino,bootID=Path('/proc/sys/kernel/random/boot_id').read_text().strip(),flutterRoot=str(root/'flutter'),sdkRoot=str(root/'sdk'),pubCache=str(root/'pub'),network={},models=[dict(path=str(payload),relativePath='assets/model',sha256=sha(payload))],pluginCache={},tools={name:dict(path=str(root/name),sha256='b'*64)for name in ('java','flutter','gradle')})
            for name in ('java','flutter'):p['tools'][name]['sha256']=sha(root/name)
            if bad_tool:p['tools']['flutter']['sha256']='0'*64
            class FakeBackend:
                def __init__(self,p,digest):self.p=p;self.root=Path(p['runRoot']);self.scratch=self.root/'scratch';self.children={};self.streams=[];self.deadline=time.monotonic()+2700
                def jobs(self):pass
                def policy(self):pass
                def native_census(self,initial=False):return{}
                def clock(self):pass
                def record(self,name,value):(self.root/name).write_text(json.dumps(value))
                def consume_and_adopt(self):actions.append('consume')
                def command(self,args,cwd=None,timeout=None):
                    self.assert_capture_limits=(self.capture_limit('cmd_seed'),self.command_output_limit('cmd_seed'))
                    if self.assert_capture_limits!=(32*1024*1024,64*1024*1024):raise AssertionError('staging output budget')
                    calls.append((list(args),dict(self.env)))
                    if len(calls)==1:(Path(cwd)/'resolved-closure.json').write_text(json.dumps([dict(coordinate='com.android.tools.build:gradle:8.11.0')]))
                    if len(calls)==3:
                        if fail_compile:raise RuntimeError('offline compile missing dependency')
                        apk=Path(cwd)/'build/app/outputs/flutter-apk/app-debug.apk';apk.parent.mkdir(parents=True);apk.write_bytes(b'synthetic APK')
                def observe_owned_quiescence(self):return{},[]
                def verify_cache(self):pass
                def verify_image_bundle(self):raise AssertionError('unused native image must not be a staging prerequisite')
                def cleanup(self):actions.append('cleanup');self.verify_preserved_inputs()
                def release(self):actions.append('release')
            def extract(path,dest,check):
                gradle=dest/'apps/mobile/android/gradle/wrapper';gradle.mkdir(parents=True);(gradle/'gradle-wrapper.properties').write_text('synthetic')
                (gradle.parent/'verification-metadata.xml').write_text('<synthetic/>')
            m=types.SimpleNamespace(validate_network_policy=Mock(),write_scope=Mock(return_value=['historical-parent',str(stage)]),Backend=FakeBackend,sha=sha,GRADLE_SHA256=sha(archive),GRADLE_LAUNCHER_SHA256='b'*64,check_signal_context=Mock(),check_write_space=Mock(),subprocess=types.SimpleNamespace(check_output=Mock(side_effect=[p['head'],''])),extract_source=extract,verify_source_tree=Mock(),install_gradle_distribution=Mock(return_value=dict(verified=True)),install_gradle_offline_init=Mock(),verified_plugin_links=Mock(return_value={}),filesystem_space=Mock())
            plan=dict(context=p,supervisorPath='synthetic',supervisorSHA256='b'*64,keeperPID=1,baseCache=str(base),distributionZIP=str(archive))
            if missing_zip_pin:p['filePins'].pop(str(archive))
            with patch.object(c,'validate_plan',return_value=p),patch.object(c,'load_supervisor',return_value=m),patch.object(c,'verify_keeper_locks'),patch.object(subprocess,'Popen')as spawn:
                if bad_tool:
                    with self.assertRaisesRegex(RuntimeError,'tool drift before consumption'):c.execute(plan,root/'plan.json','c'*64)
                    self.assertEqual(actions,[]);self.assertFalse(stage.exists());spawn.assert_not_called();return
                if missing_zip_pin:
                    with self.assertRaisesRegex(RuntimeError,'wrapper pin'):c.execute(plan,root/'plan.json','c'*64)
                    self.assertEqual(actions,[]);self.assertFalse(stage.exists());return
                if fail_compile:
                    with self.assertRaisesRegex(RuntimeError,'offline compile'):c.execute(plan,root/'plan.json','c'*64)
                else:c.execute(plan,root/'plan.json','c'*64)
                spawn.assert_not_called()
            self.assertEqual(actions,['consume','cleanup','release']);self.assertEqual(len(calls),3);m.validate_network_policy.assert_called_once_with(p['network']);self.assertTrue(all(0<x.kwargs['timeout']<=5 for x in m.subprocess.check_output.call_args_list))
            self.assertIn('--dependency-verification=strict',calls[0][0]);self.assertNotIn('ORG_GRADLE_PROJECT_settleoraReleaseOffline',calls[0][1])
            self.assertEqual(calls[1][0][1:],['pub','get','--offline']);self.assertEqual(calls[2][0][1:4],['build','apk','--debug']);self.assertEqual(calls[2][1]['ORG_GRADLE_PROJECT_settleoraReleaseOffline'],'true');self.assertIn('-Dorg.gradle.project.android.builder.sdkDownload=false',calls[2][1]['GRADLE_OPTS']);self.assertEqual(calls[2][1]['ANDROID_USER_HOME'],str(stage/'scratch/android-user'));self.assertEqual(calls[0][1]['JAVA_TOOL_OPTIONS'],'-Duser.home='+str(stage/'scratch/home'));self.assertEqual(calls[2][1]['JAVA_TOOL_OPTIONS'],calls[0][1]['JAVA_TOOL_OPTIONS'])
            terminal=json.loads((stage/'STAGE_TERMINAL.json').read_text());self.assertEqual(terminal['success'],not fail_compile);self.assertTrue(terminal['cleanupVerified']);self.assertEqual(terminal['OCRImageCasesExecuted'],0);self.assertFalse(terminal['nativeReady']);self.assertEqual(payload.read_bytes(),b'original')

    def test_tool_drift_rejects_before_root_or_consumption(self):self.exercise(bad_tool=True)
    def test_missing_wrapper_pin_rejects_before_root_or_consumption(self):self.exercise(missing_zip_pin=True)
    def test_online_seed_is_separate_from_fresh_offline_compile(self):self.exercise()
    def test_failed_offline_compile_still_settles_owned_children_without_retry(self):self.exercise(fail_compile=True)

class KeeperTests(unittest.TestCase):
    def test_five_real_distinct_owned_flocks_required(self):
        import os
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent)as tmp:
            pins=[];lines=[]
            for i in range(5):
                p=Path(tmp)/str(i);p.touch();st=p.stat();pins.append(dict(path=str(p),device=st.st_dev,inode=st.st_ino));lines.append(f'{i}: FLOCK ADVISORY WRITE 42 {os.major(st.st_dev):02x}:{os.minor(st.st_dev):02x}:{st.st_ino} 0 EOF')
            c.verify_keeper_locks(pins,42,lines)
            for bad in ([],pins[:4],[pins[0]]*5):
                with self.assertRaisesRegex(RuntimeError,'five distinct'):c.verify_keeper_locks(bad,42,lines)
            with self.assertRaisesRegex(RuntimeError,'continuity'):c.verify_keeper_locks(pins,43,lines)
            with self.assertRaisesRegex(RuntimeError,'continuity'):c.verify_keeper_locks(pins,42,[x.replace('WRITE','READ')for x in lines])
            original=Path(pins[0]['path']);original.unlink();original.symlink_to(pins[1]['path'])
            with self.assertRaisesRegex(RuntimeError,'inode/ownership'):c.verify_keeper_locks(pins,42,lines)

class StagingContextTests(unittest.TestCase):
    def test_empty_or_non_boston_network_rejected_before_staging_root(self):
        import json,hashlib,types
        source=Path(__file__).with_name('current_android_qualification.py');supervisor=c.load_supervisor(source,hashlib.sha256(source.read_bytes()).hexdigest())
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent)as tmp:
            root=Path(tmp)/'unused';plan=dict(context=dict(runRoot=str(root),network={}),supervisorPath=str(source),supervisorSHA256=hashlib.sha256(source.read_bytes()).hexdigest())
            with patch.object(c,'validate_plan',return_value=plan['context']),self.assertRaises(ValueError):c.execute(plan,Path(tmp)/'plan.json','a'*64)
            self.assertFalse(root.exists())
            network=dict(Status='Connected',Server='fixture-dedicated',Country='United States',City='Tokyo',IP='192.0.2.1',Protocol='NordLynx',**{'Kill Switch':'enabled','Firewall':'enabled'})
            with self.assertRaises(ValueError):supervisor.validate_network_policy(network)

    def test_missing_shared_write_scope_rejected_before_staging_root(self):
        import types
        from unittest.mock import Mock
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent)as tmp:
            root=Path(tmp)/'unused';p=dict(runRoot=str(root),network={},writeScope=[]);plan=dict(context=p,supervisorPath='synthetic',supervisorSHA256='a'*64)
            m=types.SimpleNamespace(validate_network_policy=Mock(),write_scope=Mock(return_value=['historical-parent',str(root),'/synthetic/shared-cache']))
            with patch.object(c,'validate_plan',return_value=p),patch.object(c,'load_supervisor',return_value=m),self.assertRaisesRegex(RuntimeError,'write scope'):c.execute(plan,Path(tmp)/'plan.json','a'*64)
            self.assertFalse(root.exists())

class PlanPreservationTests(unittest.TestCase):
    def test_models_required_but_unused_native_image_fields_not_required(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent)as tmp:
            base=Path(tmp).resolve();root=base/('ocr-gradle-closure-'+'0'*32);source=Path(c.__file__).with_name('current_android_qualification.py');sdk=base/'sdk';flutter=base/'flutter'
            tools={n:dict(path=str(base/n),sha256='a'*64)for n in ['flutter','java']};tools['gradle']=dict(path=str(root/'warm/wrapper/dists/gradle-8.14-all/c2qonpi39x1mddn7hk5gh9iqj/gradle-8.14/bin/gradle'),sha256='b'*64)
            p=dict(head='a'*40,repo=str(base/'repo'),runRoot=str(root),jobID='atlas-ocr-gradle-closure-source-20261027-v5',jobsPath=str(base/'jobs.json'),bounds=dict(prepare=2700,boot=600,test=1800,cleanup=90,retries=0),network={},locks=[],filePins={str(source):'c'*64},sourceArchive=dict(path=str(base/'source.tar'),sha256='d'*64),tools=tools,flutterRoot=str(flutter),sdkRoot=str(sdk),pubCache=str(base/'pub'),models=[dict(path=str(base/'model'),relativePath='assets/model',sha256='e'*64)],pluginCache={},bootID='fixture',pidNamespace=1,netNamespace=2,writeScope=[])
            plan=dict(schema='settleora-gradle-closure-stage-v1',context=p,supervisorPath=str(source),supervisorSHA256='c'*64,keeperPID=42,baseCache=str(base/'modules-2'),distributionZIP=str(base/'gradle-8.14-all.zip'),gradleScriptSHA256='b'*64)
            self.assertIs(c.validate_plan(plan,base/'plan.json'),p);self.assertNotIn('image',p);self.assertNotIn('imageFiles',p)
            original=p.pop('models')
            with self.assertRaisesRegex(RuntimeError,'preservation context'):c.validate_plan(plan,base/'plan.json')
            p['models']=[]
            with self.assertRaisesRegex(RuntimeError,'preservation context'):c.validate_plan(plan,base/'plan.json')
            p['models']=original;p['models'][0]['sha256']='bad'
            with self.assertRaisesRegex(RuntimeError,'input bindings'):c.validate_plan(plan,base/'plan.json')


class StrictPlanJSONTests(unittest.TestCase):
    def test_duplicate_and_nonfinite_values_rejected(self):
        for raw in ('{"a":1,"a":2}','{"nested":{"a":1,"a":2}}','{"a":NaN}','{"a":Infinity}','{"a":-Infinity}','{"a":1e999}'):
            with self.subTest(raw=raw),self.assertRaises(ValueError):c.decode_plan(raw)
    def test_finite_plan_decodes(self):
        self.assertEqual(c.decode_plan('{"a":1.5,"b":[1,true,null]}'),dict(a=1.5,b=[1,True,None]))

if __name__ == '__main__':
    unittest.main()
