"""Manual Gradle-core regression; no Android SDK, dependency downloads or assemble.

Runs actual production init text against a tiny composite build. Default Python
unit discovery never invokes this script. Keep the output directory as evidence.
"""
from pathlib import Path
import argparse,ast,hashlib,json,os,subprocess,datetime

def initializer(path):
 values={}
 for node in ast.parse(path.read_text()).body:
  if isinstance(node,ast.Assign)and isinstance(node.targets[0],ast.Name):
   name=node.targets[0].id
   if name=='REPOSITORY_GUARD_INIT':values[name]=ast.literal_eval(node.value)
   elif name=='PROJECT_CLOSURE_INIT':values[name]=values['REPOSITORY_GUARD_INIT']+ast.literal_eval(node.value.right)
 return values['PROJECT_CLOSURE_INIT']

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--gradle',type=Path,required=True);ap.add_argument('--gradle-sha256',required=True);ap.add_argument('--prior-helper',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);args=ap.parse_args()
 digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
 if digest(args.gradle)!=args.gradle_sha256:raise RuntimeError('pinned Gradle launcher required')
 current=Path(__file__).with_name('gradle_dependency_closure.py');args.output.mkdir(mode=0o700);results=[]
 for name,helper,has_app,task,expected in [('prior',args.prior_helper,True,':tooling:help',1),('fixed',current,True,':tooling:help',0),('missing-app',current,False,':app:settleoraResolveDebugBuildClasspaths',1)]:
  root=args.output/name;root.mkdir(mode=0o700)
  for directory in ['home','gradle-home','tooling']: (root/directory).mkdir(mode=0o700)
  settings="rootProject.name='fixture-main'\nincludeBuild('tooling')\n"+("include(':app')\n"if has_app else'')
  (root/'settings.gradle').write_text(settings);(root/'build.gradle').write_text('');(root/'tooling/settings.gradle').write_text("rootProject.name='tooling'\n");(root/'tooling/build.gradle').write_text('')
  if has_app:(root/'app').mkdir();(root/'app/build.gradle').write_text('')
  init=root/'production.init.gradle';init.write_text(initializer(helper))
  env=dict(os.environ,HOME=str(root/'home'),GRADLE_USER_HOME=str(root/'gradle-home'),JAVA_TOOL_OPTIONS='-Duser.home='+str(root/'home'));env.pop('GRADLE_OPTS',None);env.pop('JAVA_OPTS',None)
  command=[str(args.gradle),'--no-daemon','--max-workers=1','--console=plain','--dependency-verification=strict','--init-script',str(init),'-p',str(root),task]
  with(root/'stdout.log').open('xb')as out,(root/'stderr.log').open('xb')as err:done=subprocess.run(command,env=env,stdout=out,stderr=err)
  text=(root/'stdout.log').read_text()+(root/'stderr.log').read_text()
  if done.returncode!=expected:raise RuntimeError(name+' unexpected exit '+str(done.returncode))
  if name=='prior'and 'Required app project absent'not in text:raise RuntimeError('prior bug not reproduced')
  if name=='missing-app'and ('app'not in text or 'not found'not in text):raise RuntimeError('missing intended root did not fail closed')
  row=dict(case=name,exitCode=done.returncode,utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),helperSHA256=digest(helper),initializerSHA256=digest(init),AndroidProjectLoaded=False,assembleRequested=False,externalDependenciesDeclared=False);results.append(row);print(json.dumps(row),flush=True)
 with(args.output/'RESULT.json').open('x')as f:json.dump(results,f,indent=2);f.write('\n')

if __name__=='__main__':main()
