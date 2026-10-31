import assert from "node:assert/strict";
import test from "node:test";
import { boundedParserDiagnostics } from "../native-acceptance-evidence.mjs";
const valid = () => ({schemaVersion:1,status:"observed",quantity:Array(21).fill(0),dates:Array.from({length:3},()=>Array(19).fill(0))});
test("bounded parser tuples are copied and retain no unknown field",()=>{
 const input=valid(); input.quantity[0]=256;
 const result=boundedParserDiagnostics(input);
 assert.deepEqual(result,input); input.quantity[0]=3; assert.equal(result.quantity[0],256);
});
for(const mutate of [v=>v.raw="PRIVATE_SENTINEL",v=>v.quantity[0]="PRIVATE_SENTINEL",
 v=>v.quantity[0]=-1,v=>v.quantity[0]=257,v=>v.quantity.push(0),
 v=>v.dates[0].push(0),v=>v.dates.push([]),v=>v.status="PRIVATE_SENTINEL",
 v=>v.schemaVersion=2,v=>v.dates[0][0]=NaN,v=>v.dates[0][0]=1.5]) {
 test("malformed observation is unavailable without echo",()=>{
  const input=valid(); mutate(input);
  const result=boundedParserDiagnostics(input);
  assert.deepEqual(result,{schemaVersion:1,status:"invalid"});
  assert.ok(!JSON.stringify(result).includes("PRIVATE_SENTINEL"));
 });
}
test("old absent observations remain explicitly unavailable",()=>{
 assert.deepEqual(boundedParserDiagnostics({schemaVersion:1,status:"unavailable"}),
  {schemaVersion:1,status:"unavailable"});
});
