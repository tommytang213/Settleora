import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as evidence from "../native-acceptance-evidence.mjs";
import { boundedParserDiagnostics } from "../native-acceptance-evidence.mjs";
const valid = () => ({schemaVersion:1,status:"observed",quantity:Array(evidence.parserDiagnosticQuantityCount).fill(0),dates:Array.from({length:evidence.parserDiagnosticDateStageCount},()=>Array(evidence.parserDiagnosticDateCount).fill(0))});
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

// Cross-language wire dimensions must fail a test when the producer enum changes.
test("collector dimensions match the committed Dart predicate enums", () => {
 const source=readFileSync(new URL("../../../apps/mobile/lib/receipt_ocr_capture/receipt_ocr_preview.dart",import.meta.url),"utf8");
 const enumCount=(match,name)=>{
  assert.ok(match,`missing ${name}`);
  const values=match[1].replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/[^\n]*/g,"").split(",").map(v=>v.trim()).filter(Boolean);
  assert.ok(values.every(v=>/^[A-Za-z_]\w*$/.test(v)),`unsupported enum shape ${name}`);
  assert.equal(new Set(values).size,values.length);
  return values.length;
 };
 assert.equal(evidence.parserDiagnosticQuantityCount,enumCount(source.match(/enum\s+ReceiptOcrQuantityPredicate\s*\{([^}]*)\}/),"ReceiptOcrQuantityPredicate"));
 assert.equal(evidence.parserDiagnosticDateCount,enumCount(source.match(/enum\s+ReceiptOcrDatePredicate\s*\{([^}]*)\}/),"ReceiptOcrDatePredicate"));
 assert.equal(evidence.parserDiagnosticDateStageCount,enumCount(source.match(/enum\s+ReceiptOcrDateStage\s*\{([^}]*)\}/),"ReceiptOcrDateStage"));
});
