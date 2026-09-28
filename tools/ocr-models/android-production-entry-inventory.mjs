// Exact reviewed APK entry identities are keyed by the tracked source tree.
// The inventory file itself is excluded from that tree fingerprint to avoid a
// circular commitment when adding a newly reviewed package representation.
// An older package digest is never accepted for a changed source tree.
export const expectedAndroidPackageDigestsBySource = Object.freeze({
  // #1309 itemized service and meter-reading boundary at b928e24d. A clean
  // Flutter 3.44.8 Release projection passed archive/path, catalog, model,
  // resource, and fixture-absence gates before this ZIP identity. Local
  // signer was mocked; hosted exact-source signer proof remains required.
  "fd9f0b94778ea20d5369276a97addb389067e8bb18c6e38ba22eed77193f12ed": Object.freeze([
    "56c4d5ad6017053df7cba8613a58ca94a05dd80c59ec841660fa83d697eaaeb3",
  ]),
  // #1309 itemized delivery-fee charge-table boundary at 62ba721d. A clean
  // Flutter 3.44.8 Release projection passed archive/path, catalog, model,
  // resource, and fixture-absence gates before this ZIP identity. Local
  // signer was mocked; hosted exact-source signer proof remains required.
  "0ee3295f576b52f517e4569b70b5653c0a4ee98eb65e4633d6cc6c74e334979b": Object.freeze([
    "dfa8c7c790fd6fad66659359d0f5e880cd93d224c8259022438ffeac3ccbe8a2",
  ]),
  // #1309 split-currency charge-table and header boundary at 2b10eab5.
  // A clean Flutter 3.44.8 Release projection passed archive/path, catalog,
  // model, resource, and fixture-absence gates before this ZIP identity.
  // Local signer was mocked; hosted exact-source signer proof remains needed.
  "49447f19da8c23ab634850180eda9967e5be22baf4c2d065b73d05a23a527d60": Object.freeze([
    "78fdefc77f5d4bd8154bec73f2c02bb38ba25636f452ade60d0309c3753162af",
  ]),
  // #1309 charge-table account-summary boundary at 4aaf1c91. A clean
  // Flutter 3.44.8 Release projection passed archive/path, catalog, 14-model,
  // legal-resource, and 102-fixture-absence gates before this ZIP identity.
  // Local signer was mocked; hosted exact-source signer proof remains needed.
  "1f069702579b6f03e4862f2d63aad4427b835ae1f092840a8330bc61469380e4": Object.freeze([
    "8aca2ddc8fff5dd43d87ee95167fc930c04d39ee37758c4b4a54c6f11759bb39",
  ]),
  // #1309 account-summary guards and bounded item-cell evidence at 6f98d435.
  // A clean Flutter 3.44.8 Release projection passed archive/path, catalog,
  // 14-model, legal-resource, and 102-fixture-absence gates before this exact
  // ZIP representation. Local signer was mocked; hosted signer proof remains.
  "cc6c047944289aec88d7e14c8013c889a30ff632020a52728b6472f363e7f3fb": Object.freeze([
    "977bd26e41346edc1a8a4e86a5b4a900fd1b01ae38479cb9986ba2a076853961",
  ]),
  // #1309 localized tender, quantity-cell, native-digit, and split-currency
  // geometry corrections at 5929ed34. A clean Flutter 3.44.8 Release
  // projection passed archive/path, catalog, 14-model, legal-resource, and
  // 102-fixture-absence gates before this exact ZIP representation. The local
  // signer was mocked; hosted exact-source signer proof remains required.
  "9fe82ae8514b2282b09bedb9cb63e0ffb5d9d65d1c0269d117177d94271ddb33": Object.freeze([
    "c016a19d3f5d04acdbeb9b9f524ec205597fe18f77f7eaa09d413bfb209bb985",
  ]),
  // #1309 layout-cell currency and cross-currency review arithmetic at
  // 8f6bd8c3. A clean Flutter 3.44.8 Release projection passed archive/path,
  // catalog, 14-model, legal-resource, and 102-fixture-absence checks before
  // this local ZIP representation. Local signer was mocked; hosted exact-
  // source signer proof remains required.
  "906f0c803d205bb7f64005473c80b096d41a46a30e61ffe8d29500f5e34e9d88": Object.freeze([
    "2be530ecfe60c89a09e5a40b98e448b186dba2ac6ae870506848423c082445b7",
  ]),
  // #1309 general layout-cell and explicit-currency total ranking at
  // b1349249. A clean Flutter 3.44.8 Release projection passed archive/path,
  // catalog, 14-model, legal-resource, and 102-fixture-absence checks before
  // this local ZIP representation. Local signer was mocked; hosted exact-
  // source signer proof remains required.
  "c58a05e03d0cb597ae81a24812edbc405677695d5c0d95a129cf079b5cb97c71": Object.freeze([
    "432fae20c638617739c18c71da0eb74243563b89313db31bb9440bcdbd41c4ba",
  ]),
  // #1309 Arabic amount and priced-product metadata corrections at ce7028fc.
  // A clean Flutter 3.44.8 Release projection passed archive/path, catalog,
  // 14-model, legal-resource, and 102-fixture-absence checks before yielding
  // this exact local ZIP representation. Local signer was mocked; hosted
  // exact-source signer proof remains required.
  "f3d2501463d7ca0f7e9768cae59b9af217d0ec54aa48d40bfb9d2289e0fcaf85": Object.freeze([
    "f10139afd466837cf948d284c77c398417a0f422c12ca0dab9b28fc0fc0dea72",
    // Exact-source ubuntu-24.04 representation observed only after the hosted
    // signer, archive, catalog, model, and fixture-absence gates passed.
    "6a5f5efcd30a484ac80afd646adbd859f1a1cbf6966a75b79528abb4492630d8",
  ]),
  // #1309 bounded rate-cell cleanup and complete recognition coverage at
  // 4d7bbc63. Clean Flutter 3.44.8 Release projection passed archive/path,
  // catalog, model, legal-resource, and 102-fixture-absence checks before
  // yielding this exact local ZIP representation. Local signer was mocked;
  // hosted exact-source signer proof remains required.
  "e2d1807b5db6796429ac7128a7cc56002e7d4b74cad6d8afbc5b79957df4984a": Object.freeze([
    "908edd14615fe3b85a1d2f004d3ec742cc913eb0572aabd6a38738be61bcc5ae",
    // Exact-source ubuntu-24.04 representation observed only after the hosted
    // signer, archive, catalog, model, and fixture-absence gates passed.
    "380da707839caab3b12350e8fd2f878a4b92b5cb5c34ec4272dd69ecf329c856",
  ]),
  // #1309 layout and semantic review corrections at c9c6cde6. A clean Flutter
  // 3.44.8 Release projection passed archive/path, catalog, 14-model,
  // legal-artifact, and 102-fixture-absence checks before this ZIP digest.
  // The local signer was mocked; hosted exact-source proof is still required.
  "2cb681eb4c941ff1d2f5530c5d4ded8f393ebc11af63a2e50f561b41dfec2662": Object.freeze([
    "0b19fc3d782040d0053af54d577fc6fd77eed45283028a98f22e6a7e5c634e71",
  ]),
  // #1309 repeated organization identity and unit-bearing charge columns at
  // 0b0d321e. A clean Flutter 3.44.8 Release projection passed archive/path,
  // catalog, 14-model, legal-artifact, and 102-fixture-absence checks before
  // this ZIP digest. The local signer was mocked; hosted proof is still needed.
  "5f14773a23a90c2db299aaa0529f3f780fc7716d4d150dad813dce8d1daf1c04": Object.freeze([
    "ba9a1ec334ee0137b46773b44d289976e99d8a414529bcc9a7204e018f884df3",
  ]),
  // #1309 shifted charge-table amount cells at 2da1e7b7. A clean Flutter
  // 3.44.8 Release projection passed archive/path, catalog, 14-model,
  // legal-artifact, and 102-fixture-absence checks before this ZIP digest.
  // The local signer was mocked; hosted exact-source proof remains required.
  "2ca629aba09419a26e77f3cb3395ab2428ef067ec3db6f69009b6eff9352f939": Object.freeze([
    "c227c8966458c7d3c0f97bcd10e437660b795792ae28cd5c70fdfe9e27aa4fbf",
  ]),
  // #1309 layout-aware charge-table candidate at 5868443e. Clean Flutter
  // 3.44.8 Release projection passed archive/path, catalog, 14-model,
  // legal-artifact, and 102-fixture-absence checks before this local ZIP digest.
  // Local signer was mocked; hosted exact-source signer proof remains required.
  "2b0a91ea113941e393f8d268726cb5eca4edb641327f450bf5d30ad49f35b94e": Object.freeze([
    "414792dd034e478ef434bd5027aa64acf0af798025b99a3082feb0245dd0244d",
  ]),
  // #1309 adjacent-row association at 39495792. A clean Flutter 3.44.8
  // production projection passed archive/path, catalog, model, legal-artifact,
  // and 102-fixture-absence checks before yielding this local ZIP representation.
  // Local signer was mocked; hosted exact-source signer proof remains required.
  "6d32623592dd887a58a1d3526b9817326082293b94fa70ef61a5a037bbaafea2": Object.freeze([
    "318a57751b5d94945d340dccb7f331a5780f34a8ab843f3b2f945e9154f09dca",
  ]),
  // #1309 matched-item amount and partial-payment ranking at 33733c6f. A
  // clean Flutter 3.44.8 production projection passed archive/path, catalog,
  // model, legal-artifact, and 102-fixture-absence checks before yielding this
  // local ZIP representation. Local signer was mocked; hosted proof is needed.
  "75471c84044d9f769f3abd71bd6f7ddd4ac069d1708269484b86534004d8abf8": Object.freeze([
    "4236c62518a270fd275571727f9515ea41f495a9035eec1ce67d419b84530298",
  ]),
  // #1309 attached-code item guard at 35a386ca. A clean Flutter 3.44.8
  // production projection passed archive/path, catalog, model, legal-artifact,
  // and 102-fixture-absence checks before yielding this local ZIP representation.
  // The local signer was mocked; hosted exact-source proof is required.
  "8d988520518bf767fb90157c22f4f1cd49a2fdb5587c10c4e0fd0707dbb99cd3": Object.freeze([
    "c3e8ec66c90b7da9427e99e882d93fe630d8e280f75c73f4921da5eb123b629e",
  ]),
  // #1309 bounded native failure recovery at 118b5d7d. A clean Flutter 3.44.8
  // production projection passed archive/path, catalog, model, legal-artifact,
  // and 102-fixture-absence checks before yielding this local ZIP representation.
  // The local signer was mocked; hosted exact-source proof is required.
  "039ddf17785068462986551f2a3a473c1ceb95fddfbe070a1c4758fe81438eb3": Object.freeze([
    "e5b1793ae65c9d803d590a5dc31275669a191684a72b24131d754487189680cd",
    // Exact-source ubuntu-24.04 representation observed only after the hosted
    // signer, archive, catalog, model, and fixture-absence gates passed.
    "543fd6536817ac52c5d44ffaa2e07860746684468c4e19ec3bc861061df13d57",
  ]),
  // #1309 currency-prefix total role at 7ddddd2b. A clean Flutter 3.44.8
  // production projection passed archive/path, catalog, model, legal-artifact,
  // and 102-fixture-absence checks before yielding this local ZIP representation.
  // The local signer was mocked; hosted exact-source proof is required.
  "ffa671fa27a81a3016d20506b185f45de0c6a1676eeec512353ba62e36b9c3c9": Object.freeze([
    "90d33712050059a259ecf9cfbed76ba8bcdf7696b68d0dbe89bced93f084c1a6",
  ]),
  // #1309 complete manifest-bound recognition coverage at aa7623b0. A clean
  // Flutter 3.44.8 production projection passed archive/path, catalog, model,
  // legal-artifact, and 102-fixture-absence checks before yielding this local
  // ZIP representation. The local signer was mocked; hosted proof is required.
  "86863451ad7d9d350265459d2d06e0f07651004784cca89c613c32bde59f4792": Object.freeze([
    "6f548a7014f4b2d3382a3ec2da8351a5b88c0b8e42195042f612e7f42bfa5ad8",
  ]),
  // #1309 bounded row-coverage evidence at 01a2b3b1. A clean Flutter 3.44.8
  // production projection passed archive/path, catalog, model, legal-artifact,
  // and 102-fixture-absence checks before yielding this local ZIP representation.
  // The local signer was mocked; hosted exact-source proof is required.
  "568fc67f7d02acee30474ee71aadb6c4d299165f760cf7747ef3c788e76ed536": Object.freeze([
    "ddf936f50e52cb7e4fad0d6c304ab78ecbf1803e1344b5be61b0001c554133c2",
  ]),
  // #1309 short-name merchant correction at e972a49d. A clean Flutter 3.44.8
  // production projection passed archive/path, catalog, model, legal-artifact,
  // and 102-fixture-absence checks before yielding this local ZIP representation.
  // The local signer was mocked; hosted exact-source proof is required.
  "aa4c6602496621fa469317b5701f18e7176886c7c4a5a05548435f53dc8f0c41": Object.freeze([
    "739af61a9488efeaf0dbf82fdc33c1ac5a02efb581790f31b6122b693a98d97b",
  ]),
  // #1309 merchant/total-role correction at cf87cfac. A clean Flutter 3.44.8
  // production projection passed archive/path, catalog, model, legal-artifact,
  // and 102-fixture-absence checks before yielding this local ZIP representation.
  // The local signer was mocked; hosted exact-source proof is required.
  "f064566afdd744ec2196bcbfdabfdd4beaaab64620ecacfb2197b40b7eb01016": Object.freeze([
    "4ac5a6eca0c2c692feb338879516f83f6515230f62d5063a6b1088a1ab0761c0",
  ]),
  // #1309 single-amount charge-table correction at 575619e2. A clean Flutter
  // 3.44.8 production projection passed archive/path, catalog, model,
  // legal-artifact, and 102-fixture-absence checks before yielding this local
  // ZIP representation. The local signer was mocked; hosted proof is required.
  "009bf2707dea96a1f1f49e6f33d1dc3055149a59615407dc003b20561863db2b": Object.freeze([
    "a178eebcef1b096f1dc654b6c665342afc6c3d8eb760e9830a6204bcfb142c5c",
  ]),
  // #1309 charge-table candidate at c6a7cab2. A clean Flutter 3.44.8
  // production projection passed archive/path, catalog, model, legal-artifact,
  // and 102-fixture-absence checks before yielding this local ZIP representation.
  // The local signer was mocked; hosted exact-source signer proof is required.
  "8706ddb4c707dfecff8f301bded266773d8e1d8daa7bdaa9844e558e92d54a61": Object.freeze([
    "ca326a29a0481acffd40c3cf3f0ff6b15c2322bbd55c5b2589f56592b433f301",
  ]),
  // #1309 merchant-boundary correction at 1d7591fc. A clean Flutter 3.44.8
  // production projection passed archive/path, catalog, model, legal-artifact,
  // and 102-fixture-absence checks before yielding this local ZIP representation.
  // The local signer was mocked; hosted exact-source signer proof is required.
  "6ab84b039fee9486fdcd1283e2e8407ab8b2ca030a2a03935dcfbc905bee539d": Object.freeze([
    "c7edba79696e5f6f102aa062c8eae007b2ae20d9c999a3ae828d88eab49f5a7d",
  ]),
  // #1309 field-role correction at a5e2b73a. A clean Flutter 3.44.8
  // production projection passed archive/path, catalog, model, legal-artifact,
  // and 102-fixture-absence checks before yielding this local ZIP representation.
  // The local signer was mocked; hosted exact-source signer proof is required.
  "30feb3996a689088efffc7e1fc91f11aaa2d91baa8078bb967c532eb18858c0a": Object.freeze([
    "6c78bb21b509b1705a0f0de51713e2486b1776ba5549b45c413337948be02677",
  ]),
  // #1309 quantity-role correction at cba630b0. A clean Flutter 3.44.8
  // production projection passed archive/path, catalog, model, legal-artifact,
  // and 102-fixture-absence checks before yielding this local ZIP representation.
  // The local signer was mocked; hosted exact-source signer proof is required.
  "0a95e089d1095e6b2c8230673dc880a40d4765bb78956f73fe1fb78b89edec9e": Object.freeze([
    "9053ceb3f2637a22ed5de1728d36f988692a51ea2ebe4bd5c9f76413c835b671",
  ]),
  // #1309 semantic review correction at 8a554e1b. A clean Flutter 3.44.8
  // production projection passed archive/path, catalog, model, legal-artifact,
  // and 102-fixture-absence checks before yielding this local ZIP representation.
  // The local signer was mocked; hosted exact-source signer proof is required.
  "b4b2484465038d075ea5cc499b46441b6331e8e27ab8d545982d37e182a65449": Object.freeze([
    "5b582be7e9f438579df22dbfd2ff56125d1f71700f61be36692b4ef59fe49155",
  ]),
  // #1309 semantic correction at feecd536. A clean Flutter 3.44.8 production
  // projection passed archive/path, catalog, model, legal-artifact, and
  // 102-fixture-absence checks before yielding this local ZIP representation.
  // The local signer was mocked; hosted exact-source signer proof is required.
  "a300eb6e844cdf8621e70e183fb33f978a19c83a17b4c39a3bbfe91fc82929f5": Object.freeze([
    "369494bad964d6d138e631ce7e9bb56427fc227af1434a932a943423a3b31013",
  ]),
  // #1309 semantic candidate at 33d9a735. A clean Flutter 3.44.8 production
  // projection passed archive/path, catalog, model, legal-artifact, and
  // 102-fixture-absence checks before yielding this exact local ZIP digest.
  // The local signer was mocked; hosted exact-source signer proof is required.
  "afd1df0b445deaead1f0bc8656a9c7b60415ad8dba40f6eec7409cc7d4fec5e7": Object.freeze([
    "18d01ebbd7c471c544f4aa4462bbda907889cdc49e439ff6dc54e916fa280593",
  ]),
  // Exact unsigned iOS Flutter notices-byte identity correction. Clean
  // Flutter 3.44.8 local Release APK passed archive/path, catalog,
  // 14-model and 102-fixture-absence gates; local signer was mocked. Exact-
  // source hosted job 108872290180 passed signer and the preceding package
  // gates before reporting its distinct ZIP entry representation below.
  "2650b765e38af3aa13415a3d50aab1a57dc91fb6ada0c02ca03cfd1f348280d9": Object.freeze([
    "f937385c8eee270bf345ba67b9278f32d7e103cb2b91f25789b67b21965b4420",
    "11e40b7dfa8fdb0f8df5c43c0c171e7cb1cc9d6e11c544d662b0a462eafcb029",
  ]),
  // #1308 real-provider UI item Apply probe bound to the trusted catalog.
  // Clean Flutter 3.44.8 local Release APK passed archive/path, catalog,
  // 14-model and 102-fixture-absence gates; local signer was mocked. Exact-
  // source hosted job 108854321587 passed signer and the preceding package
  // gates before reporting its distinct ZIP entry representation below.
  "37979935da129fbe3dbbbcd2c603f8d977ba4ceeb8cc9bd860fe0d096aef59d6": Object.freeze([
    "ef7c7dbae79a7c60ff2094aeda5b003af35f2410bac2230a90e0d197008475a6",
    "11e40b7dfa8fdb0f8df5c43c0c171e7cb1cc9d6e11c544d662b0a462eafcb029",
  ]),
  // Exact #1308 historical unsigned iOS 63-resource bundle commitment and
  // regression. A clean Flutter 3.44.8 local Release APK passed archive/path,
  // catalog, model, and fixture checks; the local signer was mocked. The
  // exact-source hosted verifier in job 108820453536 then passed signer,
  // archive/path, catalog, 14-model and 102-fixture-absence checks before
  // reporting its ZIP representation below.
  "040d6fe6da41a3e91c18e75eb6758f384e9415daaebc025d89d447fd87cd9302": Object.freeze([
    "d575dee83029a546907fbeb5a9daada14c353a2530e6f28fe8660016a80f9419",
    "f056e2f9e16d7c3f9d882939fd1d5cc6a4c12ff3cbf31ff2b16c5efe4f535c09",
  ]),
  // Exact #1308 historical unsigned iOS bundle-string correction and bounded
  // bundle inventory, including regular-directory traversal. Clean Flutter
  // 3.44.8 local Release APK passed strict path/catalog/model/fixture gates;
  // local signer was mocked. Exact-head hosted proof is pinned below.
  "a19d9d8cd61e4936a572e73cc2a1953f25c9825dce55b4dd57e823b8e51db0b4": Object.freeze([
    "0cce1b640e260c26e249ad5ab864b84435561a495794bb0fd4b4a5f1d8fc14b8",
    // Fresh clean local projection from the same source fingerprint passed
    // catalog/model/fixture/path gates; signer was mocked locally.
    "104cb1d6c6acbf58cccc14510842cb2cf91a79f8b2b9d1a683ce9903a3079a09",
    // Exact-head hosted job 108785333039 passed signer, archive/path,
    // catalog, 14-model and 102-fixture-absence gates before reporting ZIP bytes.
    "f056e2f9e16d7c3f9d882939fd1d5cc6a4c12ff3cbf31ff2b16c5efe4f535c09",
  ]),
  // Exact #1308 iOS fixed-baseline privacy metadata correction. Clean Flutter
  // 3.44.8 local Release APK passed path/catalog/model/fixture gates; signer
  // was mocked locally. Exact-head hosted signer and ZIP proof remain required.
  "12bbd5f7006e6db4bf89e701fd611bb458fe8752eea5f72eb9842b7ef3278c95": Object.freeze([
    "0250d5e5f81e9788f7094a585bd7d6579475e6d49c01ce3f9152d5319f89dd99",
    // Exact-head hosted job 108754479056 passed signer, archive/path,
    // catalog, 14-model and 102-fixture-absence checks before reporting ZIP bytes.
    "f056e2f9e16d7c3f9d882939fd1d5cc6a4c12ff3cbf31ff2b16c5efe4f535c09",
  ]),
  // Exact six-path #1308 candidate after the rotated acceptance bound and
  // fixed-baseline iOS privacy manifest correction. Clean Flutter 3.44.8
  // local Release APK passed preceding package gates; signer is mocked.
  "6300728711f17cee677ed7edc705aee350768eb1b980770fd180003b95d85538": Object.freeze([
    "4e1a2f4b45b11c7b47b5b81db47e7f626d2750f621899e5f60d2f713920ca4aa",
    // Exact-head hosted job 108727015032 passed signer, archive/path,
    // catalog, model, and fixture-absence gates before reporting these bytes.
    "f056e2f9e16d7c3f9d882939fd1d5cc6a4c12ff3cbf31ff2b16c5efe4f535c09",
  ]),
  // Bounded hash-only iOS privacy-bundle diagnostic. The exact synthetic
  // source tree passed the strict local Release APK path/catalog/model/fixture
  // gates; its signer is mocked until exact-head hosted proof is available.
  "91b15758f9969a97a964faf0f9e48078683193dbe3eb691314f43b0ec4e29f36": Object.freeze([
    "b7776c6168400be59fa5dc89e84a0a966d473104fc036f6759682d366cdad0de",
    // Exact-head hosted job 108699296493 passed signer, archive/path,
    // catalog, model, and fixture-absence gates before reporting these bytes.
    "74a1233184417c2665c91494b4c92c00f58803e841649666d52c7749dacb0efd",
  ]),
  // Hash-only iOS pre-native baseline diagnostic. The clean Flutter 3.44.8
  // local Release projection passed the strict archive, catalog, 14-model,
  // and 102-fixture-absence gates; local signer was mocked. Hosted signer and
  // any distinct hosted ZIP representation still require exact-head proof.
  "9fcfa9b67a83fb6ef398976bac73d9197288bcee5cba12f72f154cb0e5315e56": Object.freeze([
    "6cc699ded0865e4a1dc8d151d9d1e3ae7c9466de33bf0e588bb9750bb689f88e",
    // Exact-head hosted job 108673627231 passed signer, archive/path,
    // catalog, model, and fixture-absence gates before reporting these ZIP bytes.
    "74a1233184417c2665c91494b4c92c00f58803e841649666d52c7749dacb0efd",
  ]),
  // Pre-native iOS baseline privacy-bundle dispatch and its regression test.
  // The clean Flutter 3.44.8 local Release projection passed the path,
  // catalog, model, and fixture gates. Local signer was mocked. Exact-head
  // hosted job 108645294547 passed signer and all preceding package gates
  // before reporting its distinct ZIP entry representation.
  "9e72b805550bef58f7c4adcc9bee78ddbe472dcd31533c44e9fa807d216cf199": Object.freeze([
    "7c24dd947a94f3ece1c792d755f6ff1e0804c39d8064594f84a9aa4c2af3f878",
    "74a1233184417c2665c91494b4c92c00f58803e841649666d52c7749dacb0efd",
  ]),
  // Five exact fixed-baseline iOS bundle resources and both previously
  // observed hosted Android ZIP representations. A clean Flutter 3.44.8
  // local Release projection passed catalog/model/fixture gates; local signer
  // was mocked. Exact-head hosted job 108620251044 then passed signer, path,
  // catalog, model, and fixture-absence gates before reporting its ZIP bytes.
  "a855002e93fb9ed135861023652e35563ff2f92aeaae77d65e2d3c1e255f2c11": Object.freeze([
    "e928940c7b65e3d881cd126b24b9a0fbedcc9af09fd0ba6d53be223707c2321c",
    "74a1233184417c2665c91494b4c92c00f58803e841649666d52c7749dacb0efd",
  ]),
  // CodeQL-safe test harness follow-up. Clean Flutter 3.44.8 local Release
  // projection passed the preceding package gates; exact-head hosted signer
  // and ZIP representation were subsequently observed in job 108595661268.
  "814deb9875aec475afdc5e4f09cb480a6103c179e86cb756f3c3fd66c3eddfcc": Object.freeze([
    "1dbe9ec92e70552877672cff4a17f2a0ef91b32bfbfa8229652e9545ee1ac0e2",
    // Exact-head hosted job 108595661268 passed signer, path, catalog,
    // model, and fixture-absence gates before reporting this ZIP representation.
    "74a1233184417c2665c91494b4c92c00f58803e841649666d52c7749dacb0efd",
  ]),
  // Fixed pre-native iOS size-baseline string pin and bounded inventory.
  // A clean Flutter 3.44.8 local Release projection passed the preceding
  // Android package gates; exact-head hosted signer and ZIP representation
  // were subsequently observed in job 108593888025.
  "8e074f30fc1493fce49143000d934c5a509bab59ae909da271bef509ab248aa5": Object.freeze([
    "1dbe9ec92e70552877672cff4a17f2a0ef91b32bfbfa8229652e9545ee1ac0e2",
    // Exact-head hosted job 108593888025 passed signer, path, catalog,
    // model, and fixture-absence gates before reporting this ZIP representation.
    "74a1233184417c2665c91494b4c92c00f58803e841649666d52c7749dacb0efd",
  ]),
  // Bounded baseline bundle diagnostic. Clean Flutter 3.44.8 local Release
  // projection and exact-head hosted signer/path/catalog/model/fixture-absence
  // gates passed before the hosted ZIP representation was reported.
  "52e2f77b7a316dbcf9506c46b1e948d03a54bffddf7cb299296703e571f667d4": Object.freeze([
    "9a515f8e843b057219186fbfb74cd628a91fdd8aa088f3b9217d34892e567232",
    // Exact-head hosted job 108568916721 passed signer, path, catalog,
    // model, and fixture-absence gates before reporting this ZIP representation.
    "74a1233184417c2665c91494b4c92c00f58803e841649666d52c7749dacb0efd",
  ]),
  // Strict Android numeric network-denial probe and bound acceptance source.
  // Clean Flutter 3.44.8 local Release projection passed preceding package
  // gates; hosted signer and ZIP representation remain required.
  "e7fee1ae373984bafa2f9bed4f91162c9784f4521714f3c9484af571272caa56": Object.freeze([
    "8cb1e3a896d2340cef74f2af33e6de67b3459e2ccc0b1d18f4d64d4846433929",
    // Exact-head hosted job 108563504199 passed signer, path, catalog,
    // model, and fixture-absence gates before reporting this ZIP representation.
    "74a1233184417c2665c91494b4c92c00f58803e841649666d52c7749dacb0efd",
  ]),
  // UI Apply probe and its updated acceptance-source catalog binding.
  // Clean Flutter 3.44.8 local Release projection passed preceding package
  // gates; hosted signer and ZIP representation remain required.
  "aa32e13140671dfc2be71e14a43f68d4820a35353b64a09d8b72ca452e86ea08": Object.freeze([
    "432e00d5724ced434d8e29a4c72187bac2ae10137d68799b0d5ef811a1eb200d",
    // Exact-head hosted job 108558777700 passed signer, path, catalog,
    // model, and fixture-absence gates before reporting this ZIP representation.
    "0101dd81f65d5d0f3f764ca73a6112bc2693bb2a457534dc6a35f36e4433e6c6",
  ]),
  // Exact file_picker privacy Info.plist byte pin. A clean Flutter 3.44.8
  // local Release projection passed preceding package gates; hosted signer
  // and ZIP representation remain required on the published corrective head.
  "1ae553959f18be6bc8219f972ec89fd16a88e5ca1bc1c2c97b7aab90addeb6f6": Object.freeze([
    "dc7d506d46f511d047d9c14cf6ca5ce2cece1f73b15b6f2def29c35c37b5eaee",
    // Exact-head hosted job 108550178930 passed signer, path, catalog,
    // model, and fixture-absence gates before reporting this ZIP representation.
    "33c26b3d1dd0039e6c2d6f3135234df27dfa75423b13a438eb21da4597f91dbc",
  ]),
  // Exact hosted file_picker privacy manifest byte pin. Clean Flutter 3.44.8
  // local Release projection passed preceding package gates; hosted signer
  // and ZIP representation remain required on the published corrective head.
  "0b42e9199bdf90e38df1771642469ec0dc5747a52a6c83f489ebf6fee4e1398c": Object.freeze([
    "adba54b2422a08e922e54a697b3c4cb75714c6c86110294bdfbfe11ec8c5b292",
    // Exact-head hosted job 108530881169 passed signer, path, catalog,
    // model, and fixture-absence gates before reporting this ZIP representation.
    "33c26b3d1dd0039e6c2d6f3135234df27dfa75423b13a438eb21da4597f91dbc",
  ]),
  // Exact hosted nanopb privacy Info.plist byte pin. Clean Flutter 3.44.8
  // local Release projection passed preceding package gates; hosted signer
  // and ZIP representation remain required on the published corrective head.
  "de978656b8fbd24192575f3b29bd73710d71894fc6440f8562eab88e3c53dd7e": Object.freeze([
    "c0e9a68490d62eddf4cbdb5b24e8eda74c0245871de12e65760c00cd2aabb35a",
    // Exact-head hosted job 108512126886 passed signer, path, catalog,
    // model, and fixture-absence gates before reporting this ZIP representation.
    "33c26b3d1dd0039e6c2d6f3135234df27dfa75423b13a438eb21da4597f91dbc",
  ]),
  // Exact hosted-observed nanopb privacy-manifest byte pin and bounded
  // unknown framework resource diagnostic. Clean Flutter 3.44.8 local Release
  // projection passed inventory; hosted signer and ZIP proof remain required.
  "e6f2428d48e645cbcff7bf952f1243600821786bfd9815e808c85f96f0708db7": Object.freeze([
    "cb31d67add34e5443445f788a6f2d8b02e17726f2b3523a9cf664c9bcd0fc623",
    // Exact-head hosted job 108492991785 passed signer, path, catalog,
    // model, and fixture-absence gates before reporting this ZIP representation.
    "33c26b3d1dd0039e6c2d6f3135234df27dfa75423b13a438eb21da4597f91dbc",
  ]),
  // Exact hosted iOS privacy plist byte pin and fail-closed nanopb privacy
  // manifest diagnostic. Clean Flutter 3.44.8 local Release projection passed
  // package inventory; hosted signer and ZIP representation remain exact-head proof.
  "29ce9b4b011121e4fcc3a2305fe5f99b94b450cc213f14994223b7f662ee9f54": Object.freeze([
    "f8b510c73c69e37699bbdbbd9e31c56efaad83e7a6343bcf3fb2446e67725876",
    // Exact-head hosted job 108472248533 passed signer, path, catalog, model,
    // and fixture-absence gates before reporting this ZIP representation.
    "33c26b3d1dd0039e6c2d6f3135234df27dfa75423b13a438eb21da4597f91dbc",
  ]),
  // Exact fail-closed iOS privacy-plist byte diagnostic. Clean Flutter 3.44.8
  // local Release projection passed package inventory; hosted signer and ZIP
  // representation remain exact-head proof.
  "ab62ebd54124119c657e4412fbd32907e90474f1509146f6097a8c748cc63d9f": Object.freeze([
    "3ba2634b0aafcf1d718d09d9c22a01d6f01345989aac5f4a0a2b9be7dc34d673",
  ]),
  // Exact hosted-observed iOS nested privacy plist follow-up. Clean Flutter
  // 3.44.8 local Release projection passed package inventory; hosted signer
  // and ZIP representation remain exact-head proof.
  "2dfc42f2f086ca7a81d480f004acd72e3e166043c007674ccdf7bff5e0088fc4": Object.freeze([
    "af0bd01c7f2fc5c40b76b5aac37ea9add4670f5f6ed4a4dc2df9aa44a91ee798",
  ]),
  // Exact hosted-review diagnostic follow-up. Clean Flutter 3.44.8 local
  // Release projection passed package inventory; hosted signer/ZIP proof
  // remains required on the published corrective head.
  "12140646eda88da668dbf6d279603034fefdad054077cc674cb8bb20e5844d8b": Object.freeze([
    "2732984b1dae606406fa407bd922b901c51b72dc4b6f168f3c4dbe6308c69d1a",
    // Independent clean exact-tree Flutter 3.44.8 local Release projection
    // passed preceding package gates with this ZIP representation.
    "7259e6c0bd82ddb2318e1188e63748d6b21bfa30aa17d45f0d8c3e2486a03ff4",
    // Exact-head hosted job 108427406634 passed signer, path, model, and
    // fixture-absence gates before reporting this ZIP representation.
    "33c26b3d1dd0039e6c2d6f3135234df27dfa75423b13a438eb21da4597f91dbc",
  ]),
  // Exact x86_64 simulator test link and observed nested privacy manifest.
  // Clean Flutter 3.44.8 local Release projection passed package inventory;
  // hosted signer and ZIP representation remain exact-head proof.
  "7debfded6dab18333d66ede85c651eab85a1584a8370b0526dbc0ece3a89ecd2": Object.freeze([
    "87bcf8e058f255a503fa746fab3d0350589ce668bc31ff7bcf2c6da52a96b278",
    // Exact-head hosted job 108417510446 passed signer, path, model, and
    // fixture-absence gates before reporting this ZIP representation.
    "33c26b3d1dd0039e6c2d6f3135234df27dfa75423b13a438eb21da4597f91dbc",
  ]),
  // Exact simulator architecture diagnostic and nested privacy bundle paths.
  // Clean Flutter 3.44.8 local Release projection passed the preceding
  // package gates; hosted signer and ZIP representation still need proof.
  "b8d252c86041cb25e7360aae2224b1981e938b091c503ac7b5f16a71c235dc74": Object.freeze([
    "397951d6b04074af9599863dd4ba24540e98b38e87b8b1ec1ba51b89aacda2ee",
    // Exact-head hosted job 108412705574 passed signer, path, model, and
    // fixture-absence gates before reporting this ZIP representation.
    "33c26b3d1dd0039e6c2d6f3135234df27dfa75423b13a438eb21da4597f91dbc",
  ]),
  // Exact iOS nested privacy path and bounded Xcode error-class follow-up.
  // Clean Flutter 3.44.8 Release projection passed the complete local
  // package inventory; hosted signer and ZIP representation still need proof.
  "c41e3b24269643cba64fbaec1dfffa747779fb3e212a2563e614d73416a3edd2": Object.freeze([
    "83de618ff72699dd536a521c901db7a15682826e0d131f9652177d18b64edb6a",
    // Exact-head hosted job 108408296023 passed signer, path, model, and
    // fixture-absence gates before reporting this ZIP representation.
    "33c26b3d1dd0039e6c2d6f3135234df27dfa75423b13a438eb21da4597f91dbc",
  ]),
  // Simulator Runner roots its own test-only link anchor and records the
  // observed iOS shader bytes. Clean Flutter 3.44.8 Release passed preceding
  // local package gates; hosted signer and ZIP representation need proof.
  "8919dccd7e8b2127eb6d425b7f12be7abe6e16833fa95883942b2bd7ca3bcb78": Object.freeze([
    "56c48d4e2765b6dc4542e15bb445b48381dd657d109055009c682cbc9260608f",
  ]),
  // Exact simulator needed-l link probe and trusted iOS notice-byte identity.
  // Clean Flutter 3.44.8 Release projection passed preceding local package
  // gates; hosted signer and ZIP representation remain exact-head proof.
  "e0585c22dadfd083e9131fe09b2777aff750cdc2f4c8b67c95be84e9c28e75f3": Object.freeze([
    "08e582da8d85657eea3f67bc2372b9a2d1510b2c1023aab7ec25e6721c4e09c7",
  ]),
  // Exact simulator forced-symbol link follow-up and bounded iOS asset-path
  // diagnostic. Clean Flutter 3.44.8 Release projection passed preceding
  // local package gates; hosted signer and ZIP representation need proof.
  "ee46898f12864323ed0f978a1279a3a28d02b2d6ea1364ab51b689586a2b2fc5": Object.freeze([
    "e5c67b451bd79f6f42d8db74df2942961bdfe0e1083285109d2db299e1db860c",
  ]),
  // Exact geometry-bound acceptance source and nested iOS privacy resource.
  // Clean Flutter 3.44.8 production-plugin Release projection passed the
  // preceding local package gates; hosted signer and ZIP representation
  // still require exact-head proof.
  "cb824935b15a5f5df86a31dc879f064bdba28d2ed06b3375e8dafaa5a920108b": Object.freeze([
    "3cb6d6166427f6575fed50d91103b31af73a104ec68870f64bb158334800b923",
  ]),
  // Simulator-only C link anchor and exact nested privacy resource. Clean
  // Flutter 3.44.8 local Release projection passed the preceding package
  // gates; hosted signer and ZIP representation require exact-head proof.
  "b5d1a225ff9ff282075c2c0696b9482a39a399f2f6c1a695d659d4df8a8dda37": Object.freeze([
    "c5271c7b8ac25ea19179ec324c994dc851454b33cabc7adb7e3349cd1fbe487d",
  ]),
  // Exact local Flutter 3.44.8 Release projection after the simulator-only
  // symbol probe and pinned Flutter engine resource inventory. Hosted signer
  // and ZIP representation still require this exact-source job evidence.
  "0dc6740398efde64750dd2fa1bb54726f97562f1b5d246d557c9e692b36fd190": Object.freeze([
    "281700fb57f84dca0a52cd970f29ed9616aa31c523f45ce5e1269c0f7a1a1c0e",
  ]),
  // The Runner simulator link now proves both inputs on one exact invocation;
  // iOS admits the observed GoogleUtilities plist.
  // Canonical Flutter 3.44.8 local APK strict verification passed; hosted
  // signer and ZIP representation remain exact-head requirements.
  "ecf77098a60ff25255ea9ec2852d847c5e4a5632e5642ba6a417f54ca109620c": Object.freeze([
    "7a3a7d935b7e8ce24dcf5b03f3e56a761d9ba87d014a43bd095c98c4ac05c2ff",
  ]),
  // Simulator-only forced load command replaces the failing Swift symbol
  // probe; exact GoogleUtilities privacy sibling is admitted on iOS. The
  // canonical Flutter 3.44.8 local APK passed strict package verification.
  // Hosted signer and ZIP representation remain exact-head requirements.
  "66660afee3239cfa866958d7a11fd1ec3c3d15b4a217111b222b6e90cc365e2d": Object.freeze([
    "7a3a7d935b7e8ce24dcf5b03f3e56a761d9ba87d014a43bd095c98c4ac05c2ff",
  ]),
  // Exact iOS nested privacy-bundle and bounded linker-diagnostic follow-up.
  // Canonical Flutter 3.44.8 plugin projection passed the strict local APK
  // verifier; exact-head hosted signer and ZIP evidence remain required.
  "40c99f472fa30946adbb1172b351e2d9ab6e60ed9d6ba9a4638738be4f40f813": Object.freeze([
    "7a3a7d935b7e8ce24dcf5b03f3e56a761d9ba87d014a43bd095c98c4ac05c2ff",
  ]),
  // Bounded stdin link diagnostics and actual-provider Apply option proof.
  // Exact Flutter 3.44.8 production-plugin projection passed local package
  // gates; the hosted signer and ZIP representation require exact-head proof.
  "b010342f4de3c20b9ce17b764c5c5396e54a9f535974a13046068e8d3090279a": Object.freeze([
    "7a3a7d935b7e8ce24dcf5b03f3e56a761d9ba87d014a43bd095c98c4ac05c2ff",
  ]),
  // Exact iOS native-link diagnostics and FBLPromises privacy path. The
  // retained clean Flutter 3.44.8 Release projection passed local catalog,
  // model, fixture-absence, path, and entry checks; hosted signer and ZIP
  // representation must still be proven on this exact source head.
  "48fde73c108b23cb362826bb1d0a175d18b6ffbf610e65943eece2ab63ea6db4": Object.freeze([
    "60fbb95aab20b7c5ed3cb59a9f5ca466a1f1221f954a265cc1c09910d231cd62",
  ]),
  // Simulator AppDelegate link probe and pinned UI fixture with exact
  // source-SHA guard. Clean Flutter 3.44.8 Release projection passed local
  // package gates; hosted signer and ZIP representation remain required.
  "54506c84415345f1aa112f43251b898707ce1713a67c8d0fea1535d5506dd35d": Object.freeze([
    "60fbb95aab20b7c5ed3cb59a9f5ca466a1f1221f954a265cc1c09910d231cd62",
  ]),
  // Exact simulator linker-search and nested privacy-resource follow-up.
  // Clean Flutter 3.44.8 Release projection passed local package gates;
  // hosted signer and ZIP representation remain required.
  "89abdc913e515e9e8653e522bc5908bce73714051ccadd504c143d4162763503": Object.freeze([
    "b5add95a4e2eba96f15e7b06b2b4830c16452fef4c29e29303c99e10d9293c8f",
    // Exact-head hosted job 108333798391 passed signer, path, catalog,
    // model, and fixture-absence checks before reporting this representation.
    "9a79e9675943035b6f9887de3b99f2de62ac39c210b7382956ffb63f34f0b985",
  ]),
  // Exact seven-path iOS simulator link and unsigned-resource follow-up.
  // Clean Flutter 3.44.8 Release projection passed every local package gate;
  // hosted signer and representation remain exact-head requirements.
  "231a09bad33fae0a509fcd633848a95cba9c43c976e543586a13407d97226b0a": Object.freeze([
    "abe08a0d15e5c042ec0ade32354c4113da2d683120083525313e085f7f8c91e1",
    // Exact-head hosted job 108327752348 passed signer, path, catalog,
    // model, and fixture-absence gates before reporting this representation.
    "9a79e9675943035b6f9887de3b99f2de62ac39c210b7382956ffb63f34f0b985",
  ]),
  // Exact follow-up after validating the built Runner scheme settings. The
  // projected Flutter 3.44.8 Release APK passed local strict verification;
  // hosted signer and ZIP representation still require exact-head proof.
  "0dfcca217029e5c853c2ee9f4740fbb9f73add735e8f061b11820164ff3385ac": Object.freeze([
    "a49272491c9a47c170361ec06f0b3bceb3d9258c4e9c6fbab6559a56d607cbd5",
    // Exact-head hosted job 108318930976 passed signer, path, catalog,
    // model, and fixture-absence checks before reporting this representation.
    "9a79e9675943035b6f9887de3b99f2de62ac39c210b7382956ffb63f34f0b985",
  ]),
  // Bounded Apply handoff diagnostics with the acceptance source rebound in
  // the trusted catalog. Clean local Flutter 3.44.8 Release projection;
  // hosted signer and ZIP representation still require exact-head proof.
  "b33412a769497759afa1652afa39244435b27e9570a9a97aa392e7a242ea59fe": Object.freeze([
    "d34226db4c9d49b0480033ef290607bca3f84ab0adf048032c80b64fcbbfc6e6",
    // Exact-head hosted job 108311257068 passed signer, path, model, and
    // fixture-absence checks before reporting this ZIP representation.
    "86693b38ae65bc5ed245c29e6a928aaac3f1644764ec6020db34c83e5ae7f041",
  ]),
  // Test-only iOS simulator link verification and reviewed compiled nib
  // classification. Android build inputs are unchanged; hosted exact-head
  // signer and ZIP representation still require proof.
  "5757b13b2301696fe9bd74e89578eb25eda87caf6f4a8d661b13302aa83d2438": Object.freeze([
    "ab04b0e09a523c20338627ffd2c57b3924aa84c9169b4a2894235b71cf0d7d69",
  ]),
  // Canonical DateField UI proof, Debug dylib preflight, and bounded iOS
  // opaque-resource diagnostics. Clean Flutter 3.44.8 Release projection;
  // hosted job 108273080304 proved signer and the second representation.
  "53a5a4dbe5393ccd2ccfacf629e9ad33b5dae70b463f0f88061a59f0a6185091": Object.freeze([
    "184c0f967f667215d39777a506af6222c6f6c9f0e404707b36d9abcfa3c31b4a",
    // Exact-head hosted job 108273080304 passed signer, path, model, and
    // fixture-absence checks before reporting this ZIP representation.
    "20ab78ea9e2248abfa34ab6f8f081dc4c82ad79ed6bb96d64691ab580a8f9ec1",
  ]),
  // Exact iOS Xcode Debug dylib link check and bounded opaque-resource
  // diagnostics. Android inputs are unchanged; the prior clean Flutter
  // 3.44.8 Release APK passed strict verification under this source tree.
  "ed20e3296e4986f725f62e29b207e9957def9364112745f83c30103f9d430d2b": Object.freeze([
    "7cec98e06c6eb872af8b6fc219faa16e183257465b5f776ea3b45a2d028487c9",
  ]),
  // Exact bounded UI stages and controlled Apply handoff proof. Clean
  // Flutter 3.44.8 Release projection; hosted signer, exact paths, model,
  // and fixture-absence checks observed the second digest in job 108262217243.
  "4f57028560ef7bf369cf1f6343f7127f2d36838b5b0d1acb12d62704998f64ee": Object.freeze([
    "7cec98e06c6eb872af8b6fc219faa16e183257465b5f776ea3b45a2d028487c9",
    "b4aed0d10c8a62460a3c1cdf4c928f040f9296d5ce3a5405c8a5533ea561f92e",
  ]),
// Exact selected Apply destination proof with bound catalog. Clean Flutter
  // 3.44.8 Release projection; hosted signer and representation need proof.
  "ee613e60e009570ccd62803060505e49c52b6bcc77c59ef0c480cd401467fdf2": Object.freeze([
    "70b9d8be2674c297e701fa67eb84cde08257d671e1d35e6c13d592cdb862089e",
  ]),
  // Exact native UI handoff and Xcode resource correction, with the acceptance
  // catalog rebound to the updated real-provider test. Clean Flutter 3.44.8
  // Release projection; hosted signer and representation still require proof.
  "42c540b5404f6ce3d25d970d1c0f226cc0f6579f2f73bd95d9e6cec8680f4f98": Object.freeze([
    "29a2d524987132092f6460fbe24bcd95d917697cec360e07d799be17e087fff9",
  ]),
  // UI handoff now binds the real provider response while the complete corpus
  // retains semantic truth checks. Clean Flutter 3.44.8 Release projection;
  // hosted exact-head representation still requires reproof.
  "0bef102f66cecb7e05d3869d04ca426df94ac50af05cba332a85b17652f239e4": Object.freeze([
    "59a8e71dbc2b643ec9632f8524262be08f37f448f38d737d85f262c7ac4b09be",
  ]),
  // Hosted review follow-up strengthens iOS package and UI evidence; Android
  // package inputs are unchanged. Local representation passed strict review;
  // the second representation was observed after signer, exact path, model,
  // legal-artifact, and fixture-absence checks in hosted job 108224162571.
  "0dc9f2201df46a5031621867ce6a5df9e5b13a36814f939fa857900650781a30": Object.freeze([
    "0caceaa079326b5e1de3a4e5a681ec4f9917056094b45cec25d93bf92ce702dd",
    "054b05fbe3ac3e5987c1a00109c763d63dbbc48cf2d8d023cd643b51a13a0bc3",
  ]),
  // Fixed-command nested-bundle policy regression; APK inputs unchanged.
  // Local representation passed strict verification, hosted reproof required.
  "123ea0885d2060c98bb89849a3815d42715775b1590d241d224ec1469009f03f": Object.freeze([
    "754737d69df2409e1e1fe265b3eb003335980e6bc450f2d1a4a44adf57b601f2",
    "69470e8594e11481160ef3b1415f22bae77a4901d2bacb89e813e60196946a8c",
  ]),
  // Exact iOS Debug config and package-resource correction. Android inputs
  // are unchanged; local representation verified, hosted reproof required.
  "f7464e6457fabff7dddd30d233c312c05b24fed143bf9e50fb48eede552cd311": Object.freeze([
    "754737d69df2409e1e1fe265b3eb003335980e6bc450f2d1a4a44adf57b601f2",
    "69470e8594e11481160ef3b1415f22bae77a4901d2bacb89e813e60196946a8c",
  ]),
  // Exact bounded iOS diagnostic follow-up. Android package inputs remain
  // unchanged; the first representation passed the complete local Release
  // projection, while the second requires exact-head hosted reproof.
  "a5a90b2b46d7b5794f2eaa0763ae9a36a6f36a692a0149847f716937f9ebb251": Object.freeze([
    "754737d69df2409e1e1fe265b3eb003335980e6bc450f2d1a4a44adf57b601f2",
    "69470e8594e11481160ef3b1415f22bae77a4901d2bacb89e813e60196946a8c",
  ]),
  // Exact iOS acceptance-link and locked-framework inventory correction.
  // Android package inputs are unchanged; the complete local Release
  // projection produced the first digest. The second
  // digest is the reviewed hosted representation from job 108134556526 and
  // must be re-proven on the new exact head before acceptance.
  "32a7e3d69a5d91ddfe7df97d81891172965a91fcb25e65b0a3d4aae99fff0ab9": Object.freeze([
    "754737d69df2409e1e1fe265b3eb003335980e6bc450f2d1a4a44adf57b601f2",
    "69470e8594e11481160ef3b1415f22bae77a4901d2bacb89e813e60196946a8c",
  ]),
  // Exact candidate tracked tree excluding this inventory file. Clean local
  // Flutter 3.44.8 Release projection with strict Gradle evidence, the
  // production plugin graph, and the updated bound acceptance catalog.
  // The second entry was observed after signer, exact path, expanded model,
  // legal artifact, and fixture-absence checks in exact-head hosted job
  // 108134556526 on GitHub-hosted ubuntu-24.04.
  "4895cd8dd88f33c39c5513128d1b64fbce8a7da880bf873077fc86ca46087c62": Object.freeze([
    "57de81460d733fe85576ffc60d532ccff23d40d8b58fd3f621962b36d0345fd8",
    "69470e8594e11481160ef3b1415f22bae77a4901d2bacb89e813e60196946a8c",
  ]),
});
export const expectedAndroidNonOcrEntries = Object.freeze([
  "AndroidManifest.xml",
  "DebugProbesKt.bin",
  "META-INF/DEPENDENCIES",
  "META-INF/androidx.activity_activity.version",
  "META-INF/androidx.annotation_annotation-experimental.version",
  "META-INF/androidx.appcompat_appcompat-resources.version",
  "META-INF/androidx.appcompat_appcompat.version",
  "META-INF/androidx.arch.core_core-runtime.version",
  "META-INF/androidx.compose.runtime_runtime-annotation.version",
  "META-INF/androidx.core_core-ktx.version",
  "META-INF/androidx.core_core-viewtree.version",
  "META-INF/androidx.core_core.version",
  "META-INF/androidx.cursoradapter_cursoradapter.version",
  "META-INF/androidx.customview_customview.version",
  "META-INF/androidx.drawerlayout_drawerlayout.version",
  "META-INF/androidx.emoji2_emoji2-views-helper.version",
  "META-INF/androidx.emoji2_emoji2.version",
  "META-INF/androidx.exifinterface_exifinterface.version",
  "META-INF/androidx.fragment_fragment.version",
  "META-INF/androidx.interpolator_interpolator.version",
  "META-INF/androidx.lifecycle_lifecycle-livedata-core-ktx.version",
  "META-INF/androidx.lifecycle_lifecycle-livedata-core.version",
  "META-INF/androidx.lifecycle_lifecycle-livedata.version",
  "META-INF/androidx.lifecycle_lifecycle-process.version",
  "META-INF/androidx.lifecycle_lifecycle-runtime.version",
  "META-INF/androidx.lifecycle_lifecycle-viewmodel-savedstate.version",
  "META-INF/androidx.lifecycle_lifecycle-viewmodel.version",
  "META-INF/androidx.loader_loader.version",
  "META-INF/androidx.navigationevent_navigationevent.version",
  "META-INF/androidx.profileinstaller_profileinstaller.version",
  "META-INF/androidx.savedstate_savedstate.version",
  "META-INF/androidx.startup_startup-runtime.version",
  "META-INF/androidx.tracing_tracing.version",
  "META-INF/androidx.vectordrawable_vectordrawable-animated.version",
  "META-INF/androidx.vectordrawable_vectordrawable.version",
  "META-INF/androidx.versionedparcelable_versionedparcelable.version",
  "META-INF/androidx.viewpager_viewpager.version",
  "META-INF/androidx.window.extensions.core_core.version",
  "META-INF/androidx.window_window-java.version",
  "META-INF/androidx.window_window.version",
  "META-INF/androidx/annotation/annotation/LICENSE.txt",
  "META-INF/com/android/build/gradle/app-metadata.properties",
  "META-INF/kotlinx_coroutines_android.version",
  "META-INF/kotlinx_coroutines_core.version",
  "META-INF/services/C2.a",
  "META-INF/services/C2.b",
  "META-INF/services/org.apache.tika.metadata.filter.MetadataFilter",
  "META-INF/version-control-info.textproto",
  "META-INF/versions/9/OSGI-INF/MANIFEST.MF",
  "assets/dexopt/baseline.prof",
  "assets/dexopt/baseline.profm",
  "assets/flutter_assets/AssetManifest.bin",
  "assets/flutter_assets/FontManifest.json",
  "assets/flutter_assets/NOTICES.Z",
  "assets/flutter_assets/NativeAssetsManifest.json",
  "assets/flutter_assets/fonts/MaterialIcons-Regular.otf",
  "assets/flutter_assets/packages/cupertino_icons/assets/CupertinoIcons.ttf",
  "assets/flutter_assets/shaders/ink_sparkle.frag",
  "assets/flutter_assets/shaders/stretch_effect.frag",
  "assets/mlkit-google-ocr-models/aksara/aksara_page_layout_analysis_rpn_gcn.binarypb",
  "assets/mlkit-google-ocr-models/aksara/aksara_page_layout_analysis_ti_rpn_gcn.binarypb",
  "assets/mlkit-google-ocr-models/gocr/gocr_models/line_recognition_legacy_mobile/Latn_ctc/optical/assets.extra/LabelMap.pb",
  "assets/mlkit-google-ocr-models/gocr/gocr_models/line_recognition_legacy_mobile/Latn_ctc/optical/conv_model.fb",
  "assets/mlkit-google-ocr-models/gocr/gocr_models/line_recognition_legacy_mobile/Latn_ctc/optical/lstm_model.fb",
  "assets/mlkit-google-ocr-models/gocr/gocr_models/line_recognition_legacy_mobile/Latn_ctc_cpu.binarypb",
  "assets/mlkit-google-ocr-models/gocr/gocr_models/line_recognition_legacy_mobile/tflite_langid.tflite",
  "assets/mlkit-google-ocr-models/gocr/layout/line_clustering_custom_ops/model.tflite",
  "assets/mlkit-google-ocr-models/gocr/layout/line_splitting_custom_ops/model.tflite",
  "assets/mlkit-google-ocr-models/taser/detector/region_proposal_text_detector_tflite_vertical_mbv2_v1.bincfg",
  "assets/mlkit-google-ocr-models/taser/detector/rpn_text_detector_mobile_space_to_depth_quantized_mbv2_v1.tflite",
  "assets/mlkit-google-ocr-models/taser/rpn_text_detection_tflite_mobile_mbv2.binarypb",
  "assets/mlkit-google-ocr-models/taser/segmenter/tflite_script_detector_0.3.bincfg",
  "assets/mlkit-google-ocr-models/taser/segmenter/tflite_script_detector_0.3.conv_model",
  "assets/mlkit-google-ocr-models/taser/segmenter/tflite_script_detector_0.3.lstm_model",
  "assets/mlkit-google-ocr-models/taser/taser_script_identification_tflite_mobile.binarypb",
  "assets/mlkit-google-ocr-models/taser_tflite_gocrlatin_mbv2_scriptid_aksara_layout_gcn_mobile_engine.binarypb",
  "assets/mlkit-google-ocr-models/taser_tflite_gocrlatin_mbv2_scriptid_aksara_layout_gcn_mobile_engine_ti.binarypb",
  "assets/mlkit-google-ocr-models/taser_tflite_gocrlatin_mbv2_scriptid_aksara_layout_gcn_mobile_recognizer.binarypb",
  "assets/mlkit-google-ocr-models/taser_tflite_gocrlatin_mbv2_scriptid_aksara_layout_gcn_mobile_runner.binarypb",
  "assets/mlkit-google-ocr-models/taser_tflite_gocrlatin_mbv2_scriptid_aksara_layout_gcn_mobile_runner_ti.binarypb",
  "classes.dex",
  "common.properties",
  "firebase-annotations.properties",
  "firebase-components.properties",
  "firebase-encoders-json.properties",
  "firebase-encoders.properties",
  "image.properties",
  "kotlin-tooling-metadata.json",
  "kotlin/annotation/annotation.kotlin_builtins",
  "kotlin/collections/collections.kotlin_builtins",
  "kotlin/concurrent/atomics/atomics.kotlin_builtins",
  "kotlin/coroutines/coroutines.kotlin_builtins",
  "kotlin/internal/internal.kotlin_builtins",
  "kotlin/kotlin.kotlin_builtins",
  "kotlin/ranges/ranges.kotlin_builtins",
  "kotlin/reflect/reflect.kotlin_builtins",
  "lib/arm64-v8a/libapp.so",
  "lib/arm64-v8a/libc++_shared.so",
  "lib/arm64-v8a/libdartjni.so",
  "lib/arm64-v8a/libflutter.so",
  "lib/arm64-v8a/libmlkit_google_ocr_pipeline.so",
  "lib/arm64-v8a/libonnxruntime.so",
  "lib/arm64-v8a/libonnxruntime4j_jni.so",
  "lib/arm64-v8a/libopencv_java4.so",
  "lib/armeabi-v7a/libapp.so",
  "lib/armeabi-v7a/libc++_shared.so",
  "lib/armeabi-v7a/libdartjni.so",
  "lib/armeabi-v7a/libflutter.so",
  "lib/armeabi-v7a/libmlkit_google_ocr_pipeline.so",
  "lib/armeabi-v7a/libonnxruntime.so",
  "lib/armeabi-v7a/libonnxruntime4j_jni.so",
  "lib/armeabi-v7a/libopencv_java4.so",
  "lib/x86_64/libapp.so",
  "lib/x86_64/libc++_shared.so",
  "lib/x86_64/libdartjni.so",
  "lib/x86_64/libflutter.so",
  "lib/x86_64/libmlkit_google_ocr_pipeline.so",
  "lib/x86_64/libonnxruntime.so",
  "lib/x86_64/libonnxruntime4j_jni.so",
  "lib/x86_64/libopencv_java4.so",
  "org/apache/tika/detect/tika-example.nnmodel",
  "org/apache/tika/mime/tika-mimetypes.xml",
  "org/apache/tika/parser/external/tika-external-parsers.xml",
  "pipes-fork-server-default-log4j2.xml",
  "play-services-base.properties",
  "play-services-basement.properties",
  "play-services-mlkit-text-recognition-common.properties",
  "play-services-mlkit-text-recognition.properties",
  "play-services-tasks.properties",
  "res/-8.xml",
  "res/-B.png",
  "res/-N.png",
  "res/-p.png",
  "res/0c.9.png",
  "res/1C.9.png",
  "res/1I.9.png",
  "res/1J.9.png",
  "res/1e.9.png",
  "res/27.xml",
  "res/2K.9.png",
  "res/2P.png",
  "res/2d.png",
  "res/2f.xml",
  "res/2j.xml",
  "res/33.9.png",
  "res/3A.xml",
  "res/46.xml",
  "res/47.xml",
  "res/49.png",
  "res/4k.png",
  "res/4u.xml",
  "res/5D.9.png",
  "res/5J.9.png",
  "res/5U.png",
  "res/5c.png",
  "res/62.9.png",
  "res/6Q.xml",
  "res/6f.xml",
  "res/6t.png",
  "res/79.9.png",
  "res/7C.9.png",
  "res/7H.xml",
  "res/7I.9.png",
  "res/7N.xml",
  "res/7R.png",
  "res/7_.9.png",
  "res/7i.png",
  "res/7o.9.png",
  "res/80.xml",
  "res/8h.png",
  "res/9N.9.png",
  "res/9P.xml",
  "res/9T.xml",
  "res/9T1.xml",
  "res/9T2.xml",
  "res/9X.9.png",
  "res/9m.xml",
  "res/9n.9.png",
  "res/9w.png",
  "res/9z.png",
  "res/A1.xml",
  "res/A4.xml",
  "res/Af.9.png",
  "res/BG.9.png",
  "res/BL.9.png",
  "res/BM.png",
  "res/BQ.9.png",
  "res/Bl.xml",
  "res/Bz.xml",
  "res/C_.9.png",
  "res/DL.9.png",
  "res/DZ.xml",
  "res/D_.9.png",
  "res/Dd.png",
  "res/EA.9.png",
  "res/EP.png",
  "res/EQ.xml",
  "res/Eg.xml",
  "res/Eh.png",
  "res/FS.png",
  "res/FW.png",
  "res/G2.9.png",
  "res/GD.xml",
  "res/GK.xml",
  "res/Gf.png",
  "res/Gt.9.png",
  "res/H-.png",
  "res/I3.9.png",
  "res/IX.9.png",
  "res/In.xml",
  "res/JJ.9.png",
  "res/Jl.xml",
  "res/K-.xml",
  "res/K5.xml",
  "res/KH.9.png",
  "res/KM.png",
  "res/K_.9.png",
  "res/Ke.xml",
  "res/Lf.xml",
  "res/Li.9.png",
  "res/Lr.xml",
  "res/M7.xml",
  "res/MF.9.png",
  "res/MQ.png",
  "res/Ma.9.png",
  "res/NA.9.png",
  "res/NF.xml",
  "res/NG.png",
  "res/NM.xml",
  "res/NZ.9.png",
  "res/Nk.9.png",
  "res/No.9.png",
  "res/Nu.xml",
  "res/Ol.xml",
  "res/Pa.9.png",
  "res/Pb.png",
  "res/Pb.xml",
  "res/QJ.9.png",
  "res/QZ.xml",
  "res/Qd.9.png",
  "res/Qd.xml",
  "res/Qt.xml",
  "res/RJ.png",
  "res/RV.png",
  "res/Rt.xml",
  "res/SN.xml",
  "res/Su.9.png",
  "res/T5.xml",
  "res/TK.xml",
  "res/Th.png",
  "res/Tj.9.png",
  "res/Tn.xml",
  "res/U-.9.png",
  "res/U8.xml",
  "res/UR.png",
  "res/V1.xml",
  "res/VM.xml",
  "res/VT.xml",
  "res/W3.xml",
  "res/Wh.png",
  "res/Wr.png",
  "res/Wz.png",
  "res/X4.9.png",
  "res/XK.xml",
  "res/XW.xml",
  "res/Xx.xml",
  "res/YG.9.png",
  "res/YW.xml",
  "res/Yw.9.png",
  "res/Z8.png",
  "res/ZI.png",
  "res/ZL.9.png",
  "res/ZL.xml",
  "res/Zg.xml",
  "res/Zn.xml",
  "res/_G.xml",
  "res/_o.xml",
  "res/_p.png",
  "res/_q.png",
  "res/_y.xml",
  "res/aG.xml",
  "res/aU.9.png",
  "res/aW.xml",
  "res/ar.png",
  "res/bL.xml",
  "res/bb.xml",
  "res/bt.xml",
  "res/c5.xml",
  "res/c6.xml",
  "res/cL.xml",
  "res/cV.xml",
  "res/cm.xml",
  "res/color-v23/abc_tint_btn_checkable.xml",
  "res/color-v23/abc_tint_default.xml",
  "res/color-v23/abc_tint_edittext.xml",
  "res/color-v23/abc_tint_seek_thumb.xml",
  "res/color-v23/abc_tint_spinner.xml",
  "res/color-v23/abc_tint_switch_track.xml",
  "res/color/common_google_signin_btn_text_dark.xml",
  "res/color/common_google_signin_btn_text_light.xml",
  "res/color/common_google_signin_btn_tint.xml",
  "res/d3.png",
  "res/d5.9.png",
  "res/dB.9.png",
  "res/dO.xml",
  "res/dW.png",
  "res/dY.png",
  "res/df.xml",
  "res/eA.xml",
  "res/eG.xml",
  "res/eR.png",
  "res/eT.9.png",
  "res/ej.9.png",
  "res/f9.png",
  "res/fM.9.png",
  "res/g-.png",
  "res/gK.9.png",
  "res/gR.xml",
  "res/gX.xml",
  "res/gZ.9.png",
  "res/gj.9.png",
  "res/gt.9.png",
  "res/h4.xml",
  "res/h7.9.png",
  "res/hP.9.png",
  "res/hP.xml",
  "res/hZ.9.png",
  "res/hq.xml",
  "res/i6.9.png",
  "res/iO.png",
  "res/iQ.png",
  "res/iR.9.png",
  "res/iW.png",
  "res/io.9.png",
  "res/j3.xml",
  "res/j4.png",
  "res/jS.9.png",
  "res/jW.png",
  "res/je.9.png",
  "res/kJ.9.png",
  "res/kj.xml",
  "res/kn.xml",
  "res/kp.png",
  "res/lN.xml",
  "res/lP.9.png",
  "res/lR.xml",
  "res/ly.png",
  "res/m0.png",
  "res/mm.9.png",
  "res/nC.9.png",
  "res/nI.9.png",
  "res/nT.xml",
  "res/nf.png",
  "res/nz.xml",
  "res/o-.png",
  "res/oO.9.png",
  "res/oP.xml",
  "res/o_.9.png",
  "res/o_.png",
  "res/op.9.png",
  "res/p7.xml",
  "res/pI.xml",
  "res/pY.png",
  "res/pk.png",
  "res/ps.9.png",
  "res/pu.png",
  "res/qD.9.png",
  "res/qp.png",
  "res/qx.xml",
  "res/qz.xml",
  "res/rJ.xml",
  "res/rW.xml",
  "res/rj.9.png",
  "res/rx.xml",
  "res/s0.png",
  "res/s4.png",
  "res/sA.9.png",
  "res/sA.xml",
  "res/sg.9.png",
  "res/sn.xml",
  "res/tG.png",
  "res/tL.xml",
  "res/tS.png",
  "res/tZ.9.png",
  "res/te.png",
  "res/tr.9.png",
  "res/u0.xml",
  "res/u3.png",
  "res/uJ.xml",
  "res/uL.9.png",
  "res/uj.9.png",
  "res/us.9.png",
  "res/ut.9.png",
  "res/uu.9.png",
  "res/vJ.xml",
  "res/vL.9.png",
  "res/vZ.xml",
  "res/vo.png",
  "res/vz.9.png",
  "res/w2.9.png",
  "res/wL.9.png",
  "res/wN.9.png",
  "res/w_.png",
  "res/xH.png",
  "res/xR.9.png",
  "res/xa.9.png",
  "res/xj.xml",
  "res/y6.xml",
  "res/yH.9.png",
  "res/yY.9.png",
  "res/yg.9.png",
  "res/yn.png",
  "res/z-.9.png",
  "res/z9.9.png",
  "res/zE.png",
  "res/zV.9.png",
  "res/zw.9.png",
  "resources.arsc",
  "text-recognition-bundled-common.properties",
  "text-recognition.properties",
  "transport-api.properties",
  "transport-backend-cct.properties",
  "transport-runtime.properties",
  "vision-common.properties",
  "vision-interfaces.properties",
]);
