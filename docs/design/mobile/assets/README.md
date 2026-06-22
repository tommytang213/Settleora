# Mobile Design Reference Assets

This folder is for manually exported screenshots/assets from approved Figma references.

External visual reference:

https://www.figma.com/make/GhwORBnM4Y3YISs9CsobRy/High-Fidelity-Mobile-UI-Design?p=f&t=sW5ANl6oatYfwQBi-0

Rules:

- Do not commit generated Figma code.
- Do not commit Figma prompt text files.
- Prefer compressed PNG or WebP.
- Commit only approved reference frames, not every iteration.
- Do not add empty placeholder image files.
- Screenshots and exports are visual reference artifacts only; repo architecture and API/domain authority still govern implementation.
- Screenshot assets do not authorize runtime behavior, business logic, OpenAPI, generated-client, database, auth/session/security, storage, money, bill, settlement, payment, deployment, CI, or secret changes.

Approved slice directories:

- `mobile-shell-v1/` - mobile shell, Home, More, navigation, and shared shell/component screenshots.
- `bills-ocr-v1/` - Bills, add bill, receipt capture, OCR review, item assignment, and Bills/OCR shared-component screenshots.
- `groups-v1/` - Groups list, group dashboard, members/manage members, group bill context, group balances, and Groups shared-component screenshots.
- `settle-v1/` - Settle dashboard, balances, suggested settlements, request payment, settle up, confirm receipt, settlement detail/history, payment proof/details, and Settle shared-component screenshots.
- `more-settings-v1/` - More hub, profile/account, payment details, app settings, appearance/theme, privacy/security, sessions/devices, notifications settings, data/import/export, local/server mode, and settings shared-component screenshots.
- `notifications-v1/` - Notification Center, Review Queue, notification detail, bulk triage, notification states, and notification shared-component screenshots.

Suggested filename patterns:

- `mobile-shell-v1/mobile-shell-home.png`
- `mobile-shell-v1/mobile-shell-more.png`
- `mobile-shell-v1/mobile-shell-components.png`
- `bills-ocr-v1/bills-list.png`
- `bills-ocr-v1/bills-needs-review.png`
- `bills-ocr-v1/bills-ocr-review.png`
- `bills-ocr-v1/bills-shared-components.png`
- `groups-v1/groups-list.png`
- `groups-v1/group-dashboard.png`
- `groups-v1/group-members.png`
- `groups-v1/group-balances.png`
- `groups-v1/groups-shared-components.png`
- `settle-v1/settle-dashboard.png`
- `settle-v1/settle-balances.png`
- `settle-v1/settle-request-payment.png`
- `settle-v1/settle-confirm-receipt.png`
- `settle-v1/settle-shared-components.png`
- `more-settings-v1/more-hub-part-01-v1.png`
- `more-settings-v1/profile-account-part-01-v1.png`
- `more-settings-v1/payment-details-part-01-v1.png`
- `more-settings-v1/add-payment-method-picker-part-01-v1.png`
- `more-settings-v1/appearance-part-01-v1.png`
- `more-settings-v1/sessions-devices-part-01-v1.png`
- `more-settings-v1/settings-shared-components-part-01-v1.png`
- `notifications-v1/notification-center-part-01-v1.png`
- `notifications-v1/review-queue-part-01-v1.png`
- `notifications-v1/notification-detail-part-01-v1.png`
- `notifications-v1/bulk-triage-v1.png`
- `notifications-v1/notification-shared-components-part-01-v1.png`

Use the slice prefix plus a short screen or component name when additional frames are needed, for example `groups-v1/group-manage-members-sheet.png` or `settle-v1/settle-provider-payment-status.png`.
