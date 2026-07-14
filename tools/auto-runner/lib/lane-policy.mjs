const contractHeadingPattern = /^##\s+Auto-runner contract\s*$/im;
const markdownHeadingPattern = /^(#{1,6})\s+(.+?)\s*#*\s*$/gm;
const eligibleContractLabels = new Set(["auto-ready", "auto-bundle", "auto-canary-ready"]);

const contractFields = new Set([
  "contractVersion",
  "lane",
  "allowedPaths",
  "validationProfile",
  "manualMergeRequired",
  "autoMergeEligible",
  "requiredReading",
  "bundle",
]);
const requiredContractFields = new Set([
  "contractVersion",
  "lane",
  "allowedPaths",
  "validationProfile",
  "manualMergeRequired",
  "autoMergeEligible",
  "requiredReading",
]);

const maxAllowedPathPatternLength = 240;
const maxChangedPathLength = 512;

const manualActionPatterns = [
  { key: "production_deploy", pattern: /\b(production deploy(?:ment)?|deploy to production|deploy[^.\n]{0,80}production|production promotion|promote to production|release to production)\b/i },
  { key: "mobile_store_release", pattern: /\b(testflight submission|submit[^.\n]{0,80}testflight|app store submission|play store submission|mobile store release|signing release|store release)\b/i },
  { key: "destructive_data_operation", pattern: /\b(destructive (?:migration|data operation)|delete production data|purge production data|drop table|wipe data|force-allow-destructive|execute destructive)\b/i },
  { key: "secret_credential_mutation", pattern: /\b(create|rotate|disclose|print|reveal|mutate|replace|delete|recreate)\b[^.\n]{0,80}\b(secret|credential|token|api key|auth config|\.env)\b|\b(secret|credential|token|api key|auth config|\.env)\b[^.\n]{0,80}\b(create|rotate|disclose|print|reveal|mutate|replace|delete|recreate)\b/i },
  { key: "public_admin_exposure", pattern: /\b(public exposure|admin exposure|publicly expose|expose admin|internet exposure|router|firewall|dns|tls|reverse proxy|cloudflare tunnel|public tunnel)\b/i },
  { key: "architecture_replacement", pattern: /\b(replace architecture|architecture replacement|change architecture direction|replace the architecture)\b/i },
  { key: "force_history_rewrite", pattern: /\b(force push|force-push|history rewrite|rewrite history|git push --force)\b/i },
  { key: "branch_deletion_cleanup", pattern: /\b(delete branch|branch deletion|branch cleanup|cleanup branch|remove branch)\b/i },
  { key: "day1_scope_cut", pattern: /\b(day 1 scope cut|reduce day 1 scope|scope reduction|cut day 1|remove from day 1)\b/i },
  { key: "unresolved_product_decision", pattern: /\b(unresolved (?:product|policy|authority|financial semantics?) decision|requires tommy decision|needs product decision|manual decision required)\b/i },
];

const sensitivityPatterns = [
  { key: "auth_security", pattern: /\b(auth|authentication|authorization|session|security|mfa|passkey|password|credential|token)\b/i },
  { key: "storage_privacy", pattern: /\b(storage|file byte|privacy|vault|permission|authz)\b/i },
  { key: "money_settlement", pattern: /\b(money|settlement|payment|paid|settled|refunded|refund|settle|billing|bill calculation|rounding|currency|balance|amount|total|debt|owed|split|allocation|ledger state)\b/i },
  { key: "schema_migration", pattern: /\b(schema|migration|ef core|database migration|destructive data)\b/i },
  { key: "openapi_generated_client", pattern: /\b(openapi|generated client|client generation)\b/i },
  { key: "sync_import_export", pattern: /\b(sync|restore|backup|import|export|reconciliation)\b/i },
  { key: "docker_ci_deploy", pattern: /\b(docker|compose|ci|github action|deployment|deploy|truenas|codemagic)\b/i },
  { key: "secrets_config", pattern: /\b(secret|secrets|credential|credentials|\.env|env var|environment variable|ssh|token storage|auth config|security config|deployment config)\b/i },
  { key: "public_admin_exposure", pattern: /\b(public exposure|admin exposure|production|reverse proxy|tls)\b/i },
  { key: "mobile_release", pattern: /\b(testflight|app store|mobile release|signing)\b/i },
  { key: "destructive_operations", pattern: /\b(destructive operation|delete data|purge|drop table|wipe)\b/i },
  { key: "branch_cleanup", pattern: /\b(delete branch|branch cleanup|force push|history rewrite)\b/i },
  { key: "architecture_replacement", pattern: /\b(replace architecture|reduce day 1 scope|scope reduction)\b/i },
];

const moneyPresentationProofPatterns = Object.freeze([
  { key: "accessibility", pattern: /\b(accessibility|accessible|assistive technolog(?:y|ies)|screen reader|screen-reader)\b/i },
  { key: "semantics", pattern: /\b(semantics?|semantic label|semantic announcement|announcement)\b/i },
  { key: "visible_display_text", pattern: /\b(visible (?:display )?text|display text|visible label|label copy|display copy)\b/i },
  { key: "ui_copy", pattern: /\b(ui copy|copy only|text only|wording only|presentation-only|presentation only)\b/i },
  { key: "layout_style_only", pattern: /\b(icon|layout|style|styling|visual rendering|rendering)\b/i },
  { key: "read_only_widget_rendering", pattern: /\b(read-only|read only|shared widget|widget rendering|MoneyText)\b/i },
]);

const moneyAuthorityMutationPatterns = Object.freeze([
  { key: "calculate_compute_arithmetic", pattern: /\b(calculate|calculation|compute|arithmetic|formula|sum|total|subtotal|derive)\b/i },
  { key: "rounding_precision_policy", pattern: /\b(round|rounding|precision|decimal places?|policy)\b/i },
  { key: "currency_conversion_exchange_rate", pattern: /\b(convert(?: currency)?|currency conversion|exchange rate|fx)\b/i },
  { key: "parse_monetary_input", pattern: /\b(parse|parsing|input|entry|enter|typed|form field)\b[^.\n]{0,80}\b(amount|currency|money|monetary)\b|\b(amount|currency|money|monetary)\b[^.\n]{0,80}\b(parse|parsing|input|entry|enter|typed|form field)\b/i },
  { key: "business_value_mutation", pattern: /\b(edit(?:ing)?|writ(?:e|ing)|persist(?:ing)?|sav(?:e|ing)|mutat(?:e|ing)|stor(?:e|ing)|record(?:ing)?|patch(?:ing)?|submit(?:ting)?)\s+(?:the\s+|an?\s+)?(?:business\s+|domain\s+)?(amount|currency|balance|debt|owed|payment|settlement|split|allocation|total|ledger)\b|\b(amount|currency|balance|debt|owed|payment|settlement|split|allocation|total|ledger)\b[^.\n]{0,80}\b(edit(?:ing)?|writ(?:e|ing)|persist(?:ing)?|sav(?:e|ing)|mutat(?:e|ing)|stor(?:e|ing)|record(?:ing)?|patch(?:ing)?|submit(?:ting)?)\b/i },
  { key: "paid_settled_refunded_transition", pattern: /\b(mark|transition|set|confirm|claim|cancel|dispute|refund|settle)\b[^.\n]{0,100}\b(paid|settled|refunded|payment|settlement|refund|status)\b|\b(paid|settled|refunded|payment|settlement|refund|status)\b[^.\n]{0,100}\b(mark|transition|set|confirm|claim|cancel|dispute|refund|settle)\b/i },
  { key: "api_domain_database_storage_write", pattern: /\b(api|domain|database|db|storage|repository|server)\b[^.\n]{0,100}\b(write|persist|save|update|mutate|patch|post|put|delete)\b|\b(write|persist|save|update|mutate|patch|post|put|delete)\b[^.\n]{0,100}\b(api|domain|database|db|storage|repository|server)\b/i },
  { key: "authorization_policy_decision", pattern: /\b(authori[sz]ation|permission|policy|eligibility|access)\b[^.\n]{0,100}\b(amount|currency|balance|debt|owed|payment|settlement|money|financial value)\b|\b(amount|currency|balance|debt|owed|payment|settlement|money|financial value)\b[^.\n]{0,100}\b(authori[sz]ation|permission|policy|eligibility|access)\b/i },
  { key: "settlement_payment_billing_behavior", pattern: /\b(settlement|payment|billing|bill calculation)\b[^.\n]{0,100}\b(behavior|workflow|flow|action|transition|calculate|compute|mutation|state)\b/i },
  { key: "split_allocation_calculation", pattern: /\b(split|allocation)\b[^.\n]{0,100}\b(calculate|calculation|compute|formula|total|amount)\b|\b(calculate|calculation|compute|formula|total|amount)\b[^.\n]{0,100}\b(split|allocation)\b/i },
  { key: "ambiguous_financial_verbs", pattern: /\b(adjust|apply|resolve|reconcile|finalize|normalize|validate|derive)\b[^.\n]{0,100}\b(amount|currency|balance|debt|owed|payment|settlement|split|allocation|total|ledger|money)\b|\b(amount|currency|balance|debt|owed|payment|settlement|split|allocation|total|ledger|money)\b[^.\n]{0,100}\b(adjust|apply|resolve|reconcile|finalize|normalize|validate|derive)\b/i },
]);

const dangerousPathPatterns = [
  { key: "auth_security", pattern: /(^|\/)(auth|authentication|authorization|session|security|mfa|passkey|password|credential|token)(\/|$)/i },
  { key: "storage_privacy", pattern: /(^|\/)(storage|privacy|vault|permission|authz|file)(\/|$)/i },
  { key: "money_settlement", pattern: /(^|\/)(money|settlement|payment|bill|rounding|currency|balance)(\/|$)/i },
  { key: "schema_migration", pattern: /(^|\/)(schema|migration|migrations|database|ef)(\/|$)/i },
  { key: "openapi_generated_client", pattern: /(^|\/)(openapi|generated|client-web|client-dart|contracts)(\/|$)/i },
  { key: "sync_import_export", pattern: /(^|\/)(sync|restore|backup|import|export|reconciliation)(\/|$)/i },
  { key: "docker_ci_deploy", pattern: /(^|\/)(docker|compose|ci|workflows|deployment|deploy|infra|truenas|codemagic)(\/|$)/i },
  { key: "secrets_config", pattern: /(^|\/)(secret|secrets|credential|credentials|env|ssh|config)(\/|$)|(^|\/)\.env(?:\.|$)/i },
  { key: "public_admin_exposure", pattern: /(^|\/)(public|admin|production|tls|reverse-proxy)(\/|$)/i },
  { key: "mobile_release", pattern: /(^|\/)(testflight|app-store|signing|mobile-release)(\/|$)/i },
];

const mobileBuildConfigForbiddenPathPatterns = [
  { key: "mobile_build_output", pattern: /^apps\/mobile\/build(?:\/|$)/ },
  { key: "mobile_dart_tool", pattern: /^apps\/mobile\/\.dart_tool(?:\/|$)/ },
  { key: "mobile_nested_build_output", pattern: /^apps\/mobile\/.*\/build(?:\/|$)/ },
  { key: "mobile_gradle_cache", pattern: /^apps\/mobile\/android\/\.gradle(?:\/|$)/ },
  { key: "mobile_ios_pods", pattern: /^apps\/mobile\/ios\/Pods(?:\/|$)/ },
  { key: "xcode_derived_data", pattern: /(^|\/)DerivedData(?:\/|$)/ },
  { key: "certificate_material", pattern: /\.(?:p12|pfx|cer|mobileprovision)$/i },
  { key: "android_signing_material", pattern: /\.(?:jks|keystore)$/i },
  { key: "ssh_private_key", pattern: /(^|\/)(?:id_rsa|id_ed25519)$/ },
  { key: "env_file", pattern: /(^|\/)\.env(?:\.|$)/ },
  { key: "private_key_material", pattern: /(^|\/)[^/]*private[^/]*key[^/]*(?:\/|$)/i },
  { key: "android_key_properties", pattern: /^apps\/mobile\/android\/key\.properties$/ },
  { key: "android_local_properties", pattern: /^apps\/mobile\/android\/local\.properties$/ },
  { key: "store_publication", pattern: /(^|\/)(?:testflight|app-store|play-store|store-release|publication|upload-key|provisioning)(?:\/|$)/i },
  { key: "generated_openapi_dart_client", pattern: /^packages\/client-dart\/lib\/generated(?:\/|$)/ },
  { key: "ci_deployment_workflow", pattern: /^\.github\/workflows(?:\/|$)/ },
  { key: "deployment_infra", pattern: /^(?:infra|docs\/deployment)(?:\/|$)/ },
  { key: "api_auth_money_storage_schema_runtime", pattern: /^(?:services\/api|packages\/contracts|packages\/client-web|apps\/mobile\/lib|apps\/mobile\/test)(?:\/|$)/ },
];

export const validationProfiles = Object.freeze({
  "docs-only": Object.freeze([
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
    ["npm", ["run", "validate:docs"]],
  ]),
  "workflow-tooling": Object.freeze([
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
    ["npm", ["run", "validate:docs"]],
    ["npm", ["run", "validate:scaffold"]],
    ["bash", ["-lc", "node --test tools/auto-runner/test/*.test.mjs"]],
    ["node", ["--check", "tools/auto-runner/settleora-auto-runner.mjs"]],
    ["node", ["tools/auto-runner/settleora-auto-runner.mjs", "--preflight"]],
  ]),
  "runner-tests": Object.freeze([
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
    ["npm", ["run", "validate:docs"]],
    ["npm", ["run", "validate:scaffold"]],
    ["bash", ["-lc", "node --test tools/auto-runner/test/*.test.mjs"]],
    ["node", ["--check", "tools/auto-runner/settleora-auto-runner.mjs"]],
    ["node", ["tools/auto-runner/settleora-auto-runner.mjs", "--preflight"]],
  ]),
  "scaffold-docs": Object.freeze([
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
    ["npm", ["run", "validate:docs"]],
    ["npm", ["run", "validate:scaffold"]],
  ]),
  "mobile-ui-low-risk": Object.freeze([
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
    ["bash", ["-lc", "cd apps/mobile && /opt/flutter/bin/flutter pub get"]],
    ["bash", ["-lc", "cd apps/mobile && /opt/flutter/bin/flutter analyze"]],
    ["bash", ["-lc", "cd apps/mobile && /opt/flutter/bin/flutter test test/ui/settleora_component_guardrail_test.dart"]],
  ]),
  "mobile": Object.freeze([
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
    ["npm", ["run", "doctor:mobile"]],
    ["npm", ["run", "validate:mobile"]],
  ]),
  "mobile-build-config": Object.freeze([
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
    ["bash", ["-lc", "PATH=/opt/flutter/bin:$PATH npm run doctor:mobile"]],
    ["bash", ["-lc", "cd apps/mobile && /opt/flutter/bin/flutter pub get"]],
    ["bash", ["-lc", "cd apps/mobile && /opt/flutter/bin/flutter analyze"]],
    ["bash", ["-lc", "cd apps/mobile && /opt/flutter/bin/flutter test"]],
  ]),
  "web-ui": Object.freeze([
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
    ["npm", ["run", "validate:scaffold"]],
  ]),
  "api-domain": Object.freeze([
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
    ["npm", ["run", "doctor:validation"]],
    ["npm", ["run", "validate:api"]],
  ]),
  "api-security": Object.freeze([
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
    ["npm", ["run", "doctor:validation"]],
    ["npm", ["run", "validate:api-local"]],
  ]),
  "api-storage": Object.freeze([
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
    ["npm", ["run", "doctor:validation"]],
    ["npm", ["run", "validate:api-local"]],
  ]),
  "api-money": Object.freeze([
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
    ["npm", ["run", "doctor:validation"]],
    ["npm", ["run", "validate:api-local"]],
  ]),
  "api-migrations": Object.freeze([
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
    ["npm", ["run", "doctor:validation"]],
    ["npm", ["run", "validate:api-migrations"]],
  ]),
  "openapi-generated-clients": Object.freeze([
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
    ["npm", ["run", "validate:openapi"]],
    ["npm", ["run", "generate:clients"]],
    ["npm", ["run", "validate:clients"]],
  ]),
  "sync-import-export": Object.freeze([
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
    ["npm", ["run", "doctor:validation"]],
    ["npm", ["run", "validate:api-local"]],
  ]),
  "compose-ci": Object.freeze([
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
    ["npm", ["run", "doctor:docker"]],
    ["npm", ["run", "validate:compose"]],
  ]),
});

export const laneManifest = Object.freeze({
  "workflow-docs-tooling": Object.freeze({
    id: "workflow-docs-tooling",
    purpose: "Auto-runner, workflow documentation, and AI controller tooling.",
    allowedPaths: Object.freeze(["tools/auto-runner/**", "docs/workflow/**", "scripts/ai/**"]),
    defaultValidationProfile: "workflow-tooling",
    supportedValidationProfiles: Object.freeze(["workflow-tooling", "runner-tests", "scaffold-docs", "docs-only"]),
    implementationAllowed: true,
    manualGateBeforeImplementation: false,
    prCreationAllowed: true,
    autoMergeAllowed: true,
    followupIssueCreationAllowed: false,
    reviewFixMutationAllowed: false,
    sensitivity: "low",
    reviewerTier: "cheap_independent",
    branchStrategy: "normal",
    decisionType: "runnable",
  }),
  "docs-planning": Object.freeze({
    id: "docs-planning",
    purpose: "Planning, issue ledger, and non-runtime reporting documentation.",
    allowedPaths: Object.freeze(["docs/planning/**", "docs/qa/**"]),
    defaultValidationProfile: "docs-only",
    supportedValidationProfiles: Object.freeze(["docs-only", "scaffold-docs"]),
    implementationAllowed: true,
    manualGateBeforeImplementation: false,
    prCreationAllowed: true,
    autoMergeAllowed: true,
    followupIssueCreationAllowed: false,
    reviewFixMutationAllowed: false,
    sensitivity: "low",
    reviewerTier: "cheap_independent",
    branchStrategy: "normal",
    decisionType: "runnable",
  }),
  "client-ui-low-risk": Object.freeze({
    id: "client-ui-low-risk",
    purpose: "Default-off canary lane for narrow mobile shared UI component styling/copy with no API, auth, money, storage, schema, generated-client, deployment, release, or exposure changes.",
    allowedPaths: Object.freeze(["apps/mobile/lib/ui/**", "apps/mobile/test/ui/**"]),
    defaultValidationProfile: "mobile-ui-low-risk",
    supportedValidationProfiles: Object.freeze(["mobile-ui-low-risk"]),
    implementationAllowed: true,
    manualGateBeforeImplementation: false,
    prCreationAllowed: true,
    autoMergeAllowed: true,
    followupIssueCreationAllowed: false,
    reviewFixMutationAllowed: false,
    sensitivity: "low",
    reviewerTier: "cheap_independent",
    branchStrategy: "normal",
    decisionType: "runnable",
  }),
  "mobile-application": policyLane({
    id: "mobile-application",
    purpose: "Flutter mobile application implementation outside generated clients and release actions.",
    allowedPaths: ["apps/mobile/lib/**", "apps/mobile/test/**"],
    defaultValidationProfile: "mobile",
    supportedValidationProfiles: ["mobile", "mobile-ui-low-risk"],
    sensitivity: "standard",
    reviewerTier: "cheap_independent",
    branchStrategy: "normal",
  }),
  "mobile-build-config": policyLane({
    id: "mobile-build-config",
    purpose:
      "Checked-in Flutter/native platform build inputs without generated output, caches, signing material, credentials, store publication, or product runtime code.",
    allowedPaths: [
      "apps/mobile/pubspec.yaml",
      "apps/mobile/pubspec.lock",
      "apps/mobile/assets/**",
      "apps/mobile/l10n/**",
      "apps/mobile/android/**",
      "apps/mobile/ios/**",
      "apps/mobile/macos/**",
      "apps/mobile/linux/**",
      "apps/mobile/windows/**",
      "apps/mobile/web/**",
    ],
    defaultValidationProfile: "mobile-build-config",
    supportedValidationProfiles: ["mobile-build-config"],
    sensitivity: "high",
    reviewerTier: "strong_independent",
    branchStrategy: "focused",
  }),
  "web-user-ui": policyLane({
    id: "web-user-ui",
    purpose: "Future user web portal UI implementation.",
    allowedPaths: ["apps/web-user/**"],
    defaultValidationProfile: "web-ui",
    supportedValidationProfiles: ["web-ui", "scaffold-docs"],
    sensitivity: "standard",
    reviewerTier: "cheap_independent",
    branchStrategy: "normal",
  }),
  "web-admin-ui": policyLane({
    id: "web-admin-ui",
    purpose: "Future admin web portal UI implementation without public/admin exposure changes.",
    allowedPaths: ["apps/web-admin/**"],
    defaultValidationProfile: "web-ui",
    supportedValidationProfiles: ["web-ui", "scaffold-docs"],
    sensitivity: "sensitive",
    reviewerTier: "strong_independent",
    branchStrategy: "focused",
  }),
  "api-domain-runtime": policyLane({
    id: "api-domain-runtime",
    purpose: "API/domain runtime implementation with API-authoritative business writes.",
    allowedPaths: ["services/api/**"],
    defaultValidationProfile: "api-domain",
    supportedValidationProfiles: ["api-domain"],
    sensitivity: "sensitive",
    reviewerTier: "strong_independent",
    branchStrategy: "focused",
  }),
  "auth-session-security": policyLane({
    id: "auth-session-security",
    purpose: "Auth, session, and security implementation under API authority.",
    allowedPaths: ["services/api/**", "docs/architecture/AUTH_*.md", "docs/qa/AUTH_*.md"],
    defaultValidationProfile: "api-security",
    supportedValidationProfiles: ["api-security", "api-domain"],
    sensitivity: "high",
    reviewerTier: "strong_independent",
    branchStrategy: "focused",
  }),
  "storage-file-privacy-authz": policyLane({
    id: "storage-file-privacy-authz",
    purpose: "Storage, file privacy, and authorization implementation under API authority.",
    allowedPaths: ["services/api/**", "docs/architecture/STORAGE_*.md", "docs/architecture/PRIVACY_*.md"],
    defaultValidationProfile: "api-storage",
    supportedValidationProfiles: ["api-storage", "api-domain"],
    sensitivity: "high",
    reviewerTier: "strong_independent",
    branchStrategy: "focused",
  }),
  "money-settlement-payment": policyLane({
    id: "money-settlement-payment",
    purpose: "Money, settlement, payment, bill-calculation, and financial implementation under API/domain authority.",
    allowedPaths: ["services/api/**", "docs/architecture/*MONEY*.md", "docs/architecture/*SETTLEMENT*.md", "docs/architecture/*BILL*.md"],
    defaultValidationProfile: "api-money",
    supportedValidationProfiles: ["api-money", "api-domain"],
    sensitivity: "high",
    reviewerTier: "strong_independent",
    branchStrategy: "focused",
  }),
  "schema-migrations": policyLane({
    id: "schema-migrations",
    purpose: "Schema and migration code generation/review without executing destructive production data operations.",
    allowedPaths: ["services/api/**/Migrations/**", "services/api/**/migrations/**", "services/api/**/*.csproj", "services/api/**/*.cs"],
    defaultValidationProfile: "api-migrations",
    supportedValidationProfiles: ["api-migrations", "api-domain"],
    sensitivity: "high",
    reviewerTier: "strong_independent",
    branchStrategy: "focused",
  }),
  "openapi-generated-clients": policyLane({
    id: "openapi-generated-clients",
    purpose: "OpenAPI source changes and generated clients refreshed through repo generation commands.",
    allowedPaths: ["packages/contracts/openapi/**", "packages/client-web/src/generated/**", "packages/client-dart/lib/generated/**", "tools/generate-clients.mjs", "tools/validate-clients.mjs"],
    defaultValidationProfile: "openapi-generated-clients",
    supportedValidationProfiles: ["openapi-generated-clients"],
    sensitivity: "high",
    reviewerTier: "strong_independent",
    branchStrategy: "focused",
  }),
  "sync-import-export-restore": policyLane({
    id: "sync-import-export-restore",
    purpose: "Sync, import, export, restore implementation with API acceptance authority preserved.",
    allowedPaths: ["services/api/**", "apps/mobile/lib/**/sync/**", "apps/mobile/test/**/sync/**", "docs/architecture/*SYNC*.md", "docs/architecture/*IMPORT*.md", "docs/architecture/*EXPORT*.md", "docs/architecture/*RESTORE*.md"],
    defaultValidationProfile: "sync-import-export",
    supportedValidationProfiles: ["sync-import-export", "api-domain", "mobile"],
    sensitivity: "high",
    reviewerTier: "strong_independent",
    branchStrategy: "focused",
  }),
  "docker-compose-ci-deployment": policyLane({
    id: "docker-compose-ci-deployment",
    purpose: "Docker, Compose, CI, and deployment code changes without live deployment or secret/environment mutation.",
    allowedPaths: ["infra/**", ".github/workflows/**", "docs/deployment/**", "tools/doctor-validation.mjs", "tools/validate-*.mjs"],
    defaultValidationProfile: "compose-ci",
    supportedValidationProfiles: ["compose-ci", "scaffold-docs"],
    sensitivity: "high",
    reviewerTier: "strong_independent",
    branchStrategy: "focused",
  }),
  "cross-domain": Object.freeze({
    id: "cross-domain",
    purpose: "Cross-domain work that must be split unless a later bundle policy approves it.",
    allowedPaths: Object.freeze([]),
    defaultValidationProfile: null,
    supportedValidationProfiles: Object.freeze([]),
    implementationAllowed: false,
    manualGateBeforeImplementation: false,
    prCreationAllowed: false,
    autoMergeAllowed: false,
    followupIssueCreationAllowed: false,
    reviewFixMutationAllowed: false,
    sensitivity: "split",
    reviewerTier: "split_or_escalate",
    branchStrategy: "split-required",
    decisionType: "split_required",
    reasonCodes: Object.freeze(["split_required"]),
  }),
  "product-runtime": dangerLane("product-runtime", "Product runtime work remains manual-gated."),
  "security-runtime": aliasLane("security-runtime", "auth-session-security"),
  "storage-privacy": aliasLane("storage-privacy", "storage-file-privacy-authz"),
  "money-settlement": aliasLane("money-settlement", "money-settlement-payment"),
  "deployment-ci-env": aliasLane("deployment-ci-env", "docker-compose-ci-deployment"),
});

export function classifyIssueLane(issue) {
  const labels = new Set(issue.labels || []);

  if (labels.has("manual-gate") || labels.has("needs-tommy")) {
    return blockedDecision("manual", "Issue already carries a manual gate label.", {
      manualGate: true,
      reasonCodes: ["explicit_manual_label"],
      manualReasonCodes: ["explicit_manual_label"],
      dangerReasons: detectSensitivityReasons(issueSearchText(issue, "all")),
    });
  }

  if (labels.has("danger-gate")) {
    return blockedDecision("danger-gated", "Issue already carries a danger gate label.", {
      manualGate: true,
      dangerGate: true,
      reasonCodes: ["explicit_danger_label"],
      manualReasonCodes: ["explicit_danger_label"],
      dangerReasons: detectSensitivityReasons(issueSearchText(issue, "all")),
    });
  }

  if (hasEligibleContractLabel(labels)) {
    const parsed = parseAutoRunnerContract(issue.body || "");
    if (parsed.ok) {
      const contractDecision = buildContractDecision(parsed.contract);
      if (!contractDecision.allowedToImplement) {
        return contractDecision;
      }
      const manualHits = detectManualActionReasons(issueSearchText(issue, "positive-scope"));
      if (manualHits.length > 0) {
        return blockedDecision(
          contractDecision.lane,
          `Issue positive scope requires genuine manual action or decision: ${manualHits.join(", ")}.`,
          {
            contract: parsed.contract,
            manualGate: true,
            manualActionRequired: true,
            manualReasonCodes: manualHits,
            reasonCodes: ["manual_action_required", ...manualHits],
            dangerReasons: detectSensitivityReasons(issueSearchText(issue, "positive-scope")),
            laneManifest: contractDecision.laneManifest,
          },
        );
      }
      const positiveHits = detectSensitivityReasons(issueSearchText(issue, "positive-scope"));
      const unexpectedHits = positiveHits.filter((hit) => !sensitivityAllowedForLane(hit, contractDecision));
      if (positiveHits.length > 0) {
        const positiveText = issueSearchText(issue, "positive-scope");
        const presentationException = evaluateMoneyPresentationException({
          contract: parsed.contract,
          contractDecision,
          detectedDangerReasons: unexpectedHits.length > 0 ? positiveHits : [],
          positiveText,
        });
        if (presentationException.applied) {
          return {
            ...contractDecision,
            reason: "Valid issue contract accepted by lane manifest; presentation-only money display nouns suppressed for client-ui-low-risk.",
            dangerReasons: [],
            moneyPresentationException: presentationException,
          };
        }
        if (unexpectedHits.length > 0 || contractDecision.implementationSensitivity === "low") {
          return blockedDecision(
            contractDecision.lane,
            `Issue positive scope appears to request work outside the validated lane: ${positiveHits.join(", ")}.`,
            {
              contract: parsed.contract,
              manualGate: true,
              dangerGate: true,
              reasonCodes: ["positive_scope_outside_lane", ...unexpectedHits],
              dangerReasons: positiveHits,
              moneyPresentationException: presentationException,
              laneManifest: contractDecision.laneManifest,
            },
          );
        }
      }
      return {
        ...contractDecision,
        moneyPresentationException: emptyMoneyPresentationException([]),
      };
    }

    const malformedHits = detectSensitivityReasons(issueSearchText(issue, "all"));
    if (malformedHits.length > 0) {
      return blockedDecision(
        "danger-gated",
        `Issue has an invalid auto-runner contract and appears to request gated scope: ${malformedHits.join(", ")}.`,
        {
          contract: parsed,
          manualGate: true,
          dangerGate: true,
          reasonCodes: ["invalid_contract_for_sensitive_scope", ...malformedHits],
          dangerReasons: malformedHits,
        },
      );
    }
    return blockedDecision("missing-or-invalid-contract", parsed.reason, {
      contract: parsed,
    });
  }

  const manualHits = detectManualActionReasons(issueSearchText(issue, "all"));
  if (manualHits.length > 0) {
    return blockedDecision("manual-action", `Issue appears to require genuine manual action or decision: ${manualHits.join(", ")}.`, {
      manualGate: true,
      manualActionRequired: true,
      manualReasonCodes: manualHits,
      reasonCodes: ["manual_action_required", ...manualHits],
      dangerReasons: detectSensitivityReasons(issueSearchText(issue, "all")),
    });
  }

  const hits = detectSensitivityReasons(issueSearchText(issue, "all"));
  if (hits.length > 0) {
    return blockedDecision("missing-or-invalid-contract", `Issue appears to request sensitive scope without a valid contract: ${hits.join(", ")}.`, {
      manualGate: true,
      dangerGate: true,
      reasonCodes: ["missing_contract_for_sensitive_scope", ...hits],
      dangerReasons: hits,
    });
  }

  const parsed = parseAutoRunnerContract(issue.body || "");
  if (!parsed.ok) {
    return blockedDecision("missing-or-invalid-contract", parsed.reason, {
      contract: parsed,
    });
  }

  const contractDecision = buildContractDecision(parsed.contract);
  if (!contractDecision.allowedToImplement) {
    return contractDecision;
  }
  return contractDecision;
}

export function parseAutoRunnerContract(body) {
  const heading = contractHeadingPattern.exec(body || "");
  if (!heading) {
    return { ok: false, reason: "Issue is missing a body-level ## Auto-runner contract section." };
  }

  const afterHeading = body.slice(heading.index + heading[0].length);
  const fence = afterHeading.match(/```json\s*([\s\S]*?)```/i);
  if (!fence) {
    return { ok: false, reason: "Auto-runner contract must be a fenced json block." };
  }

  let contract;
  try {
    contract = JSON.parse(fence[1]);
  } catch (error) {
    return { ok: false, reason: `Auto-runner contract JSON is malformed: ${error.message}` };
  }

  const validation = validateContractShape(contract);
  if (!validation.ok) {
    return validation;
  }

  return { ok: true, contract };
}

export function pathViolatesPolicy(filePath, laneDecision) {
  if (!isSafeRepoRelativePath(filePath, { allowGlob: false, maxLength: maxChangedPathLength })) return true;
  const normalized = normalizePath(filePath);
  if (!laneDecision.allowedToImplement) return true;
  if (isForbiddenPath(normalized, laneDecision)) return true;
  const manifestAllowed = matchesAnyGlob(normalized, laneDecision.laneManifestAllowedPaths || []);
  const contractAllowed = matchesAnyGlob(normalized, laneDecision.allowedPaths || []);
  return !manifestAllowed || !contractAllowed;
}

export function filterForbiddenChangedFiles(files, laneDecision) {
  return files.filter((file) => pathViolatesPolicy(file, laneDecision));
}

export function getValidationProfile(profileName) {
  return validationProfiles[profileName] || null;
}

function buildContractDecision(contract) {
  const rawLane = laneManifest[contract.lane];
  const lane = resolveLaneManifest(rawLane);
  if (!lane) {
    return blockedDecision("unknown-contract-lane", `Unsupported auto-runner lane: ${contract.lane}.`, {
      contract,
      reasonCodes: ["unknown_lane"],
    });
  }
  if (lane.decisionType === "split_required" || lane.branchStrategy === "split-required") {
    return blockedDecision(contract.lane, `Lane ${contract.lane} requires a focused split before implementation.`, {
      contract,
      manualGate: false,
      splitRequired: true,
      reasonCodes: ["split_required"],
      laneManifest: lane,
    });
  }
  if (!lane.implementationAllowed || lane.manualGateBeforeImplementation) {
    return blockedDecision(contract.lane, `Lane ${contract.lane} is disabled or manual-gated for implementation.`, {
      contract,
      manualGate: true,
      dangerGate: !lane.implementationAllowed,
      reasonCodes: ["lane_disabled_or_manual"],
      laneManifest: lane,
    });
  }
  if (!validationProfiles[contract.validationProfile]) {
    return blockedDecision(contract.lane, `Unsupported validation profile: ${contract.validationProfile}.`, {
      contract,
      reasonCodes: ["unknown_validation_profile"],
      laneManifest: lane,
    });
  }
  if (!lane.supportedValidationProfiles.includes(contract.validationProfile)) {
    return blockedDecision(
      contract.lane,
      `Validation profile ${contract.validationProfile} is not allowed for lane ${contract.lane}.`,
      { contract, reasonCodes: ["validation_profile_not_allowed"], laneManifest: lane },
    );
  }
  const unsafePath = contract.allowedPaths.find((glob) => !lane.allowedPaths.some((laneGlob) => globIsSubsetOf(glob, laneGlob)));
  if (unsafePath) {
    const pathDangerReasons = detectDangerousPathReasons(contract.allowedPaths, lane);
    return blockedDecision(contract.lane, `Contract allowed path is outside lane manifest allowlist: ${unsafePath}.`, {
      contract,
      dangerGate: pathDangerReasons.length > 0,
      dangerReasons: pathDangerReasons,
      reasonCodes: ["contract_path_outside_lane"],
      laneManifest: lane,
    });
  }
  const pathDangerReasons = detectDangerousPathReasons(contract.allowedPaths, lane);
  if (pathDangerReasons.length > 0) {
    return blockedDecision(contract.lane, "Contract allowed path contains a danger-domain path segment.", {
      contract,
      dangerGate: true,
      dangerReasons: pathDangerReasons,
      reasonCodes: ["contract_path_forbidden"],
      laneManifest: lane,
    });
  }
  const mobileBuildForbiddenReasons = detectMobileBuildConfigForbiddenPathReasons(contract.allowedPaths, lane);
  if (mobileBuildForbiddenReasons.length > 0) {
    return blockedDecision(contract.lane, "Contract allowed path contains a mobile build-config forbidden path.", {
      contract,
      dangerGate: true,
      dangerReasons: mobileBuildForbiddenReasons,
      reasonCodes: ["contract_path_forbidden"],
      laneManifest: lane,
    });
  }

  const autoMergeEligible = Boolean(contract.autoMergeEligible && lane.autoMergeAllowed);
  return {
    lane: contract.lane,
    canonicalLane: lane.id,
    allowedToImplement: true,
    manualGate: false,
    dangerGate: false,
    manualActionRequired: false,
    splitRequired: false,
    reason: "Valid issue contract accepted by lane manifest.",
    reasonCodes: ["contract_valid"],
    manualReasonCodes: [],
    dangerReasons: [],
    contract,
    allowedPaths: [...contract.allowedPaths],
    laneManifestAllowedPaths: [...lane.allowedPaths],
    laneManifest: publicLaneManifest(lane),
    validationProfile: contract.validationProfile || lane.defaultValidationProfile,
    manualMergeRequired: Boolean(contract.manualMergeRequired || !autoMergeEligible),
    autoMergeEligible,
    prCreationAllowed: lane.prCreationAllowed,
    followupIssueCreationAllowed: lane.followupIssueCreationAllowed,
    reviewFixMutationAllowed: lane.reviewFixMutationAllowed,
    implementationSensitivity: lane.sensitivity || "standard",
    branchStrategy: lane.branchStrategy || "normal",
    reviewerTier: lane.reviewerTier || "cheap_independent",
  };
}

function hasEligibleContractLabel(labels) {
  return [...labels].some((label) => eligibleContractLabels.has(label));
}

function detectSensitivityReasons(text) {
  return sensitivityPatterns.filter((entry) => entry.pattern.test(text)).map((entry) => entry.key);
}

function detectManualActionReasons(text) {
  return manualActionPatterns.filter((entry) => entry.pattern.test(text)).map((entry) => entry.key);
}

function sensitivityAllowedForLane(reason, laneDecision) {
  if (laneDecision.implementationSensitivity === "low") return false;
  const lane = laneDecision.canonicalLane || laneDecision.lane;
  const allowed = {
    "auth-session-security": ["auth_security"],
    "storage-file-privacy-authz": ["storage_privacy", "auth_security"],
    "money-settlement-payment": ["money_settlement", "auth_security", "storage_privacy"],
    "schema-migrations": ["schema_migration", "auth_security", "storage_privacy", "money_settlement"],
    "openapi-generated-clients": ["openapi_generated_client"],
    "sync-import-export-restore": ["sync_import_export", "storage_privacy", "auth_security"],
    "docker-compose-ci-deployment": ["docker_ci_deploy"],
    "mobile-application": ["money_settlement"],
  };
  return (allowed[lane] || []).includes(reason);
}

function evaluateMoneyPresentationException({ contract, contractDecision, detectedDangerReasons, positiveText }) {
  const presentationProofMatches = matchPatternKeys(positiveText, moneyPresentationProofPatterns);
  const authorityMutationMatches = matchPatternKeys(positiveText, moneyAuthorityMutationPatterns);
  const base = {
    detectedDangerReasons: [...detectedDangerReasons],
    presentationProofMatches,
    authorityMutationMatches,
    applied: false,
    reason: "not_evaluated",
  };
  if (!contract || !contractDecision?.allowedToImplement) {
    return { ...base, reason: "contract_not_validated" };
  }
  if (contract.lane !== "client-ui-low-risk" || contractDecision.lane !== "client-ui-low-risk") {
    return { ...base, reason: "lane_not_client_ui_low_risk" };
  }
  if (contract.validationProfile !== "mobile-ui-low-risk" || contractDecision.validationProfile !== "mobile-ui-low-risk") {
    return { ...base, reason: "validation_profile_not_mobile_ui_low_risk" };
  }
  const contractedPaths = contract.allowedPaths || [];
  const lanePaths = contractDecision.laneManifestAllowedPaths || [];
  const outsideLane = contractedPaths.find((glob) => !lanePaths.some((laneGlob) => globIsSubsetOf(glob, laneGlob)));
  if (outsideLane) return { ...base, reason: "contract_path_outside_lane_manifest" };
  const outsidePresentationUi = contractedPaths.find((glob) => !isClientUiPresentationPath(glob));
  if (outsidePresentationUi) return { ...base, reason: "contract_path_outside_presentation_ui" };
  if (detectedDangerReasons.length !== 1 || detectedDangerReasons[0] !== "money_settlement") {
    return { ...base, reason: "danger_reasons_not_exactly_money_settlement" };
  }
  if (presentationProofMatches.length === 0) {
    return { ...base, reason: "missing_presentation_only_proof" };
  }
  if (authorityMutationMatches.length > 0) {
    return { ...base, reason: "authority_or_mutation_signal_present" };
  }
  return {
    ...base,
    applied: true,
    reason: "validated_client_ui_low_risk_presentation_only_money_display",
  };
}

function emptyMoneyPresentationException(detectedDangerReasons) {
  return {
    detectedDangerReasons: [...detectedDangerReasons],
    presentationProofMatches: [],
    authorityMutationMatches: [],
    applied: false,
    reason: "no_positive_scope_danger",
  };
}

function matchPatternKeys(text, patterns) {
  return patterns.filter((entry) => entry.pattern.test(text)).map((entry) => entry.key);
}

function isClientUiPresentationPath(glob) {
  const normalized = normalizePath(glob);
  return normalized.startsWith("apps/mobile/lib/ui/") || normalized.startsWith("apps/mobile/test/ui/");
}

function detectDangerousPathReasons(paths, laneDecisionOrManifest = {}) {
  const lane = laneDecisionOrManifest.id || laneDecisionOrManifest.canonicalLane || laneDecisionOrManifest.lane;
  const sensitivity = laneDecisionOrManifest.sensitivity || laneDecisionOrManifest.implementationSensitivity || "low";
  if (sensitivity !== "low" && lane !== "client-ui-low-risk" && lane !== "workflow-docs-tooling" && lane !== "docs-planning") {
    return [];
  }
  return [
    ...new Set(
      paths.flatMap((filePath) =>
        dangerousPathPatterns.filter((entry) => entry.pattern.test(normalizePath(filePath))).map((entry) => entry.key),
      ),
    ),
  ];
}

function detectMobileBuildConfigForbiddenPathReasons(paths, laneDecisionOrManifest = {}) {
  const lane = laneDecisionOrManifest.id || laneDecisionOrManifest.canonicalLane || laneDecisionOrManifest.lane;
  if (lane !== "mobile-build-config") return [];
  return [
    ...new Set(
      paths.flatMap((filePath) =>
        mobileBuildConfigForbiddenPathPatterns
          .filter((entry) => entry.pattern.test(normalizePath(filePath)))
          .map((entry) => entry.key),
      ),
    ),
  ];
}

function issueSearchText(issue, mode) {
  const body = String(issue.body || "");
  const scopedBody = mode === "positive-scope" ? positiveScopeBodyText(body) : body;
  return [issue.title || "", scopedBody, (issue.labels || []).join(" ")].join("\n");
}

function positiveScopeBodyText(body) {
  return stripNegativeSections(stripAutoRunnerContractSection(String(body || "")));
}

function stripAutoRunnerContractSection(body) {
  return stripSections(body, (heading) => normalizeHeading(heading) === "auto runner contract");
}

function stripNegativeSections(body) {
  return stripSections(body, (heading) => {
    const normalized = normalizeHeading(heading);
    return (
      normalized === "non goals" ||
      normalized === "non goal" ||
      normalized === "out of scope" ||
      normalized === "outside scope" ||
      normalized === "prohibited actions" ||
      normalized === "prohibited action" ||
      normalized === "forbidden actions" ||
      normalized === "forbidden action" ||
      normalized === "do not" ||
      normalized === "exclusions" ||
      normalized === "excluded scope" ||
      normalized === "not in scope"
      || normalized === "required reading"
      || normalized === "references"
      || normalized === "guardrails"
      || normalized === "manual decisions"
    );
  });
}

function stripSections(body, shouldStrip) {
  const headings = [...body.matchAll(markdownHeadingPattern)];
  if (headings.length === 0) {
    return body;
  }

  const ranges = [];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (!shouldStrip(heading[2])) continue;
    const level = heading[1].length;
    const start = heading.index;
    let end = body.length;
    for (let nextIndex = index + 1; nextIndex < headings.length; nextIndex += 1) {
      const next = headings[nextIndex];
      if (next[1].length <= level) {
        end = next.index;
        break;
      }
    }
    ranges.push([start, end]);
  }
  if (ranges.length === 0) {
    return body;
  }

  let stripped = "";
  let cursor = 0;
  for (const [start, end] of ranges) {
    stripped += body.slice(cursor, start);
    cursor = end;
  }
  return stripped + body.slice(cursor);
}

function normalizeHeading(heading) {
  return String(heading || "")
    .toLowerCase()
    .replace(/[`*_()[\]{}:;,.!?'"-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validateContractShape(contract) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    return { ok: false, reason: "Auto-runner contract must be a JSON object." };
  }
  for (const key of Object.keys(contract)) {
    if (!contractFields.has(key)) {
      return { ok: false, reason: `Auto-runner contract contains unsupported field: ${key}.` };
    }
  }
  for (const field of requiredContractFields) {
    if (!(field in contract)) {
      return { ok: false, reason: `Auto-runner contract is missing required field: ${field}.` };
    }
  }
  if (contract.contractVersion !== 1) {
    return { ok: false, reason: `Unsupported auto-runner contract version: ${contract.contractVersion}.` };
  }
  for (const [field, value] of [
    ["lane", contract.lane],
    ["validationProfile", contract.validationProfile],
  ]) {
    if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
      return { ok: false, reason: `Auto-runner contract field ${field} must be a non-empty string.` };
    }
  }
  for (const [field, value] of [
    ["manualMergeRequired", contract.manualMergeRequired],
    ["autoMergeEligible", contract.autoMergeEligible],
  ]) {
    if (typeof value !== "boolean") {
      return { ok: false, reason: `Auto-runner contract field ${field} must be boolean.` };
    }
  }
  for (const [field, value] of [
    ["allowedPaths", contract.allowedPaths],
    ["requiredReading", contract.requiredReading],
  ]) {
    if (!Array.isArray(value) || value.length === 0 || !value.every((item) => typeof item === "string" && item.length > 0)) {
      return { ok: false, reason: `Auto-runner contract field ${field} must be a non-empty string array.` };
    }
  }
  for (const glob of contract.allowedPaths) {
    const pathPolicy = validateAllowedPathPattern(glob);
    if (!pathPolicy.ok) return pathPolicy;
  }
  if ("bundle" in contract && (contract.bundle === null || typeof contract.bundle !== "object" || Array.isArray(contract.bundle))) {
    return { ok: false, reason: "Auto-runner contract field bundle must be an object when present." };
  }
  return { ok: true };
}

function blockedDecision(lane, reason, overrides = {}) {
  const laneManifestForDecision = overrides.laneManifest ? publicLaneManifest(overrides.laneManifest) : null;
  return {
    lane,
    canonicalLane: laneManifestForDecision?.id || lane,
    allowedToImplement: false,
    manualGate: overrides.manualGate ?? true,
    dangerGate: overrides.dangerGate ?? false,
    manualActionRequired: overrides.manualActionRequired ?? false,
    splitRequired: overrides.splitRequired ?? false,
    reason,
    reasonCodes: overrides.reasonCodes || ["blocked"],
    manualReasonCodes: overrides.manualReasonCodes || [],
    dangerReasons: overrides.dangerReasons || [],
    contract: overrides.contract || null,
    allowedPaths: [],
    laneManifestAllowedPaths: [],
    laneManifest: laneManifestForDecision,
    validationProfile: null,
    manualMergeRequired: true,
    autoMergeEligible: false,
    prCreationAllowed: false,
    followupIssueCreationAllowed: false,
    reviewFixMutationAllowed: false,
    moneyPresentationException: overrides.moneyPresentationException || null,
    implementationSensitivity: laneManifestForDecision?.sensitivity || "unknown",
    branchStrategy: laneManifestForDecision?.branchStrategy || (overrides.splitRequired ? "split-required" : "blocked"),
    reviewerTier: laneManifestForDecision?.reviewerTier || "split_or_escalate",
  };
}

function policyLane({
  id,
  purpose,
  allowedPaths,
  defaultValidationProfile,
  supportedValidationProfiles,
  sensitivity,
  reviewerTier,
  branchStrategy,
  autoMergeAllowed = true,
}) {
  return Object.freeze({
    id,
    purpose,
    allowedPaths: Object.freeze(allowedPaths),
    defaultValidationProfile,
    supportedValidationProfiles: Object.freeze(supportedValidationProfiles),
    implementationAllowed: true,
    manualGateBeforeImplementation: false,
    prCreationAllowed: true,
    autoMergeAllowed: Boolean(autoMergeAllowed),
    followupIssueCreationAllowed: false,
    reviewFixMutationAllowed: false,
    sensitivity,
    reviewerTier,
    branchStrategy,
    decisionType: "runnable",
  });
}

function aliasLane(id, target) {
  return Object.freeze({ id, aliasFor: target });
}

function resolveLaneManifest(lane) {
  if (!lane) return null;
  if (!lane.aliasFor) return lane;
  return laneManifest[lane.aliasFor] || null;
}

function publicLaneManifest(lane) {
  if (!lane) return null;
  return {
    id: lane.id,
    purpose: lane.purpose,
    allowedPaths: [...(lane.allowedPaths || [])],
    defaultValidationProfile: lane.defaultValidationProfile,
    supportedValidationProfiles: [...(lane.supportedValidationProfiles || [])],
    implementationAllowed: Boolean(lane.implementationAllowed),
    prCreationAllowed: Boolean(lane.prCreationAllowed),
    autoMergeAllowed: Boolean(lane.autoMergeAllowed),
    sensitivity: lane.sensitivity || "unknown",
    reviewerTier: lane.reviewerTier || "split_or_escalate",
    branchStrategy: lane.branchStrategy || "blocked",
    decisionType: lane.decisionType || "blocked",
  };
}

function dangerLane(id, purpose) {
  return Object.freeze({
    id,
    purpose,
    allowedPaths: Object.freeze([]),
    defaultValidationProfile: null,
    supportedValidationProfiles: Object.freeze([]),
    implementationAllowed: false,
    manualGateBeforeImplementation: true,
    prCreationAllowed: false,
    autoMergeAllowed: false,
    followupIssueCreationAllowed: false,
    reviewFixMutationAllowed: false,
    sensitivity: "manual",
    reviewerTier: "split_or_escalate",
    branchStrategy: "blocked",
    decisionType: "manual",
  });
}

function isForbiddenPath(filePath, laneDecision = {}) {
  const canonicalLane = laneDecision.canonicalLane || laneDecision.lane;
  if (canonicalLane === "mobile-build-config" && mobileBuildConfigForbiddenPathPatterns.some((entry) => entry.pattern.test(filePath))) {
    return true;
  }
  if ((laneDecision.canonicalLane || laneDecision.lane) === "api-domain-runtime" && detectDangerousPathReasons([filePath]).length > 0) {
    return true;
  }
  if (
    laneDecision.lane === "client-ui-low-risk" &&
    matchesAnyGlob(filePath, laneDecision.laneManifestAllowedPaths || []) &&
    !detectDangerousPathReasons([filePath]).length
  ) {
    return false;
  }
  return [
    /^\.env(?:\.|$)/,
    /^\.codex(?:\/|$)/,
    /^\/?workspace\/logs(?:\/|$)/,
    /(^|\/)(secret|secrets|credential|credentials|\.ssh)(\/|$)/i,
    /(^|\/)\.env(?:\.|$)/i,
  ].some((pattern) => pattern.test(filePath))
    ? true
    : [
    /^\.github\/workflows(?:\/|$)/,
    /^infra(?:\/|$)/,
    /^services\/api(?:\/|$)/,
    /^packages\/contracts\/openapi(?:\/|$)/,
    /^packages\/client-(web|dart)(?:\/|$)/,
    /^apps\/mobile(?:\/|$)/,
    /(^|\/)migrations?(\/|$)/i,
    /(^|\/)(auth|session|security)(\/|$)/i,
    /(^|\/)(settlement|payment|bill|money|storage|sync|ocr)(\/|$)/i,
  ].some((pattern) => pattern.test(filePath)) && (laneDecision.implementationSensitivity || "low") === "low";
}

function matchesAnyGlob(filePath, globs) {
  return globs.some((glob) => globMatchesPath(glob, filePath));
}

function globMatchesPath(glob, filePath) {
  if (!isSafeRepoRelativePath(glob, { allowGlob: true, maxLength: maxAllowedPathPatternLength })) return false;
  if (!isSafeRepoRelativePath(filePath, { allowGlob: false, maxLength: maxChangedPathLength })) return false;
  return matchSegments(splitPath(glob), splitPath(filePath));
}

function globIsSubsetOf(childGlob, parentGlob) {
  if (!isSafeRepoRelativePath(childGlob, { allowGlob: true, maxLength: maxAllowedPathPatternLength })) return false;
  if (!isSafeRepoRelativePath(parentGlob, { allowGlob: true, maxLength: maxAllowedPathPatternLength })) return false;
  if (childGlob === parentGlob) return true;
  if (!childGlob.includes("*")) return globMatchesPath(parentGlob, childGlob);
  if (parentGlob.endsWith("/**")) {
    const parentBase = parentGlob.slice(0, -3);
    return childGlob === parentBase || childGlob.startsWith(`${parentBase}/`);
  }
  return false;
}

function normalizePath(filePath) {
  return String(filePath || "").replace(/^\.\//, "");
}

function validateAllowedPathPattern(glob) {
  if (!isSafeRepoRelativePath(glob, { allowGlob: true, maxLength: maxAllowedPathPatternLength })) {
    return {
      ok: false,
      reason:
        "Auto-runner contract allowedPaths must be bounded repo-relative forward-slash globs using exact paths, * within a segment, or ** as a full segment.",
    };
  }
  return { ok: true };
}

function isSafeRepoRelativePath(value, { allowGlob, maxLength }) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) return false;
  if (value.startsWith("/") || value.startsWith("./") || value.includes("\\") || value.includes("\0")) return false;
  if (/[\u0000-\u001f\u007f]/u.test(value)) return false;
  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) return false;
  if (!allowGlob && value.includes("*")) return false;
  return allowGlob ? segments.every(isSupportedGlobSegment) : true;
}

function isSupportedGlobSegment(segment) {
  if (segment === "**") return true;
  return !segment.includes("**");
}

function splitPath(value) {
  return normalizePath(value).split("/");
}

function matchSegments(patternSegments, pathSegments) {
  let patternIndex = 0;
  let pathIndex = 0;
  let lastGlobstarIndex = -1;
  let lastGlobstarPathIndex = -1;

  while (pathIndex < pathSegments.length) {
    const patternSegment = patternSegments[patternIndex];
    if (patternSegment === "**") {
      lastGlobstarIndex = patternIndex;
      lastGlobstarPathIndex = pathIndex;
      patternIndex += 1;
      continue;
    }
    if (patternSegment !== undefined && segmentMatches(patternSegment, pathSegments[pathIndex])) {
      patternIndex += 1;
      pathIndex += 1;
      continue;
    }
    if (lastGlobstarIndex >= 0) {
      patternIndex = lastGlobstarIndex + 1;
      lastGlobstarPathIndex += 1;
      pathIndex = lastGlobstarPathIndex;
      continue;
    }
    return false;
  }

  while (patternSegments[patternIndex] === "**") {
    patternIndex += 1;
  }
  return patternIndex === patternSegments.length;
}

function segmentMatches(patternSegment, pathSegment) {
  if (!patternSegment.includes("*")) return patternSegment === pathSegment;
  const parts = patternSegment.split("*");
  let cursor = 0;

  if (parts[0] && !pathSegment.startsWith(parts[0])) return false;
  cursor = parts[0].length;

  const lastIndex = parts.length - 1;
  for (let index = 1; index < lastIndex; index += 1) {
    const part = parts[index];
    if (!part) continue;
    const foundAt = pathSegment.indexOf(part, cursor);
    if (foundAt < 0) return false;
    cursor = foundAt + part.length;
  }

  const tail = parts[lastIndex];
  if (!tail) return true;
  const foundTailAt = pathSegment.indexOf(tail, cursor);
  return foundTailAt >= 0 && foundTailAt + tail.length === pathSegment.length;
}

export const terminalOutcomes = [
  "approved_pr_opened",
  "blocked_needs_tommy",
  "danger_gate",
  "auto_failed",
  "no_changes",
  "validation_failed",
  "review_changes_requested_retry_exhausted",
  "issue_created_for_followup",
  "auto_merged",
];

export const systemicStopReasons = [
  "dirty_workspace_real_run",
  "github_auth_unavailable_real_run",
  "codex_unavailable_real_run",
  "repository_state_ambiguous",
  "lock_corruption",
  "repeated_infrastructure_failure",
  "config_policy_corruption",
];
