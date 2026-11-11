import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as evidence from "../native-acceptance-evidence.mjs";
import { boundedParserDiagnostics } from "../native-acceptance-evidence.mjs";
const valid = () => ({schemaVersion:1,status:"observed",quantity:Array(evidence.parserDiagnosticQuantityCount).fill(0),dates:Array.from({length:evidence.parserDiagnosticDateStageCount},()=>Array(evidence.parserDiagnosticDateCount).fill(0))});
test("valid bounded parser tuples are copied",()=>{
 const input=valid(); input.quantity[0]=256; input.dates[0][0]=256;
 const result=boundedParserDiagnostics(input);
 assert.deepEqual(result,input);
 input.quantity[0]=3; input.dates[0][0]=4;
 assert.equal(result.quantity[0],256); assert.equal(result.dates[0][0],256);
});
for(const [name,mutate,containsPrivateText=false] of [
 ["unknown top-level field",v=>v.raw="PRIVATE_SENTINEL",true],
 ["quantity string",v=>v.quantity[0]="PRIVATE_SENTINEL",true],
 ["negative quantity",v=>v.quantity[0]=-1],
 ["oversized quantity",v=>v.quantity[0]=257],
 ["quantity tuple length",v=>v.quantity.push(0)],
 ["date row length",v=>v.dates[0].push(0)],
 ["date stage count",v=>v.dates.push([])],
 ["unknown status",v=>v.status="PRIVATE_SENTINEL",true],
 ["unsupported schema version",v=>v.schemaVersion=2],
 ["nonfinite date count",v=>v.dates[0][0]=NaN],
 ["fractional date count",v=>v.dates[0][0]=1.5],
]) {
 test(`${name} is rejected as invalid`,()=>{
  const input=valid(); mutate(input);
  if(containsPrivateText) assert.ok(JSON.stringify(input).includes("PRIVATE_SENTINEL"),"private-text fixture witness missing");
  const result=boundedParserDiagnostics(input);
  assert.deepEqual(result,{schemaVersion:1,status:"invalid"});
  if(containsPrivateText) assert.ok(!JSON.stringify(result).includes("PRIVATE_SENTINEL"));
 });
}
test("old absent observations remain explicitly unavailable",()=>{
 assert.deepEqual(boundedParserDiagnostics({schemaVersion:1,status:"unavailable"}),
  {schemaVersion:1,status:"unavailable"});
});

for (const bound of [0, 256]) {
 test(`dense parser tuples accept every count at ${bound}`, () => {
  const input = valid();
  input.quantity.fill(bound);
  for (const row of input.dates) row.fill(bound);
  assert.deepEqual(boundedParserDiagnostics(input), input);
 });
}

// Direct callers can supply sparse arrays; JSON transport cannot encode holes.
for (const [name, select] of [
 ["quantity", input => input.quantity],
 ["date row", input => input.dates[0]],
 ["date stages", input => input.dates],
]) {
 for (const [position, indexFor] of [
  ["first", () => 0],
  ["middle", length => Math.floor(length / 2)],
  ["last", length => length - 1],
 ]) {
  test(`${name} rejects a ${position} hole`, () => {
   const input = valid();
   const tuple = select(input);
   const index = indexFor(tuple.length);
   delete tuple[index];
   assert.equal(Object.hasOwn(tuple, index), false);
   assert.deepEqual(boundedParserDiagnostics(input), {schemaVersion:1,status:"invalid"});
  });
 }
 test(`${name} rejects an entirely sparse tuple`, () => {
  const input = valid();
  const tuple = select(input);
  for (let index = 0; index < tuple.length; index++) delete tuple[index];
  assert.equal(Object.keys(tuple).length, 0);
  assert.deepEqual(boundedParserDiagnostics(input), {schemaVersion:1,status:"invalid"});
 });
 test(`${name} rejects an inherited index despite a valid value`, () => {
  const input = valid();
  const tuple = select(input);
  const index = Math.floor(tuple.length / 2);
  const inherited = tuple[index];
  delete tuple[index];
  Object.setPrototypeOf(tuple, Object.create(Array.prototype, {
   [index]: {value: inherited, configurable: true},
  }));
  assert.equal(Object.hasOwn(tuple, index), false);
  assert.equal(tuple[index], inherited);
  assert.deepEqual(boundedParserDiagnostics(input), {schemaVersion:1,status:"invalid"});
 });
 for (const [label, value] of [["undefined", undefined], ["null", null]]) {
  test(`${name} rejects an own ${label} entry`, () => {
   const input = valid();
   const tuple = select(input);
   tuple[0] = value;
   assert.equal(Object.hasOwn(tuple, 0), true);
   assert.deepEqual(boundedParserDiagnostics(input), {schemaVersion:1,status:"invalid"});
  });
 }
 for (const mode of ["hole", "undefined"]) {
  test(`${name} JSON transport converts ${mode} to rejected null`, () => {
   const input = valid();
   const tuple = select(input);
   if (mode === "hole") delete tuple[0];
   else tuple[0] = undefined;
   const transported = JSON.parse(JSON.stringify(input));
   assert.equal(Object.hasOwn(select(transported), 0), true);
   assert.equal(select(transported)[0], null);
   assert.deepEqual(boundedParserDiagnostics(transported), {schemaVersion:1,status:"invalid"});
  });
 }
}

// Wire-v1 positions and dimensions must fail a test when producer enums drift.
test("collector dimensions match the committed Dart predicate enums", () => {
 const source=readFileSync(new URL("../../../apps/mobile/lib/receipt_ocr_capture/receipt_ocr_preview.dart",import.meta.url),"utf8");
 const enumCount=(match,name,expected)=>{
  assert.ok(match,`missing ${name}`);
  const values=match[1].replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/[^\n]*/g,"").split(",").map(v=>v.trim()).filter(Boolean);
  assert.ok(values.every(v=>/^[A-Za-z_]\w*$/.test(v)),`unsupported enum shape ${name}`);
  assert.equal(new Set(values).size,values.length);
  assert.deepEqual(values,expected,`wire-v1 enum order changed: ${name}`);
  return values.length;
 };
 assert.equal(evidence.parserDiagnosticQuantityCount,enumCount(source.match(/enum\s+ReceiptOcrQuantityPredicate\s*\{([^}]*)\}/),"ReceiptOcrQuantityPredicate",["candidate","pricedRow","rowMatched","separateDigitCell","geometryPresent","separatedCells","headingFound","headingGeometry","underQuantityHeading","underItemHeading","alignedRun","accepted","failPricedRow","failRowMatch","failDigitCell","failGeometry","failSeparatedCells","failHeading","failHeadingGeometry","failHeadingOwnership","failRunAlignment"]));
 assert.equal(evidence.parserDiagnosticDateCount,enumCount(source.match(/enum\s+ReceiptOcrDatePredicate\s*\{([^}]*)\}/),"ReceiptOcrDatePredicate",["namedMonth","eastAsian","yearFirst","slash","separated","middleDot","validCandidate","invalidCandidate","stayExcluded","primaryRole","secondaryRole","otherRole","conflict","selected","stayOnly","noSelection","selectedPrimary","selectedSecondary","selectedOther"]));
 assert.equal(evidence.parserDiagnosticDateStageCount,enumCount(source.match(/enum\s+ReceiptOcrDateStage\s*\{([^}]*)\}/),"ReceiptOcrDateStage",["original","normalized","projected"]));
});
