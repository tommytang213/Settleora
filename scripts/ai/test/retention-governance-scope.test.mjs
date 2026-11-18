import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync,spawnSync} from "node:child_process";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,chmodSync,symlinkSync} from "node:fs";
import {dirname,join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
const self=fileURLToPath(import.meta.url);
const guard=process.env.RETENTION_SCOPE_GUARD || resolve(dirname(self),"../v3-scope-guard.mjs");
const target="scripts/ai/test/retention-governance-scope.test.mjs";
const record="docs/qa/LOCAL_RETENTION_REGRESSION_SCOPE_DECISION.json";
const bytes=readFileSync(self);
const blob=execFileSync("git",["hash-object","--stdin"],{input:bytes,encoding:"utf8"}).trim();
const approval=()=>({schema_version:1,proposal:"retention-regression-scope-v1",repository:"tommytang213/Settleora",
 decision:"approved",authority:"Atlas",mode:"synthetic_regression_test_only",path:target,blob,
 mutation_authorized:false,live_adoption_authorized:false});
function fixture(t,baseRecord,prepareBase=()=>{}) {
 const dir=mkdtempSync(join(tmpdir(),"retention-stage1-synthetic-"));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const env={...process.env,GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:"/dev/null",GIT_AUTHOR_NAME:"Synthetic Test",
 GIT_AUTHOR_EMAIL:"synthetic@example.invalid",GIT_COMMITTER_NAME:"Synthetic Test",GIT_COMMITTER_EMAIL:"synthetic@example.invalid"};
 const git=(...args)=>execFileSync("git",args,{cwd:dir,env,encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
 const put=(p,v)=>{mkdirSync(dirname(join(dir,p)),{recursive:true});writeFileSync(join(dir,p),v);};
 const commit=()=>{git("add","--all");git("-c","commit.gpgsign=false","commit","--quiet","-m","synthetic");};
 git("init","--quiet");put(".ai/state.json",JSON.stringify({activeMilestoneId:"M15"}));
 if(baseRecord==="symlink") {put("docs/qa/record.json",JSON.stringify(approval(),null,2)+"\n");symlinkSync("record.json",join(dir,record));}
 else if(baseRecord!==undefined) put(record,typeof baseRecord==="string"?baseRecord:JSON.stringify(baseRecord,null,2)+"\n");
 prepareBase(put,dir,git);
 commit();const base=git("rev-parse","HEAD");put(target,bytes);commit();
 const run=(extraEnv={})=>spawnSync(process.execPath,[guard,"--base",base,"--head","HEAD"],{cwd:dir,env:{...env,...extraEnv},encoding:"utf8"});
 return {dir,git,put,commit,run};
}
const denied=f=>{const r=f.run();assert.equal(r.status,1,r.stdout+r.stderr);};
test("missing base approval denies test",t=>denied(fixture(t)));
test("reviewed base grants only exact regular test blob",t=>{const r=fixture(t,approval()).run();assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/base-approved exact-blob regression test/);});
test("candidate record cannot approve itself",t=>{const f=fixture(t);f.put(record,JSON.stringify(approval(),null,2)+"\n");f.commit();denied(f);});
test("worktree record cannot approve itself",t=>{const f=fixture(t);f.put(record,JSON.stringify(approval(),null,2)+"\n");denied(f);});
for(const [k,v] of [["decision","proposed"],["authority","Other"],["blob","0".repeat(40)],["mode","apply"],["mutation_authorized",true],["live_adoption_authorized",true],["path","tools/anything.py"],["repository","other/repo"]])
 test("reject mismatched approval "+k,t=>{const a=approval();a[k]=v;denied(fixture(t,a));});
test("reject extra field",t=>denied(fixture(t,{...approval(),override:true})));
test("reject malformed JSON",t=>denied(fixture(t,"{bad")));
test("reject duplicate field",t=>denied(fixture(t,JSON.stringify(approval(),null,2).replace('"schema_version": 1,','"schema_version": 1, "schema_version": 1,'))));
test("reject symlink decision",t=>denied(fixture(t,"symlink")));
test("reject changed test",t=>{const f=fixture(t,approval());f.put(target,Buffer.concat([bytes,Buffer.from("\n")]));f.commit();denied(f);});
test("reject executable test",t=>{const f=fixture(t,approval());chmodSync(join(f.dir,target),0o755);f.git("update-index","--chmod=+x",target);f.commit();denied(f);});
test("reject symlink test",t=>{const f=fixture(t,approval());rmSync(join(f.dir,target));symlinkSync("other.mjs",join(f.dir,target));f.commit();denied(f);});
test("unrelated test remains denied",t=>{const f=fixture(t,approval());f.put("scripts/ai/test/other.test.mjs","// fixture");f.commit();denied(f);});
test("planner remains denied",t=>{const f=fixture(t,approval());f.put("tools/local-attempt-retention/retention.py","pass");f.commit();denied(f);});
test("forbidden path retains precedence",t=>{const f=fixture(t,approval());f.put("services/api/example.txt","fixture");f.commit();denied(f);});
test("wrong milestone denied",t=>{const f=fixture(t,approval());f.put(".ai/state.json",JSON.stringify({activeMilestoneId:"M14"}));f.commit();denied(f);});

for(const changed of [target+" "," "+target]) test("distinct whitespace pathname is denied: "+JSON.stringify(changed),t=>{
 const f=fixture(t,approval());f.put(changed,"// unreviewed test content");f.commit();denied(f);
});
test("forbidden rename source remains denied",t=>{
 const source="services/api/retention-fixture.mjs";
 const f=fixture(t,approval(),put=>put(source,bytes));f.git("rm",source);f.commit();denied(f);
});
test("head ref moving after diff cannot change blob authority",t=>{
 const f=fixture(t,approval());const approvedHead=f.git("rev-parse","HEAD");
 f.put(target,Buffer.concat([bytes,Buffer.from("\n")]));f.commit();
 const bin=join(f.dir,"synthetic-bin");mkdirSync(bin);
 const realGit=execFileSync("which",["git"],{encoding:"utf8"}).trim();
 const wrapper=join(bin,"git");
 writeFileSync(wrapper,'#!/bin/sh\n"'+realGit+'" "$@"\nstatus=$?\ncase " $* " in *" diff "*) "'+realGit+'" update-ref HEAD "$RACE_TARGET" ;; esac\nexit "$status"\n');chmodSync(wrapper,0o755);
 const r=f.run({PATH:bin+":"+process.env.PATH,RACE_TARGET:approvedHead});
 assert.equal(r.status,1,r.stdout+r.stderr);assert.equal(f.git("rev-parse","HEAD"),approvedHead);
});
test("candidate milestone cannot widen a non-M15 base approval",t=>{
 const f=fixture(t,approval(),put=>put(".ai/state.json",JSON.stringify({activeMilestoneId:"M14"})));
 f.put(".ai/state.json",JSON.stringify({activeMilestoneId:"M15"}));f.commit();denied(f);
});
test("worktree-only milestone cannot widen a non-M15 base approval",t=>{
 const f=fixture(t,approval(),put=>put(".ai/state.json",JSON.stringify({activeMilestoneId:"M14"})));
 f.put(".ai/state.json",JSON.stringify({activeMilestoneId:"M15"}));denied(f);
});
test("unknown base milestone remains denied",t=>{
 const f=fixture(t,approval(),put=>put(".ai/state.json","{}"));
 f.put(".ai/state.json",JSON.stringify({activeMilestoneId:"M15"}));f.commit();denied(f);
});
test("trusted base markdown fallback preserves existing milestone semantics",t=>{
 const f=fixture(t,approval(),put=>{put(".ai/state.json","{}");put(".ai/current-milestone.md","ID: M15\n");});
 const r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);
});

test("oversized base state cannot fall back to M15 Markdown",t=>{
 const f=fixture(t,approval(),put=>{put(".ai/state.json",JSON.stringify({activeMilestoneId:"M14",padding:"x".repeat(140*1024)}));put(".ai/current-milestone.md","ID: M15\n");});
 f.put(".ai/state.json",JSON.stringify({activeMilestoneId:"M15"}));f.commit();denied(f);
});
test("absent base state permits trusted Markdown fallback",t=>{
 const f=fixture(t,approval(),(put,dir)=>{rmSync(join(dir,".ai/state.json"));put(".ai/current-milestone.md","ID: M15\n");});
 const r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);
});

test("base state directory is not metadata",t=>{
 const f=fixture(t,approval(),(put,dir)=>{rmSync(join(dir,".ai/state.json"));put(".ai/state.json/child","fixture");put(".ai/current-milestone.md","ID: M15\n");});denied(f);
});
test("base state symlink is not metadata",t=>{
 const f=fixture(t,approval(),(put,dir)=>{rmSync(join(dir,".ai/state.json"));symlinkSync("missing",join(dir,".ai/state.json"));put(".ai/current-milestone.md","ID: M15\n");});denied(f);
});
test("base Markdown symlink is not metadata",t=>{
 const f=fixture(t,approval(),(put,dir)=>{put(".ai/state.json","{}");symlinkSync("ID: M15",join(dir,".ai/current-milestone.md"));});
 f.put(".ai/state.json",JSON.stringify({activeMilestoneId:"M15"}));f.commit();denied(f);
});
test("regular executable base metadata remains readable",t=>{
 const f=fixture(t,approval(),(put,dir)=>chmodSync(join(dir,".ai/state.json"),0o755));
 const r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);
});
for(const kind of ["tree","symlink","oversized"]) test("M15 state does not skip invalid present Markdown "+kind,t=>{
 const f=fixture(t,approval(),(put,dir)=>{
  if(kind==="tree") put(".ai/current-milestone.md/child","fixture");
  if(kind==="symlink") symlinkSync("missing",join(dir,".ai/current-milestone.md"));
  if(kind==="oversized") put(".ai/current-milestone.md","x".repeat(140*1024));
 });denied(f);
});
test("subdirectory invocation resolves root paths with relative diff configured",t=>{
 const f=fixture(t,approval());f.git("config","diff.relative","true");
 const cwd=join(f.dir,"scripts","ai");
 const r=spawnSync(process.execPath,[guard,"--base",f.git("rev-parse","HEAD^"),"--head","HEAD","--state-file",join(f.dir,".ai/state.json"),"--milestone-file",join(f.dir,".ai/current-milestone.md")],{cwd,encoding:"utf8"});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/base-approved exact-blob regression test/);
});
for(const prefix of ["docs/qa/","services/api/","unapproved/"]) test("control characters in reported path are escaped "+prefix,t=>{
 const f=fixture(t,approval());const path=prefix+"line\n::warning::injected\r\u001b[2J";f.put(path,"fixture");f.commit();
 const r=f.run();assert.equal(r.status,prefix==="docs/qa/"?0:1,r.stdout+r.stderr);
 assert.ok(!r.stdout.includes(path));assert.ok(!r.stderr.includes(path));
 assert.ok(r.stdout.includes(JSON.stringify(path).replace(/[\u0023\u003a\u005b]/g,c=>"\\u"+c.charCodeAt(0).toString(16).padStart(4,"0"))));assert.ok(!r.stdout.split("\n").some(l=>l.startsWith("::warning::")));
});
for(const suffix of ["\u00a0","\u2028","\ufeff","\u000b"]) test("non-JSON trailing record whitespace denied "+JSON.stringify(suffix),t=>{
 denied(fixture(t,JSON.stringify(approval(),null,2)+suffix));
});
test("JSON trailing record whitespace remains allowed",t=>{
 const r=fixture(t,JSON.stringify(approval(),null,2)+" \t\r\n").run();assert.equal(r.status,0,r.stdout+r.stderr);
});

test("gitlink changes remain visible when submodule diff is ignored",t=>{
 const path="services/api/vendor";const f=fixture(t,approval());
 const commitIndex=()=>f.git("-c","commit.gpgsign=false","commit","--quiet","-m","gitlink fixture");
 f.git("update-index","--add","--cacheinfo","160000,"+f.git("rev-parse","HEAD")+","+path);commitIndex();
 const base=f.git("rev-parse","HEAD");f.git("config","diff.ignoreSubmodules","all");
 f.git("update-index","--cacheinfo","160000,"+base+","+path);commitIndex();
 const r=spawnSync(process.execPath,[guard,"--base",base,"--head","HEAD"],{cwd:f.dir,encoding:"utf8"});
 assert.equal(r.status,1,r.stdout+r.stderr);
});
for(const marker of ["##[warning]injected","::warning::injected"]) test("runner marker is not emitted from a path "+marker,t=>{
 const f=fixture(t,approval());f.put("unapproved/"+marker,"fixture");f.commit();const r=f.run();
 assert.equal(r.status,1);assert.ok(!r.stdout.includes(marker));assert.ok(!r.stderr.includes(marker));
});
for(const markdown of ["Previous milestone ID: M15\n","Previous milestone ID: M15\n- ID: M14\n","- ID: M15\n- ID: M14\n"]) test("base Markdown requires one current milestone field "+JSON.stringify(markdown),t=>{
 const f=fixture(t,approval(),put=>{put(".ai/state.json","{}");put(".ai/current-milestone.md",markdown);});
 f.put(".ai/state.json",JSON.stringify({activeMilestoneId:"M15"}));f.commit();denied(f);
});
test("base Markdown uses current field rather than previous milestone",t=>{
 const f=fixture(t,approval(),put=>{put(".ai/state.json","{}");put(".ai/current-milestone.md","Previous milestone ID: M14\n- ID: `M15`\n");});
 f.put(".ai/state.json",JSON.stringify({activeMilestoneId:"M15"}));f.commit();const r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);
});
for(const markdown of ["ID: M15\nID: unknown\n","ID: M15\nID: M14 (current)\n","```text\nID: M15\n```\n","<!--\nID: M15\n-->\n"]) test("base current field is not ambiguous or an example "+JSON.stringify(markdown),t=>{
 const f=fixture(t,approval(),put=>{put(".ai/state.json","{}");put(".ai/current-milestone.md",markdown);});
 f.put(".ai/state.json",JSON.stringify({activeMilestoneId:"M15"}));f.commit();denied(f);
});
test("base current field permits fenced and commented examples elsewhere",t=>{
 const f=fixture(t,approval(),put=>{put(".ai/state.json","{}");put(".ai/current-milestone.md","- ID: `M15`\n```text\nID: M14\n```\n<!--\nID: M13\n-->\n");});
 const r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);
});

for(const markdown of ["```<!--`-->\nID: M14\n```\nID: M15\n", "```text<!--`-->\nID: M14\n```\nID: M15\n"]) test("raw fence info cannot hide backticks in HTML comments "+JSON.stringify(markdown),t=>{
 const f=fixture(t,approval(),put=>{put(".ai/state.json","{}");put(".ai/current-milestone.md",markdown);});
 f.put(".ai/state.json",JSON.stringify({activeMilestoneId:"M15"}));f.commit();denied(f);
});
test("invalid-looking fence inside a complete HTML comment stays an example",t=>{
 const f=fixture(t,approval(),put=>{put(".ai/state.json","{}");put(".ai/current-milestone.md","<!--\n```invalid`info\n-->\nID: M15\n");});
 const r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);
});

for(const mark of ["```","~~~"]) test("fence info HTML marker stays literal "+mark,t=>{
 const f=fixture(t,approval(),put=>{put(".ai/state.json","{}");put(".ai/current-milestone.md","ID: M15\n"+mark+"<!--\nID: M14\n"+mark+"\n");});
 const r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);
});
for(const code of [0x2028,0x2029,13]) test("malformed line separator cannot hide second ID "+code,t=>{
 const f=fixture(t,approval(),put=>{put(".ai/state.json","{}");put(".ai/current-milestone.md","ID: M15\nID: M14"+String.fromCharCode(code)+"hidden\n");});
 f.put(".ai/state.json",JSON.stringify({activeMilestoneId:"M15"}));f.commit();denied(f);
});
for(const code of [0x2028,0x2029,13,0xa0]) test("nonallowed trailing ID character remains invalid "+code,t=>{
 const f=fixture(t,approval(),put=>{put(".ai/state.json","{}");put(".ai/current-milestone.md","ID: M15"+String.fromCharCode(code));});
 f.put(".ai/state.json",JSON.stringify({activeMilestoneId:"M15"}));f.commit();denied(f);
});
for(const code of [0xa0,0x2028,0x2029,13]) test("untrimmed fence closer rejects trailing character "+code,t=>{
 const f=fixture(t,approval(),put=>{put(".ai/state.json","{}");put(".ai/current-milestone.md","ID: M15\n```text\nexample\n```"+String.fromCharCode(code));});
 f.put(".ai/state.json",JSON.stringify({activeMilestoneId:"M15"}));f.commit();denied(f);
});

for(const suffix of ["~~~","ID: M14"]) test("comment closer cannot manufacture metadata prefix "+suffix,t=>{
 const f=fixture(t,approval(),put=>{put(".ai/state.json","{}");put(".ai/current-milestone.md","<!--\n-->"+suffix+"\nID: M15\n");});
 f.put(".ai/state.json",JSON.stringify({activeMilestoneId:"M15"}));f.commit();const r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);
});
for(const markdown of ["<!--\n-->ID: M15\n","ID: M15\n<!--\n-->~~~\nID: M14\n~~~\n"]) test("masked prefix cannot manufacture authority "+JSON.stringify(markdown),t=>{
 const f=fixture(t,approval(),put=>{put(".ai/state.json","{}");put(".ai/current-milestone.md",markdown);});
 f.put(".ai/state.json",JSON.stringify({activeMilestoneId:"M15"}));f.commit();denied(f);
});

for(const value of ["<!-- note --> M15","\t<!-- note -->\t`M15`"]) test("comment-masked ID value permits horizontal spacing "+value,t=>{
 const f=fixture(t,approval(),put=>{put(".ai/state.json","{}");put(".ai/current-milestone.md","ID: "+value+"\n");});
 f.put(".ai/state.json",JSON.stringify({activeMilestoneId:"M15"}));f.commit();const r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);
});
test("array base state cannot override non-M15 Markdown",t=>{
 const f=fixture(t,approval(),put=>{put(".ai/state.json",JSON.stringify({activeMilestoneId:["M15"]}));put(".ai/current-milestone.md","ID: M14\n");});
 f.put(".ai/state.json",JSON.stringify({activeMilestoneId:"M15"}));f.commit();denied(f);
});
test("nonstring base state permits valid Markdown fallback",t=>{
 const f=fixture(t,approval(),put=>{put(".ai/state.json",JSON.stringify({activeMilestoneId:{value:"M14"}}));put(".ai/current-milestone.md","ID: M15\n");});
 f.put(".ai/state.json",JSON.stringify({activeMilestoneId:"M15"}));f.commit();const r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);
});
for(const prefix of ["services/api/","unapproved/"]) test("large denial report drains diagnostics "+prefix,t=>{
 const f=fixture(t,approval());const paths=Array.from({length:400},(_,i)=>prefix+String(i).padStart(4,"0")+"-"+String.fromCharCode(0x2028).repeat(40));
 for(const path of paths)f.put(path,"fixture");f.commit();const r=f.run();assert.equal(r.status,1,r.stdout+r.stderr);
 assert.ok(!r.stdout.includes("Scope guard passed."));
 for(const path of paths){const label=JSON.stringify(path).replace(/[\u007f-\uffff]/g,c=>"\\u"+c.charCodeAt(0).toString(16).padStart(4,"0"));assert.ok(r.stderr.includes(label),"missing diagnostic "+path.slice(0,22));}
});

for(const baseArg of [null,"origin/ai/integration","refs/remotes/origin/ai/integration"]) test("integration base cannot fall back to a tag "+baseArg,t=>{
 const f=fixture(t,approval());f.git("tag",baseArg==="refs/remotes/origin/ai/integration"?baseArg:"origin/ai/integration","HEAD^");
 const args=[guard,"--head","HEAD"];if(baseArg)args.push("--base",baseArg);
 const r=spawnSync(process.execPath,args,{cwd:f.dir,encoding:"utf8"});assert.equal(r.status,1,r.stdout+r.stderr);
});
for(const baseArg of [null,"origin/ai/integration","refs/remotes/origin/ai/integration"]) test("integration base pins remote namespace despite tag shadow "+baseArg,t=>{
 const f=fixture(t,approval());const base=f.git("rev-parse","HEAD^");f.git("update-ref","refs/remotes/origin/ai/integration",base);f.git("tag","origin/ai/integration","HEAD");
 const args=[guard,"--head","HEAD"];if(baseArg)args.push("--base",baseArg);
 const r=spawnSync(process.execPath,args,{cwd:f.dir,encoding:"utf8"});assert.equal(r.status,0,r.stdout+r.stderr);assert.ok(r.stdout.includes("("+base+")"),r.stdout);
});

for(const markdown of [
 "ID: M15\nExample `<!--`\nID: M16\nExample `-->`\n",
 "ID: M15\nExample \\<!--\nID: M16\n-->\n",
 "ID: M15\nExample ``<!--``\nID: M16\nExample ``-->``\n",
 "ID: M15\nExample `\n<!--\nID: M16\n-->\n`\n",
 "ID: `M15` <!-- note -->\n",
 "ID: \\<!-- note --> M15\n",
]) test("ambiguous inline code or escape cannot mask authority "+JSON.stringify(markdown),t=>{
 const f=fixture(t,approval(),put=>{put(".ai/state.json","{}");put(".ai/current-milestone.md",markdown);});
 f.put(".ai/state.json",JSON.stringify({activeMilestoneId:"M15"}));f.commit();denied(f);
});
test("real comments retain literal backticks and escapes as comment content",t=>{
 const markdown="<!-- `example` \\ text -->\n<!--\n`example` \\ text\n-->\nID: <!-- note --> `M15`\n";
 const f=fixture(t,approval(),put=>{put(".ai/state.json","{}");put(".ai/current-milestone.md",markdown);});
 f.put(".ai/state.json",JSON.stringify({activeMilestoneId:"M15"}));f.commit();
 const r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);
});

for(const marker of ["<!-->","<!--->"]) for(const markdown of [
 "ID: "+marker+" M15\n",
 "ID: M15\n"+marker+"\nID: M14\n-->\n",
 "ID: M15\n"+marker+"\nID: M14\n",
]) test("shorthand comment openers fail closed immediately "+JSON.stringify(markdown),t=>{
 const f=fixture(t,approval(),put=>{put(".ai/state.json","{}");put(".ai/current-milestone.md",markdown);});
 f.put(".ai/state.json",JSON.stringify({activeMilestoneId:"M15"}));f.commit();denied(f);
});
test("full empty HTML delimiter remains supported",t=>{
 const f=fixture(t,approval(),put=>{put(".ai/state.json","{}");put(".ai/current-milestone.md","ID: <!----> `M15`\n");});
 f.put(".ai/state.json",JSON.stringify({activeMilestoneId:"M15"}));f.commit();const r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);
});
