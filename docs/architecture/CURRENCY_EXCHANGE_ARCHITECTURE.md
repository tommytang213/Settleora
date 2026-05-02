# Currency Exchange Architecture

## Purpose

Settleora supports expenses and bills in different currencies. Currency exchange is introduced as a Day 2 feature using Frankfurter as the first provider.

The goal is to support daily and historical exchange rates for receipts, bills, settlements, forecasting, and reporting while preserving financial correctness.

## Authority principles

- Money remains decimal-safe.
- Currency is always attached to monetary values.
- Rounding remains centralized.
- Backend/domain services are authoritative for conversions that affect server-mode records.
- Existing bills must not be silently recalculated when new rates are fetched.

## Provider model

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

## Exchange rate storage

Suggested table: `exchange_rates`

```text
id
base_currency
quote_currency
rate
rate_date
provider
fetched_at
source_reference
created_at
```

Suggested unique constraint:

```text
base_currency, quote_currency, rate_date, provider
```

## Bill-level exchange snapshot

Bills/expenses that use currency conversion must store the rate used for that bill.

Suggested fields:

```text
original_amount
original_currency
target_amount
target_currency
exchange_rate
exchange_rate_date
exchange_rate_source
exchange_rate_id nullable
exchange_rate_overridden
exchange_rate_override_reason nullable
```

Rule:

```text
Global exchange rates are reference data.
Bill exchange-rate snapshots are financial truth for the bill.
```

## UI fields

When original currency and target currency differ, show:

```text
Original amount + currency
Exchange rate and direction
Converted amount + target currency
Rate date
Rate source
Override indicator
```

Example:

```text
Original amount: JPY 1,200
Exchange rate: 1 JPY = 0.0067 USD
Converted amount: USD 8.04
Rate date: 2026-05-02
Source: Frankfurter
```

## Recalculation behavior

When user edits:

- Original amount: recalculate converted amount.
- Exchange rate: recalculate converted amount and mark override.
- Target currency: fetch/use matching rate and recalculate.
- Receipt/bill date: suggest historical rate for that date.
- Converted amount manually: reverse-calculate rate and mark override.

All recalculation must use centralized rounding policy.

## Scheduled fetch

Daily job:

```text
Fetch rates for configured supported currencies.
Save rates to exchange_rates.
Do not mutate existing bills.
```

On-demand fallback:

```text
If rate exists in DB for bill date, use saved rate.
Otherwise fetch historical rate, save it, then use saved rate.
If provider fails, allow manual rate entry.
```

## Statement reconciliation interaction

For card/bank statement matching:

- Bill FX snapshot represents expected/reference conversion.
- Statement settled amount represents actual bank/card charge.
- The app may show the variance but must not overwrite bill rates automatically.

## Audit

Audit events should cover:

- Manual exchange-rate override.
- Exchange rate changed after bill creation.
- Target currency changed.
- Converted amount changed.
- Provider/rate source changed.

## Non-goals

- Real-time FX trading rates.
- Crypto rates.
- Automatic retroactive recalculation of historical bills.
- Bank/card fee modeling as the initial implementation.
