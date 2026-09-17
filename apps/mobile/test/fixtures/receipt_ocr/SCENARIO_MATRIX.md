# Receipt OCR Scenario Matrix

This corpus intentionally includes cases that a user actually encounters rather than only receipts that politely print an ISO currency code next to every number.

## Currency resolution

| Symbol/pattern | Why tricky | Fixtures | Expected rule |
|---|---|---|---|
| `$` | Used by USD, HKD, CAD, AUD, SGD, NZD, MXN and others | HK, US, Canada, Australia, Singapore, New Zealand, Mexico, fallback, unresolved | explicit marker > receipt context > configured fallback > unresolved |
| `¥` | Shared by JPY and CNY | Japan, China, unresolved | infer only with strong country/script context; otherwise unresolved |
| `kr` | Shared by SEK, NOK, DKK and others | Sweden, Norway, unresolved | infer from country/tax context; otherwise unresolved |
| `Rs` | Common shorthand for INR, PKR and others | India, Pakistan, unresolved | infer from country/tax context; otherwise unresolved |
| prefixed dollar symbols | `HK$`, `US$`, `CA$`, `A$`, `S$`, `NZ$`, `NT$`, `R$` | explicit-symbol fixtures | treat as explicit high-confidence evidence |

## Locale/number formats

- decimal comma and currency after amount
- dot thousands + comma decimals
- apostrophe thousands
- Indian digit grouping
- zero-decimal JPY/KRW/VND
- three-decimal KWD/BHD
- Arabic-Indic digits and Arabic decimal separator

## Common semantic/layout cases

- service charge, tax and actual tip
- suggested tip percentages that are not charges
- weighted produce quantity x unit price
- coupons, loyalty discounts and signed credits
- nested modifiers/set meals
- wrapped item descriptions
- multiple tax rates and tax-included totals
- cash tender/change and card-terminal metadata
- hotel deposits and amount due
- utility previous balance/payment/current charges
- refunds and negative totals
- split payment
- dual-currency reference amounts
- dynamic currency conversion (explicit charged currency overrides location)
- bilingual receipt lines
- multiple dates
- missing date / missing merchant
- numeric noise from receipt IDs, phone, register/table numbers and time
- legitimate zero total after full discount
- parking entry/exit times
- taxi toll/tip
- e-commerce shipping/discount/tax
- pharmacy Rx/dosage/count numeric noise

## Image degradation

The corpus also has deterministic rotation, fade/low-contrast, blur, heavy JPEG compression, perspective skew, shadow and close-crop variants.
