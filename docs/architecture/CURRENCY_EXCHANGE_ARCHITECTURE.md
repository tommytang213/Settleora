# Currency Exchange Architecture

## Purpose

Settleora supports expenses and bills in different currencies. Currency exchange is a Day 2+ feature area that starts with manual bill-level FX snapshots for Day 1 travel bills, then adds provider-backed daily and historical rates, group/context FX policies, and richer conversion UX later.

The goal is to support daily, historical, manual, and policy-driven exchange rates for receipts, bills, settlements, forecasting, and reporting while preserving financial correctness.

## Current Scope Boundary

This document records future architecture and product direction. It does not mean the current API, database schema, OpenAPI contract, generated clients, workers, or mobile/web runtime already implement these models.

Day 1 scope remains conservative:

- Currency-attached money values and centralized rounding are required.
- Manual exchange-rate snapshot support is required for travel bills where original currency differs from settlement/display currency.
- Provider-backed exchange-rate fetch, common-currency materialization, group/context FX policy management, and approval workflows remain Day 2+ unless a later implementation task explicitly brings a focused slice forward.

## Authority Principles

- Money remains decimal-safe.
- Currency is always attached to monetary values.
- Rounding remains centralized through the money policy described in [Money And Rounding Architecture](MONEY_ROUNDING_ARCHITECTURE.md).
- Backend/domain services are authoritative for conversions that affect server-mode records.
- Provider/global/resolved exchange rates are reference data and cache inputs.
- Bill FX snapshots are the financial truth for the bill.
- Existing bills must never be silently recalculated because a provider, cache, global, or resolved rate later changes.
- FX changes that affect participant shares, settlement amounts, reports, or audit-visible history are money-impacting and require explicit workflow handling.

## Currency Registry

Settleora should use a currency registry instead of treating every syntactically valid three-letter string as equally usable.

Recommended registry model:

```text
id uuid primary key
code character varying(3) unique not null
display_name
minor_units
state
selectable
visible
usable_for_money_entry
usable_for_settlement
usable_for_fx
auto_fetch
created_at
updated_at
```

Registry rules:

- UUID is the internal primary key for currencies.
- Three-letter currency code is the public/business identifier.
- Three-letter code is snapshotted onto financial records so historical records remain readable without joining the registry as financial truth.
- Do not physically delete currencies after use.
- Lifecycle states should include `active`, `disabled`, `retired`, and `legacy`.
- Feature flags should include `selectable`, `visible`, `usable_for_money_entry`, `usable_for_settlement`, `usable_for_fx`, and `auto_fetch`.
- Historical records remain displayable even when a currency is no longer selectable.
- Registry policy decides whether a code is usable for entry, settlement, FX, import, reporting, or display; regex validation alone is only a syntax gate.

## Provider Model

Use a provider abstraction.

```csharp
public interface IExchangeRateProvider
{
    Task<ExchangeRateQuote> GetRateAsync(
        string baseCurrency,
        string quoteCurrency,
        DateOnly rateDate,
        CancellationToken cancellationToken);
}
```

Initial provider:

```text
FrankfurterExchangeRateProvider
```

Fallback provider:

```text
ManualExchangeRateProvider
```

Possible future providers:

```text
OpenExchangeRatesProvider
ExchangeRateHostProvider
CustomExchangeRateProvider
```

Provider results are inputs to reviewed conversion workflows. They are not allowed to mutate existing bills automatically.

## Exchange Rate Storage

Settleora should store several related FX data shapes with explicit authority boundaries:

- Raw provider rate sets and quotes.
- Daily materialized ordered-pair rates for the configured common currency universe.
- On-demand historical rates for rare currencies when bill creation or import needs them.
- Resolved pair rates when they are actually used.
- Exact bill FX rate/source snapshots on the bill.

Suggested raw provider table:

```text
exchange_provider_rate_sets
id
provider
base_currency
requested_rate_date
source_rate_date
fetched_at
source_reference
payload_hash
raw_payload_metadata
created_at
```

Suggested raw quote table:

```text
exchange_provider_quotes
id
rate_set_id
base_currency
quote_currency
rate
provider
requested_rate_date
source_rate_date
fetched_at
source_reference
created_at
```

Suggested materialized pair table:

```text
exchange_daily_pair_rates
id
base_currency
quote_currency
rate
requested_rate_date
source_rate_date
provider
resolution_method
source_quote_id nullable
created_at
updated_at
```

Suggested unique constraint:

```text
base_currency, quote_currency, requested_rate_date, provider
```

Rules:

- Store ordered pairs. `JPY -> HKD` and `HKD -> JPY` are separate directional records unless a workflow explicitly derives one from the inverse.
- Store `requested_rate_date` and `source_rate_date` separately when a provider falls back to a nearby or previous available date.
- Resolved pair rates should record whether they came from direct provider quote, inverse quote, cross-rate, manual entry, selected group/context rule, recurring template rule, or another reviewed source.
- Exchange rates use their own precision policy and must not be stored in ordinary money amount columns.

## Bill-Level FX Snapshot

Bills and expenses that use currency conversion must store the exact rate used for that bill.

Suggested fields:

```text
original_amount
original_currency
target_amount
target_currency
exchange_rate
exchange_rate_direction
requested_rate_date
source_rate_date
exchange_rate_source
exchange_rate_source_type
exchange_rate_id nullable
group_fx_profile_id nullable
group_fx_rule_id nullable
context_fx_profile_id nullable
context_fx_rule_id nullable
exchange_rate_overridden
exchange_rate_override_reason nullable
exchange_rate_snapshot_created_at
```

Rules:

- Bill FX snapshots are financial truth.
- Provider/global/resolved rates are reference/cache.
- Existing bills must never be silently recalculated when new daily rates arrive, provider data changes, a cache is refreshed, or a group/context policy is updated.
- Any bill recalculation must be an explicit edit/revision workflow with audit and affected-user review where money impact changes.
- Back-dated bills use bill/receipt date for historical FX, not creation date.

## Common Currency Universe

Daily materialization should focus on a configured common currency universe instead of every possible currency.

Default core/common universe:

```text
USD
EUR
JPY
GBP
CNY
AUD
CAD
CHF
HKD
SGD
```

Optional common-20 additions:

```text
KRW
TWD
THB
NZD
SEK
NOK
INR
MXN
MYR
PHP
```

Regional packs can add opinionated convenience sets, such as:

```text
Asia travel
Europe
Middle East
```

FX universes should be configurable at these future levels:

- system/admin;
- tenant/workspace;
- group;
- trip/event/context profile.

The configured universe controls prefetch/materialization and ordinary selection defaults. It must not prevent historical display of records that already carry a different snapshotted currency code.

## Performance And Retention

Full ordered-pair materialization for common currencies is acceptable at the expected Day 2 scale.

Example:

```text
20 currencies * 19 directed counterparts * 365 days = 138,700 rows/year
```

Rules:

- Approximately 138,700 rows/year for 20 full ordered-pair currencies is acceptable.
- If users enable many more currencies, the design should support PostgreSQL partitioning by `requested_rate_date`.
- Avoid manual yearly old tables.
- Add automated maintenance and retention policy later.
- Bill FX snapshots must not be deleted while related financial or audit records exist.
- Provider cache and raw provider data may have configurable retention.
- Retention cleanup must not remove data needed to explain a bill, settlement, export, reconciliation result, or audit trail.

## Group, Trip, And Context FX Profiles

Group and trip/event FX needs are policy-like, not just provider cache lookup.

Model direction:

- One group can have many FX profiles.
- One FX profile can have many directional FX rules.
- `JPY -> HKD` and `HKD -> JPY` are separate directional rules unless inverse auto-use is explicitly enabled.
- The model should support group-level FX profiles and trip/event/context-level FX profiles.
- Use group expense contexts for trip/event bill grouping before implementing full nested groups.

Example contexts:

```text
Japan Trip 2026
Taiwan Trip
Birthday Dinner
Shared Apartment Q1
```

A context can have:

- participants;
- default bill currency;
- default settlement/reporting currency;
- its own FX profile;
- bill selection defaults;
- reporting and dashboard grouping metadata.

Suggested FX profile fields:

```text
id
group_id
context_id nullable
name
status
default_bill_currency nullable
default_settlement_currency nullable
inverse_auto_use_enabled
created_by
created_at
activated_at nullable
retired_at nullable
```

Suggested directional rule fields:

```text
id
fx_profile_id
base_currency
quote_currency
rate_source_type
manual_rate nullable
provider nullable
effective_from nullable
effective_to nullable
status
approval_policy_id nullable
created_by
created_at
activated_at nullable
retired_at nullable
```

## Group FX Approval Flow

Group/context FX profiles and rules can affect shared financial outcomes, so they need explicit proposal and audit behavior.

Policy/rule status flow:

```text
draft
pending_approval
active
retired
cancelled
```

Rules:

- Users can propose group/context FX profiles and directional rules.
- Affected members or context participants approve before a profile/rule becomes active.
- The approval set should be frozen at proposal creation.
- Bill-only manual FX overrides are reviewed through the bill participant workflow, not the group FX policy workflow.
- All FX policy changes and overrides require audit.
- Replacing or retiring a group/context FX rule affects future suggestions only. It must not silently recalculate existing bill snapshots.

Audit events should cover:

```text
fx_profile.proposed
fx_profile.approved
fx_profile.activated
fx_profile.retired
fx_rule.proposed
fx_rule.approved
fx_rule.activated
fx_rule.retired
bill_fx.manual_override
bill_fx.source_changed
bill_fx.rate_changed
bill_fx.target_currency_changed
```

## Bill-Create FX UX And Defaults

Bill creation should keep same-currency flows quiet while making conversion choices explicit when needed.

Defaults:

- Bill currency defaults to group default bill currency when present.
- Settlement/reporting currency defaults to group default settlement currency when present.
- Context/trip defaults override ordinary group defaults when the bill is created inside that selected context.
- FX fields are hidden or collapsed when bill currency equals the target currency.
- FX UI fields are optional unless conversion is needed.
- Back-dated bills use bill/receipt date for historical FX, not creation date.
- Store `requested_rate_date` and `source_rate_date` when a provider fallback uses a nearby or previous available date.

Best-available source priority for conversion suggestions:

1. bill manual override;
2. selected context/trip FX rule;
3. selected group FX rule;
4. recurring template FX rule;
5. provider direct rate;
6. provider inverse rate;
7. provider cross-rate;
8. manual input required.

Bill-create choices can include:

- keep bill currency;
- follow group default currency;
- use group FX;
- use trip/context FX;
- use provider dynamic/historical FX;
- manual bill rate;
- copy FX from another bill/profile/provider suggestion.

When original currency and target currency differ, show:

```text
Original amount + currency
Exchange rate and direction
Converted amount + target currency
Requested rate date
Source rate date when different
Rate source
Override indicator
```

Example:

```text
Original amount: JPY 1,200
Exchange rate: 1 JPY = 0.0067 USD
Converted amount: USD 8.04
Requested rate date: 2026-05-02
Source: Frankfurter
```

## Recalculation Behavior

When user edits:

- Original amount: recalculate converted amount.
- Exchange rate: recalculate converted amount and mark override.
- Target currency: fetch/use matching rate and recalculate.
- Receipt/bill date: suggest historical rate for that date.
- Converted amount manually: reverse-calculate rate and mark override.

All recalculation must use centralized rounding policy. Any server-mode recalculation that changes financial truth must be persisted through an explicit bill edit/revision workflow with audit and affected-user review where required.

## Scheduled Fetch And On-Demand Lookup

Scheduled daily job:

```text
Fetch rates for configured common currency universes.
Save raw provider rate sets and quotes.
Materialize daily ordered pair rates for configured universes.
Do not mutate existing bills.
```

On-demand fallback:

```text
If resolved rate exists in DB for bill date, use saved rate as suggestion.
Otherwise fetch historical rate, save raw/provider/resolved data, then use saved rate as suggestion.
If provider fails or the currency is rare/unsupported, require manual rate entry.
```

Rare currencies do not need full daily materialization. They can be looked up and cached only when bill creation, import, reconciliation, reporting, or migration workflows actually need them.

## Statement Reconciliation Interaction

For card/bank statement matching:

- Bill FX snapshot represents expected/reference conversion.
- Statement settled amount represents actual bank/card charge.
- The app may show variance but must not overwrite bill rates automatically.
- Reconciliation can store statement-side amounts/rates separately from bill-side FX truth.

## Experience Modes Interaction

Experience modes and per-feature advanced toggles are defined in [User Experience Modes Architecture](USER_EXPERIENCE_MODES_ARCHITECTURE.md).

FX-specific UX guidance:

- Simple mode can hide advanced provider/source details for same-currency bills.
- A user can remain in Simple mode while enabling `advanced_fx`.
- UI mode controls visibility and workflow depth only.
- Backend/data model/security/audit rules stay the same regardless of UI mode.

## Future Contract, Schema, And API Implications

Later implementation tasks will likely need additive schema and OpenAPI design for:

- currency registry reads/admin policy;
- provider rate lookup and cache metadata;
- bill FX snapshots;
- group/context FX profile and rule proposals;
- FX approval states;
- bill-create FX suggestion responses;
- feature/experience preference reads and updates.

These are future implications only. This architecture document does not change the current contract.

## Non-Goals

- Real-time FX trading rates.
- Crypto rates.
- Automatic retroactive recalculation of historical bills.
- Bank/card fee modeling as the initial implementation.
- Physical deletion of currencies after financial use.
- Full nested group hierarchy before group expense contexts prove the model.
