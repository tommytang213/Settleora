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

    def test_real_wait_clips_compile_ceiling_to_remaining_shared_work_window(self):
        import hashlib,types
        from unittest.mock import Mock
        path=Path(__file__).with_name('current_android_qualification.py');supervisor=c.load_supervisor(path,hashlib.sha256(path.read_bytes()).hexdigest());backend=object.__new__(supervisor.Backend);backend.deadline=2520;backend.children={'cmd_3':dict(proc=Mock(poll=Mock(return_value=None)))}
        # Pub+seed may consume1020; the1800s compile ceiling then has1500 left.
        with patch.object(supervisor.time,'monotonic',side_effect=[1020,1020,2520]),self.assertRaises(TimeoutError):backend.wait('cmd_3',1800)

    def test_project_recipe_resolves_actual_configuration_without_version_rewrites(self):
        self.assertIn("getByName('debugRuntimeClasspath')",c.PROJECT_CLOSURE_INIT)
        self.assertIn('ModuleComponentIdentifier',c.PROJECT_CLOSURE_INIT)
        self.assertIn('UnresolvedDependencyResult',c.PROJECT_CLOSURE_INIT)
        self.assertIn('lenient = false',c.PROJECT_CLOSURE_INIT)
        self.assertNotIn('runtimeOnly',c.PROJECT_CLOSURE_INIT)
        self.assertNotIn('resolutionStrategy',c.PROJECT_CLOSURE_INIT)
        for url in c.OFFICIAL_REPOSITORIES:self.assertIn(url.rstrip('/'),c.PROJECT_CLOSURE_INIT)


class StageAdapterTests(unittest.TestCase):
    def exercise(self,fail_compile=False,missing_zip_pin=False,bad_tool=False,drift_at=None,init_tamper=None,lose_final_lock=False):
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
                def jobs(self):
                    if lose_final_lock and 'cleanup'in actions:raise RuntimeError('keeper continuity lost before terminal')
                def policy(self):pass
                def native_census(self,initial=False):return{}
                def clock(self):pass
                def record(self,name,value):(self.root/name).write_text(json.dumps(value))
                def consume_and_adopt(self):actions.append('consume')
                def command(self,args,cwd=None,timeout=None):
                    if self.env.get('ORG_GRADLE_PROJECT_settleoraReleaseOffline')=='true':self.verify_offline_probe()
                    self.assert_capture_limits=(self.capture_limit('cmd_seed'),self.command_output_limit('cmd_seed'))
                    if self.assert_capture_limits!=(32*1024*1024,64*1024*1024):raise AssertionError('staging output budget')
                    calls.append((list(args),dict(self.env)))
                    if len(calls)==1:
                        properties=Path(cwd)/'android/local.properties'
                        if not properties.is_file():raise AssertionError('controlled properties must precede pub tooling')
                        with properties.open('a')as f:f.write('fixture.pub=true\n')
                    if len(calls)==2:
                        output=Path(next(a.split('=',1)[1]for a in args if a.startswith('-PsettleoraClosureOutput=')))
                        output.write_text(json.dumps(dict(configuration=':app:debugRuntimeClasspath',artifacts=[dict(coordinate='androidx.test:runner:1.7.0',fileName='runner.aar',bytes=1,sha256='c'*64)],selectors=[dict(requested='androidx.test:rules:1.2+',selected='androidx.test:rules:1.7.0')])))
                        if 'fixture.pub=true' not in (Path(cwd)/'local.properties').read_text():raise AssertionError('pub-generated properties overwritten')
                        if (Path(cwd).parent.parent.parent/'assets/model').read_bytes()!=b'original':raise AssertionError('pinned input not copied')
                    if drift_at==len(calls):
                        properties=(Path(cwd)/'local.properties')if len(calls)==2 else Path(cwd)/'android/local.properties'
                        with properties.open('a')as f:f.write('sdk.dir=/unexpected\n')
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
            def install_offline(home):
                directory=Path(home)/'init.d';directory.mkdir();target=directory/'settleora-current-offline.gradle'
                if init_tamper!='missing':target.write_text('fixture offline strict\n' if init_tamper!='changed' else 'changed')
                if init_tamper=='linked':
                    replacement=Path(home)/'outside';replacement.write_text('fixture offline strict\n');target.unlink();target.symlink_to(replacement)
                if init_tamper=='extra':(directory/'override.gradle').write_text('override')
            m=types.SimpleNamespace(validate_network_policy=Mock(),write_scope=Mock(return_value=['historical-parent',str(stage)]),Backend=FakeBackend,sha=sha,GRADLE_SHA256=sha(archive),GRADLE_LAUNCHER_SHA256='b'*64,check_signal_context=Mock(),check_write_space=Mock(),subprocess=types.SimpleNamespace(check_output=Mock(side_effect=[p['head'],''])),extract_source=extract,verify_source_tree=Mock(),install_gradle_distribution=Mock(return_value=dict(verified=True)),install_gradle_offline_init=install_offline,OFFLINE_GRADLE_INIT='fixture offline strict\n',verified_plugin_links=Mock(return_value={}),filesystem_space=Mock())
            plan=dict(context=p,supervisorPath='synthetic',supervisorSHA256='b'*64,keeperPID=1,baseCache=str(base),distributionZIP=str(archive))
            if missing_zip_pin:p['filePins'].pop(str(archive))
            with patch.object(c,'validate_plan',return_value=p),patch.object(c,'load_supervisor',return_value=m),patch.object(c,'verify_keeper_locks'),patch.object(subprocess,'Popen')as spawn:
                if bad_tool:
                    with self.assertRaisesRegex(RuntimeError,'tool drift before consumption'):c.execute(plan,root/'plan.json','c'*64)
                    self.assertEqual(actions,[]);self.assertFalse(stage.exists());spawn.assert_not_called();return
                if missing_zip_pin:
                    with self.assertRaisesRegex(RuntimeError,'wrapper pin'):c.execute(plan,root/'plan.json','c'*64)
                    self.assertEqual(actions,[]);self.assertFalse(stage.exists());return
                if lose_final_lock:
                    with self.assertRaisesRegex(RuntimeError,'keeper continuity'):c.execute(plan,root/'plan.json','c'*64)
                    self.assertEqual(len(calls),3);self.assertFalse(json.loads((stage/'STAGE_TERMINAL.json').read_text())['success']);self.assertEqual(actions,['consume','cleanup','release']);spawn.assert_not_called();return
                if init_tamper:
                    with self.assertRaises(RuntimeError):c.execute(plan,root/'plan.json','c'*64)
                    self.assertEqual(len(calls),2);self.assertEqual(actions,['consume','cleanup','release']);spawn.assert_not_called();return
                if drift_at:
                    with self.assertRaisesRegex(RuntimeError,'properties'):c.execute(plan,root/'plan.json','c'*64)
                    self.assertEqual(actions,['consume','cleanup','release']);self.assertEqual(len(calls),drift_at);self.assertFalse(json.loads((stage/'STAGE_TERMINAL.json').read_text())['success']);spawn.assert_not_called();return
                if fail_compile:
                    with self.assertRaisesRegex(RuntimeError,'offline compile'):c.execute(plan,root/'plan.json','c'*64)
                else:c.execute(plan,root/'plan.json','c'*64)
                spawn.assert_not_called()
            self.assertEqual(actions,['consume','cleanup','release']);self.assertEqual(len(calls),3);m.validate_network_policy.assert_called_once_with(p['network']);self.assertTrue(all(0<x.kwargs['timeout']<=5 for x in m.subprocess.check_output.call_args_list))
            self.assertIn('--dependency-verification=strict',calls[1][0]);self.assertIn(':app:settleoraResolveDebugRuntimeClasspath',calls[1][0]);self.assertNotIn('ORG_GRADLE_PROJECT_settleoraReleaseOffline',calls[1][1]);self.assertEqual(calls[1][1]['ORG_GRADLE_PROJECT_settleoraReleaseEvidence'],'true')
            self.assertEqual(calls[0][0][1:],['pub','get','--offline']);self.assertEqual(calls[2][0][1:4],['build','apk','--debug']);self.assertEqual(calls[2][1]['ORG_GRADLE_PROJECT_settleoraReleaseOffline'],'true');self.assertIn('-Dorg.gradle.project.android.builder.sdkDownload=false',calls[2][1]['GRADLE_OPTS']);self.assertEqual(calls[2][1]['ANDROID_USER_HOME'],str(stage/'scratch/android-user'));self.assertEqual(calls[0][1]['JAVA_TOOL_OPTIONS'],'-Duser.home='+str(stage/'scratch/home'));self.assertEqual(calls[2][1]['JAVA_TOOL_OPTIONS'],calls[0][1]['JAVA_TOOL_OPTIONS'])
            terminal=json.loads((stage/'STAGE_TERMINAL.json').read_text());self.assertEqual(terminal['success'],not fail_compile);self.assertTrue(terminal['cleanupVerified']);self.assertEqual(terminal['OCRImageCasesExecuted'],0);self.assertFalse(terminal['nativeReady']);self.assertEqual(payload.read_bytes(),b'original')

    def test_tool_drift_rejects_before_root_or_consumption(self):self.exercise(bad_tool=True)
    def test_final_keeper_loss_prevents_success_after_commands_and_cleanup(self):self.exercise(lose_final_lock=True)
    def test_missing_replaced_linked_or_extra_offline_init_blocks_compile(self):
        for kind in ('missing','changed','linked','extra'):
            with self.subTest(kind=kind):self.exercise(init_tamper=kind)
    def test_seed_properties_drift_blocks_freeze_and_compile(self):self.exercise(drift_at=2)
    def test_compile_properties_drift_cannot_report_success(self):self.exercise(drift_at=3)
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
            with self.assertRaisesRegex(RuntimeError,'exactly five'):c.verify_keeper_locks(pins,42,lines+['99: FLOCK ADVISORY WRITE 42 aa:bb:99999 0 EOF'])
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

class ProjectInputAndReceiptTests(unittest.TestCase):
    def test_canonical_flutter_properties_keep_pinned_paths_and_reject_overrides(self):
        with tempfile.TemporaryDirectory()as tmp:
            p=Path(tmp)/'local.properties';p.write_text('sdk.dir=/sdk\nflutter.sdk=/flutter\nflutter.buildMode=debug\n');c.verify_local_properties(p,'/sdk','/flutter')
            for text in ('sdk.dir=/sdk\nflutter.sdk=/other\n','sdk.dir=/sdk\nflutter.sdk=/flutter\nsdk.dir=/other\n','sdk.dir=/sdk\nflutter\\u002esdk=/flutter\n'):
                p.write_text(text)
                with self.subTest(text=text),self.assertRaises(RuntimeError):c.verify_local_properties(p,'/sdk','/flutter')

    def test_properties_symlink_and_fifo_rejected_without_reading(self):
        import os
        with tempfile.TemporaryDirectory()as tmp:
            root=Path(tmp);target=root/'target';target.write_text('sdk.dir=/sdk\nflutter.sdk=/flutter\n');link=root/'local.properties';link.symlink_to(target)
            with self.assertRaisesRegex(RuntimeError,'linked'):c.verify_local_properties(link,'/sdk','/flutter')
            link.unlink();os.mkfifo(link)
            with self.assertRaisesRegex(RuntimeError,'ordinary'):c.verify_local_properties(link,'/sdk','/flutter')

    def test_pinned_ignored_inputs_are_copied_and_existing_source_is_preserved(self):
        import hashlib
        with tempfile.TemporaryDirectory()as tmp:
            root=Path(tmp);source=root/'source';source.mkdir();original=root/'model';original.write_bytes(b'model');sha=lambda p,*args:hashlib.sha256(Path(p).read_bytes()).hexdigest();pin=dict(path=str(original),relativePath='assets/model',sha256=sha(original))
            copied=c.copy_isolated_inputs(source,[pin],lambda:None,sha);self.assertEqual((source/'assets/model').read_bytes(),b'model');self.assertEqual(len(copied),1)
            (source/'assets/model').write_bytes(b'changed')
            with self.assertRaisesRegex(RuntimeError,'changed'):c.copy_isolated_inputs(source,[pin],lambda:None,sha)
            self.assertEqual((source/'assets/model').read_bytes(),b'changed')
            (source/'assets/model').unlink();(source/'assets/model').symlink_to(original)
            with self.assertRaisesRegex(RuntimeError,'linked'):c.copy_isolated_inputs(source,[pin],lambda:None,sha)

    def test_actual_runtime_receipt_preserves_dynamic_selectors_and_aar_identity(self):
        import json
        with tempfile.TemporaryDirectory()as tmp:
            path=Path(tmp)/'closure';data=dict(configuration=':app:debugRuntimeClasspath',artifacts=[dict(coordinate='androidx.test:runner:1.7.0',fileName='runner.aar',bytes=10,sha256='a'*64)],selectors=[dict(requested='androidx.test:rules:1.2+',selected='androidx.test:rules:1.7.0')]);path.write_text(json.dumps(data));self.assertEqual(c.project_closure(path),data)
            for field,value in [('configuration',':other'),('artifacts',[]),('selectors',[])]:
                changed=dict(data);changed[field]=value;path.write_text(json.dumps(changed))
                with self.subTest(field=field),self.assertRaisesRegex(RuntimeError,'complete'):c.project_closure(path)
            path.write_text('{"configuration":"wrong","configuration":"also wrong"}')
            with self.assertRaises(ValueError):c.project_closure(path)


if __name__ == '__main__':
    unittest.main()
