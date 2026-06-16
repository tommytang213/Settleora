import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app/auth_session_repository.dart';
import 'profile_repository.dart';

const _paymentMethodMaxLength = 120;
const _paymentHandleMaxLength = 320;
const _paymentNoteMaxLength = 1000;

class SettleoraProfileScreen extends StatefulWidget {
  const SettleoraProfileScreen({
    super.key,
    required this.repository,
    required this.currentUser,
    this.onSessionEnded,
  });

  final SettleoraProfileRepository repository;
  final SettleoraCurrentUser currentUser;
  final Future<void> Function(String? noticeMessage)? onSessionEnded;

  @override
  State<SettleoraProfileScreen> createState() => _SettleoraProfileScreenState();
}

class _SettleoraProfileScreenState extends State<SettleoraProfileScreen> {
  final _displayNameController = TextEditingController();
  final _defaultCurrencyController = TextEditingController();
  final _paymentMethodController = TextEditingController();
  final _paymentHandleController = TextEditingController();
  final _paymentNoteController = TextEditingController();

  bool _isLoading = true;
  bool _isSavingProfile = false;
  bool _isSavingPaymentDetails = false;
  SettleoraSelfProfile? _profile;
  SettleoraSelfPaymentDetails? _paymentDetails;
  SettleoraProfileFailure? _loadFailure;
  SettleoraProfileFailure? _profileSaveFailure;
  SettleoraProfileFailure? _paymentSaveFailure;
  SettleoraPaymentDetailsVisibility _paymentVisibility =
      SettleoraPaymentDetailsVisibilityValues.settlementCounterpartiesOnly;

  bool get _isSavingAny => _isSavingProfile || _isSavingPaymentDetails;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  @override
  void dispose() {
    _displayNameController.dispose();
    _defaultCurrencyController.dispose();
    _paymentMethodController.dispose();
    _paymentHandleController.dispose();
    _paymentNoteController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (_isSavingAny) {
      return;
    }

    setState(() {
      _isLoading = true;
      _loadFailure = null;
      _profileSaveFailure = null;
      _paymentSaveFailure = null;
    });

    try {
      final profile = await widget.repository.getSelfProfile();
      final paymentDetails = await widget.repository.getSelfPaymentDetails();
      if (!mounted) {
        return;
      }

      setState(() {
        _applyProfile(profile);
        _applyPaymentDetails(paymentDetails);
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _loadFailure = SettleoraProfileFailure.from(error);
        _isLoading = false;
      });
    }
  }

  Future<void> _saveProfile() async {
    if (_isSavingAny) {
      return;
    }

    setState(() {
      _isSavingProfile = true;
      _profileSaveFailure = null;
    });

    try {
      final updated = await widget.repository.updateSelfProfile(
        SettleoraSelfProfileUpdate(
          displayName: _displayNameController.text,
          defaultCurrency: _defaultCurrencyController.text,
        ),
      );
      if (!mounted) {
        return;
      }

      setState(() {
        _applyProfile(updated);
      });
      final refreshFailure = await _refreshAfterSave();
      if (!mounted) {
        return;
      }

      if (refreshFailure == null) {
        _showSnackBar('Profile updated.');
      } else {
        setState(() {
          _profileSaveFailure = refreshFailure;
        });
        _showSnackBar('Profile saved. Refresh before saving again.');
      }
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _profileSaveFailure = SettleoraProfileFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSavingProfile = false;
        });
      }
    }
  }

  Future<void> _savePaymentDetails() async {
    if (_isSavingAny) {
      return;
    }

    final preferredMethodLabel = _trimToNull(_paymentMethodController.text);
    final paymentHandle = _trimToNull(_paymentHandleController.text);
    final paymentNote = _trimToNull(_paymentNoteController.text);
    final validationFailure = _validatePaymentDetails(
      preferredMethodLabel: preferredMethodLabel,
      paymentHandle: paymentHandle,
      paymentNote: paymentNote,
      visibility: _paymentVisibility,
    );
    if (validationFailure != null) {
      setState(() {
        final paymentDetails = _paymentDetails;
        if (paymentDetails != null) {
          _applyPaymentDetails(paymentDetails);
        }
        _paymentSaveFailure = validationFailure;
      });
      return;
    }

    setState(() {
      _isSavingPaymentDetails = true;
      _paymentSaveFailure = null;
    });

    try {
      final updated = await widget.repository.updateSelfPaymentDetails(
        SettleoraSelfPaymentDetailsUpdate(
          preferredMethodLabel: preferredMethodLabel,
          paymentHandle: paymentHandle,
          paymentNote: paymentNote,
          visibility: _paymentVisibility,
        ),
      );
      if (!mounted) {
        return;
      }

      setState(() {
        _applyPaymentDetails(updated);
      });
      final refreshFailure = await _refreshAfterSave();
      if (!mounted) {
        return;
      }

      if (refreshFailure == null) {
        _showSnackBar('Payment details updated.');
      } else {
        setState(() {
          _paymentSaveFailure = refreshFailure;
        });
        _showSnackBar('Payment details saved. Refresh before saving again.');
      }
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        final paymentDetails = _paymentDetails;
        if (paymentDetails != null) {
          _applyPaymentDetails(paymentDetails);
        }
        _paymentSaveFailure = SettleoraProfileFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSavingPaymentDetails = false;
        });
      }
    }
  }

  void _cancelPaymentDetailsEdit() {
    final paymentDetails = _paymentDetails;
    if (paymentDetails == null) {
      return;
    }

    setState(() {
      _applyPaymentDetails(paymentDetails);
      _paymentSaveFailure = null;
    });
  }

  Future<SettleoraProfileFailure?> _refreshAfterSave() async {
    try {
      final profile = await widget.repository.getSelfProfile();
      final paymentDetails = await widget.repository.getSelfPaymentDetails();
      if (!mounted) {
        return null;
      }

      setState(() {
        _applyProfile(profile);
        _applyPaymentDetails(paymentDetails);
      });
      return null;
    } catch (error) {
      final failure = SettleoraProfileFailure.from(error);
      return SettleoraProfileFailure(
        kind: failure.kind,
        statusCode: failure.statusCode,
        message:
            'Saved on the server, but the follow-up refresh failed. Refresh account details before saving again.',
      );
    }
  }

  void _applyProfile(SettleoraSelfProfile profile) {
    _profile = profile;
    _displayNameController.text = profile.displayName;
    _defaultCurrencyController.text = profile.defaultCurrency ?? '';
  }

  void _applyPaymentDetails(SettleoraSelfPaymentDetails paymentDetails) {
    _paymentDetails = paymentDetails;
    _paymentMethodController.text = paymentDetails.preferredMethodLabel ?? '';
    _paymentHandleController.text = paymentDetails.paymentHandle ?? '';
    _paymentNoteController.text = paymentDetails.paymentNote ?? '';
    _paymentVisibility =
        SettleoraPaymentDetailsVisibilityValues.values.contains(
          paymentDetails.visibility,
        )
        ? paymentDetails.visibility
        : SettleoraPaymentDetailsVisibilityValues.settlementCounterpartiesOnly;
  }

  Future<void> _endSession(SettleoraProfileFailure failure) async {
    final onSessionEnded = widget.onSessionEnded;
    if (onSessionEnded == null) {
      return;
    }

    if (mounted && Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    }

    await onSessionEnded(failure.message);
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final profile = _profile;
    final paymentDetails = _paymentDetails;
    final loadFailure = _loadFailure;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        actions: [
          IconButton(
            key: const Key('profile-refresh'),
            tooltip: 'Refresh',
            onPressed: _isLoading || _isSavingAny ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: Builder(
          builder: (context) {
            if (_isLoading) {
              return const _LoadingPanel();
            }

            if (loadFailure != null) {
              return _FailurePanel(
                failure: loadFailure,
                onRetry: _load,
                onSessionEnded: widget.onSessionEnded == null
                    ? null
                    : () => _endSession(loadFailure),
              );
            }

            if (profile == null || paymentDetails == null) {
              return _FailurePanel(
                failure: const SettleoraProfileFailure(
                  kind: SettleoraProfileFailureKind.unavailable,
                  message: 'Account details are no longer available.',
                ),
                onRetry: _load,
              );
            }

            return RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
                children: [
                  _SignedInSummary(
                    currentUser: widget.currentUser,
                    profile: profile,
                  ),
                  const SizedBox(height: 12),
                  const _AccountPrivacyBoundaryReadout(),
                  const SizedBox(height: 20),
                  _Section(
                    title: 'Profile',
                    children: [
                      TextField(
                        key: const Key('profile-display-name'),
                        controller: _displayNameController,
                        textInputAction: TextInputAction.next,
                        maxLength: 160,
                        decoration: const InputDecoration(
                          labelText: 'Display name',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        key: const Key('profile-default-currency'),
                        controller: _defaultCurrencyController,
                        textCapitalization: TextCapitalization.characters,
                        maxLength: 3,
                        decoration: const InputDecoration(
                          labelText: 'Default currency',
                          hintText: 'USD',
                          helperText:
                              'Optional 3-letter code. Blank clears your preference.',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      if (_profileSaveFailure != null) ...[
                        const SizedBox(height: 8),
                        _InlineFailure(failure: _profileSaveFailure!),
                      ],
                      const SizedBox(height: 12),
                      FilledButton.icon(
                        key: const Key('profile-save'),
                        onPressed: _isSavingAny ? null : _saveProfile,
                        icon: _isSavingProfile
                            ? const SizedBox.square(
                                dimension: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.save_outlined),
                        label: const Text('Save Profile'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  _Section(
                    title: 'Payment Details',
                    children: [
                      _PaymentDetailsSummary(details: paymentDetails),
                      const SizedBox(height: 8),
                      Text(
                        'Blank or cleared payment fields are saved as not set. Visibility is a server-returned profile fact, not a client-side authorization decision.',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Payment details are not globally visible. The API decides who may see them, including settlement-scoped counterparty access.',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        key: const Key('profile-payment-method'),
                        controller: _paymentMethodController,
                        textInputAction: TextInputAction.next,
                        maxLength: _paymentMethodMaxLength,
                        maxLengthEnforcement: MaxLengthEnforcement.none,
                        decoration: const InputDecoration(
                          labelText: 'Payment method',
                          hintText: 'Bank transfer',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        key: const Key('profile-payment-handle'),
                        controller: _paymentHandleController,
                        textInputAction: TextInputAction.next,
                        maxLength: _paymentHandleMaxLength,
                        maxLengthEnforcement: MaxLengthEnforcement.none,
                        decoration: const InputDecoration(
                          labelText: 'Payment handle',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        key: const Key('profile-payment-note'),
                        controller: _paymentNoteController,
                        maxLines: 3,
                        maxLength: _paymentNoteMaxLength,
                        maxLengthEnforcement: MaxLengthEnforcement.none,
                        decoration: const InputDecoration(
                          labelText: 'Payment note',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 10),
                      InputDecorator(
                        decoration: const InputDecoration(
                          labelText: 'Visibility',
                          border: OutlineInputBorder(),
                        ),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<String>(
                            key: const Key('profile-payment-visibility'),
                            value: _paymentVisibility,
                            isExpanded: true,
                            items: [
                              for (final value
                                  in SettleoraPaymentDetailsVisibilityValues
                                      .values)
                                DropdownMenuItem(
                                  value: value,
                                  child: Text(
                                    settleoraPaymentDetailsVisibilityLabel(
                                      value,
                                    ),
                                  ),
                                ),
                            ],
                            onChanged: _isSavingAny
                                ? null
                                : (value) {
                                    if (value == null) {
                                      return;
                                    }

                                    setState(() {
                                      _paymentVisibility = value;
                                    });
                                  },
                          ),
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Changing this value saves a requested profile fact; it does not grant counterparty permission by itself.',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      const SizedBox(height: 12),
                      _QrStatus(details: paymentDetails),
                      if (_paymentSaveFailure != null) ...[
                        const SizedBox(height: 8),
                        _InlineFailure(failure: _paymentSaveFailure!),
                      ],
                      const SizedBox(height: 12),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          FilledButton.icon(
                            key: const Key('profile-payment-save'),
                            onPressed: _isSavingAny
                                ? null
                                : _savePaymentDetails,
                            icon: _isSavingPaymentDetails
                                ? const SizedBox.square(
                                    dimension: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(Icons.save_outlined),
                            label: const Text('Save Payment Details'),
                          ),
                          const SizedBox(height: 8),
                          OutlinedButton.icon(
                            key: const Key('profile-payment-cancel'),
                            onPressed: _isSavingAny
                                ? null
                                : _cancelPaymentDetailsEdit,
                            icon: const Icon(Icons.close),
                            label: const Text('Cancel'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _PaymentDetailsSummary extends StatelessWidget {
  const _PaymentDetailsSummary({required this.details});

  final SettleoraSelfPaymentDetails details;

  @override
  Widget build(BuildContext context) {
    final method = _trimToNull(details.preferredMethodLabel);
    final handle = _trimToNull(details.paymentHandle);
    final note = _trimToNull(details.paymentNote);
    final hasTextDetails = method != null || handle != null || note != null;
    final visibility =
        SettleoraPaymentDetailsVisibilityValues.values.contains(
          details.visibility,
        )
        ? details.visibility
        : SettleoraPaymentDetailsVisibilityValues.settlementCounterpartiesOnly;

    return Semantics(
      container: true,
      label: 'Payment details summary',
      child: DecoratedBox(
        key: const Key('profile-payment-summary'),
        decoration: BoxDecoration(
          border: Border.all(
            color: Theme.of(context).colorScheme.outlineVariant,
          ),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.payments_outlined,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          hasTextDetails
                              ? 'Payment details on file'
                              : 'No payment details yet',
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          hasTextDetails
                              ? settleoraPaymentDetailsVisibilityDescription(
                                  visibility,
                                )
                              : 'Blank or cleared payment fields mean the API currently has no payment text to show.',
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              _PaymentSummaryRow(
                label: 'Method',
                value: method ?? 'Not set',
                isEmpty: method == null,
              ),
              _PaymentSummaryRow(
                label: 'Handle',
                value: handle ?? 'Not set',
                isEmpty: handle == null,
              ),
              if (note != null)
                _PaymentSummaryRow(label: 'Note', value: note)
              else
                const _PaymentSummaryRow(
                  label: 'Note',
                  value: 'Not set',
                  isEmpty: true,
                ),
              _PaymentSummaryRow(
                label: 'Visibility',
                value: settleoraPaymentDetailsVisibilityLabel(visibility),
              ),
              const SizedBox(height: 6),
              Text(
                details.isConfigured
                    ? 'Server authorization still controls who can read these details.'
                    : 'The visibility value is the server-returned default/readout for an unconfigured payment profile.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PaymentSummaryRow extends StatelessWidget {
  const _PaymentSummaryRow({
    required this.label,
    required this.value,
    this.isEmpty = false,
  });

  final String label;
  final String value;
  final bool isEmpty;

  @override
  Widget build(BuildContext context) {
    final valueStyle = Theme.of(context).textTheme.bodyMedium?.copyWith(
      color: isEmpty
          ? Theme.of(context).colorScheme.onSurfaceVariant
          : Theme.of(context).colorScheme.onSurface,
    );

    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 78,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          Expanded(child: Text(value, style: valueStyle)),
        ],
      ),
    );
  }
}

class _SignedInSummary extends StatelessWidget {
  const _SignedInSummary({required this.currentUser, required this.profile});

  final SettleoraCurrentUser currentUser;
  final SettleoraSelfProfile profile;

  @override
  Widget build(BuildContext context) {
    final displayCurrency =
        profile.defaultCurrency ?? currentUser.defaultCurrency;

    return DecoratedBox(
      key: const Key('profile-summary'),
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListTile(
        leading: const CircleAvatar(child: Icon(Icons.person_outline)),
        title: Text(profile.displayName),
        subtitle: Text(
          displayCurrency == null
              ? 'Signed in'
              : 'Signed in - $displayCurrency',
        ),
      ),
    );
  }
}

class _AccountPrivacyBoundaryReadout extends StatelessWidget {
  const _AccountPrivacyBoundaryReadout();

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    return DecoratedBox(
      key: const Key('profile-account-boundary-readout'),
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              Icons.privacy_tip_outlined,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Account and profile rows are server-returned readouts. Cached rows, hidden controls, route state, generated-client availability, UI mode, and preferences do not authorize data access, storage access, privacy policy, financial policy, or audit behavior.',
                style: TextStyle(color: muted),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QrStatus extends StatelessWidget {
  const _QrStatus({required this.details});

  final SettleoraSelfPaymentDetails details;

  @override
  Widget build(BuildContext context) {
    final qrFile = details.qrFile;

    return DecoratedBox(
      key: const Key('profile-qr-status'),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListTile(
        leading: Icon(
          qrFile == null
              ? Icons.qr_code_2_outlined
              : Icons.check_circle_outline,
        ),
        title: Text(qrFile == null ? 'QR not linked' : 'QR available'),
        subtitle: Text(
          qrFile == null
              ? 'No QR metadata is linked. QR upload, removal, content reading, and image handling stay in a separate file-handling slice.'
              : 'Metadata only: ${qrFile.contentType} - ${_formatSize(qrFile.sizeBytes)} - updated ${_formatTimestamp(qrFile.updatedAtUtc)}. QR bytes, file IDs, storage paths, and download URLs are not shown here; upload, removal, and content handling stay in a separate file-handling slice.',
        ),
      ),
    );
  }
}

class _InlineFailure extends StatelessWidget {
  const _InlineFailure({required this.failure});

  final SettleoraProfileFailure failure;

  @override
  Widget build(BuildContext context) {
    return Text(
      failure.message,
      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
        color: Theme.of(context).colorScheme.error,
      ),
    );
  }
}

class _FailurePanel extends StatelessWidget {
  const _FailurePanel({
    required this.failure,
    required this.onRetry,
    this.onSessionEnded,
  });

  final SettleoraProfileFailure failure;
  final VoidCallback onRetry;
  final VoidCallback? onSessionEnded;

  @override
  Widget build(BuildContext context) {
    final requiresSignIn =
        failure.kind == SettleoraProfileFailureKind.sessionRequired ||
        failure.kind == SettleoraProfileFailureKind.sessionExpired;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              requiresSignIn ? Icons.lock_outline : Icons.cloud_off_outlined,
              size: 42,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(height: 14),
            Text(
              failure.title,
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text(failure.message, textAlign: TextAlign.center),
            const SizedBox(height: 14),
            if (requiresSignIn && onSessionEnded != null)
              FilledButton.icon(
                key: const Key('profile-sign-in-required'),
                onPressed: onSessionEnded,
                icon: const Icon(Icons.login_outlined),
                label: const Text('Sign In'),
              )
            else
              OutlinedButton.icon(
                key: const Key('profile-retry'),
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('Retry'),
              ),
          ],
        ),
      ),
    );
  }
}

class _LoadingPanel extends StatelessWidget {
  const _LoadingPanel();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircularProgressIndicator(),
          SizedBox(height: 14),
          Text('Loading account details'),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 10),
        ...children,
      ],
    );
  }
}

String _formatTimestamp(DateTime value) {
  return value.toLocal().toString().split('.').first;
}

String _formatSize(int sizeBytes) {
  if (sizeBytes < 1024) {
    return '$sizeBytes bytes';
  }

  final kib = sizeBytes / 1024;
  return '${kib.toStringAsFixed(kib >= 10 ? 0 : 1)} KB';
}

SettleoraProfileFailure? _validatePaymentDetails({
  required String? preferredMethodLabel,
  required String? paymentHandle,
  required String? paymentNote,
  required SettleoraPaymentDetailsVisibility visibility,
}) {
  if (preferredMethodLabel != null &&
      preferredMethodLabel.length > _paymentMethodMaxLength) {
    return const SettleoraProfileFailure(
      kind: SettleoraProfileFailureKind.validation,
      message: 'Payment method must be 120 characters or fewer.',
    );
  }

  if (paymentHandle != null && paymentHandle.length > _paymentHandleMaxLength) {
    return const SettleoraProfileFailure(
      kind: SettleoraProfileFailureKind.validation,
      message: 'Payment handle must be 320 characters or fewer.',
    );
  }

  if (paymentNote != null && paymentNote.length > _paymentNoteMaxLength) {
    return const SettleoraProfileFailure(
      kind: SettleoraProfileFailureKind.validation,
      message: 'Payment note must be 1000 characters or fewer.',
    );
  }

  if (!SettleoraPaymentDetailsVisibilityValues.values.contains(visibility)) {
    return const SettleoraProfileFailure(
      kind: SettleoraProfileFailureKind.validation,
      message: 'Choose a supported payment visibility.',
    );
  }

  return null;
}

String? _trimToNull(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  return trimmed;
}
