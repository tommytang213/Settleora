# Group Membership and Participation Architecture

## Purpose

This document defines Day 2 group membership behavior for guest members, inactive/default-excluded members, and historical access.

The current Day 1 foundation runtime is narrower: group create/list/read/update endpoints support registered users with `active` `owner` or `member` memberships only. Creating a group creates an active owner membership for the authenticated creator. Invitation flow, member management, guest placeholders, default-excluded/left status runtime behavior, group presets, and bill participation rules are still future work.

## Member types

A group participant may be:

```text
registered_user
guest_placeholder
```

Guest placeholders can be included in bills and later linked to a registered account.

## Member participation status

Recommended statuses:

```text
active
default_excluded
left
```

Future status:

```text
removed
```

Avoid implementing hard removal until retention and financial-history access rules are finalized.

## Active member

- Included in new bills by default.
- Can be selected for splits.
- Can view authorized group records.
- Receives relevant group notifications.

## Default-excluded member

Used when someone remains in historical records but should not be included in new bills by default.

Examples:

- Colleague left company.
- Former roommate.
- Trip member no longer active.

Behavior:

- Not included in new bills by default.
- Can still view old bills they were involved in, subject to authorization.
- Can still settle old outstanding balances.
- Can be manually included in a new bill if permitted.
- Does not receive notifications for new bills they are not included in.

## Left member

- No longer participates in new group activity.
- Retains historical access only where required/permitted.
- Can settle outstanding balances involving them.
- Does not see unrelated future bills.

## Historical record rule

Do not remove members from old bills just because their participation status changes.

Old bills retain original participants, payers, split records, and audit history.

## New bill default selection

New bill participant defaults:

```text
active members: selected by default
default_excluded members: not selected by default
left members: hidden or disabled unless special permission/reopen flow applies
```

## Authorization rule

Default-excluded or left members must not automatically see future bills.

Rule:

```text
A member can see a bill only if API authorization allows it.
Default-excluded status does not grant visibility to unrelated future bills.
```

## Notifications

Suggested behavior:

| Event | Active | Default-excluded | Left |
|---|---:|---:|---:|
| New bill included in | Yes | Yes if included | Usually no unless included by correction flow |
| New bill not included in | Yes if group policy allows | No | No |
| Old bill involving member updated | Yes | Yes | Yes if still authorized |
| Settlement involving member | Yes | Yes | Yes |
| Group policy affecting access | Yes | Maybe/Yes | Maybe |

## Audit

Audit events should cover:

```text
member_status_changed
member_default_excluded
member_reactivated
member_left_group
member_included_in_bill_after_default_excluded
guest_member_created
guest_member_claimed
```

## Non-goals

- Silent removal from historical bills.
- Default-excluded members viewing unrelated future bills.
- Guest governance voting before account claim/linking.
