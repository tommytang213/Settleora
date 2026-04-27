# Settleora API

This directory will contain the ASP.NET Core Web API.

The API is the only owner of core business database writes. Business rules, authorization, audit logging, money calculation, rounding, and policy application belong here or in shared backend/domain services.

File metadata will live in PostgreSQL. File bytes will go through storage abstractions, and API responses must not expose direct storage or filesystem paths.
