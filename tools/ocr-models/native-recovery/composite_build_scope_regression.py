"""Manual Gradle-core regression; no Android SDK, dependency downloads or assemble.

Runs actual production init text against a tiny composite build. Default Python
unit discovery never invokes this script. Keep the output directory as evidence.
"""
from pathlib import Path
import argparse,ast,hashlib,json,os,subprocess,datetime,ctypes,signal,time

def initializer(path):
 values={}
 for node in ast.parse(path.read_text()).body:
  if isinstance(node,ast.Assign)and isinstance(node.targets[0],ast.Name):
   name=node.targets[0].id
   if name=='REPOSITORY_GUARD_INIT':values[name]=ast.literal_eval(node.value)
   elif name=='PROJECT_CLOSURE_INIT':values[name]=values['REPOSITORY_GUARD_INIT']+ast.literal_eval(node.value.right)
 return values['PROJECT_CLOSURE_INIT']

def child_ids():
 return [int(x) for x in Path('/proc/self/task',str(os.getpid()),'children').read_text().split()]

class OwnedFixtureFailure(RuntimeError):
 pass

def run_owned(command,env,out,err,timeout=300):
 """One fixture root; observe/reap adopted descendants, never group-signal."""
 if child_ids():raise RuntimeError('fixture process already owns a child')
 if ctypes.CDLL(None,use_errno=True).prctl(36,1,0,0,0)!=0:raise OSError('fixture subreaper unavailable')
 proc=subprocess.Popen(command,env=env,stdout=out,stderr=err,start_new_session=True)
 fd=None;timed_out=False;code=None;failure=None;remaining=[proc.pid];observed=False
 try:
  try:
   fd=os.pidfd_open(proc.pid,0)  # Unreaped direct Popen child cannot be PID-reused.
   try:code=proc.wait(timeout=timeout)
   except subprocess.TimeoutExpired:
    timed_out=True
    if proc.poll()is None:
     try:signal.pidfd_send_signal(fd,signal.SIGTERM,None,0)
     except ProcessLookupError:pass  # No retry; still settle descendants.
    try:code=proc.wait(timeout=5)
    except subprocess.TimeoutExpired:pass
  except BaseException as error:failure=error
  # This observation runs even when holding the root pidfd or signalling failed.
  try:
   end=time.monotonic()+10
   while True:
    code=proc.poll()
    for pid in child_ids():
     if pid!=proc.pid:
      try:os.waitpid(pid,os.WNOHANG)
      except ChildProcessError:pass
    remaining=child_ids()
    if code is None and proc.pid not in remaining:remaining.append(proc.pid)
    observed=True
    if not remaining or time.monotonic()>=end:break
    time.sleep(.05)
  except BaseException as error:
   failure=failure or error;observed=False
  if failure is not None:
   problem=OwnedFixtureFailure(type(failure).__name__+': '+str(failure))
   problem.remaining=remaining;problem.cleanup_verified=observed and not remaining
   raise problem from failure
  return code,timed_out,remaining
 finally:
  if fd is not None:os.close(fd)

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
  try:
   with(root/'stdout.log').open('xb')as out,(root/'stderr.log').open('xb')as err:
    code,timed_out,remaining=run_owned(command,env,out,err,timeout=300)
  except BaseException as error:
   row=dict(case=name,success=False,failure=type(error).__name__+': '+str(error),cleanupVerified=bool(getattr(error,'cleanup_verified',False)),remainingOwnedRoots=getattr(error,'remaining',[]),utc=datetime.datetime.now(datetime.timezone.utc).isoformat());results.append(row)
   with(args.output/'RESULT.json').open('x')as f:json.dump(results,f,indent=2);f.write('\n')
   raise
  if timed_out or remaining:
   row=dict(case=name,exitCode=code,timeoutSeconds=300,timedOut=timed_out,cleanupVerified=not remaining,remainingOwnedRoots=remaining,success=False,utc=datetime.datetime.now(datetime.timezone.utc).isoformat());results.append(row)
   with(args.output/'RESULT.json').open('x')as f:json.dump(results,f,indent=2);f.write('\n')
   raise RuntimeError(name+' owned fixture did not finish and settle; no later cases')
  text=(root/'stdout.log').read_text()+(root/'stderr.log').read_text()
  if code!=expected:raise RuntimeError(name+' unexpected exit '+str(code))
  if name=='prior'and 'Required app project absent'not in text:raise RuntimeError('prior bug not reproduced')
  if name=='missing-app'and ('app'not in text or 'not found'not in text):raise RuntimeError('missing intended root did not fail closed')
  row=dict(case=name,exitCode=code,utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),helperSHA256=digest(helper),initializerSHA256=digest(init),AndroidProjectLoaded=False,assembleRequested=False,externalDependenciesDeclared=False);results.append(row);print(json.dumps(row),flush=True)
 with(args.output/'RESULT.json').open('x')as f:json.dump(results,f,indent=2);f.write('\n')

if __name__=='__main__':main()
