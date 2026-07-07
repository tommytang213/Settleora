import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollCacheExtent;

import '../ui/settleora_components.dart';
import '../ui/settleora_theme.dart';
import 'auth_session_repository.dart';
import 'password_reset_repository.dart';

class SettleoraSignInScreen extends StatefulWidget {
  const SettleoraSignInScreen({
    super.key,
    required this.serverBaseUri,
    required this.passwordResetRepository,
    required this.onSignIn,
    required this.onChangeServer,
    this.noticeMessage,
  });

  final Uri serverBaseUri;
  final SettleoraPasswordResetRepository passwordResetRepository;
  final Future<void> Function(SettleoraSignInSubmission submission) onSignIn;
  final VoidCallback onChangeServer;
  final String? noticeMessage;

  @override
  State<SettleoraSignInScreen> createState() => _SettleoraSignInScreenState();
}

class _SettleoraSignInScreenState extends State<SettleoraSignInScreen> {
  final _formKey = GlobalKey<FormState>();
  final _resetFormKey = GlobalKey<FormState>();
  final _identifierController = TextEditingController();
  final _passwordController = TextEditingController();
  final _resetIdentifierController = TextEditingController();
  bool _isSigningIn = false;
  bool _isRequestingReset = false;
  bool _isResetRequestVisible = false;
  bool _isResetSubmitted = false;
  SettleoraAuthFailure? _failure;
  SettleoraPasswordResetFailure? _resetFailure;

  @override
  void dispose() {
    _identifierController.dispose();
    _passwordController.dispose();
    _resetIdentifierController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_isSigningIn) {
      return;
    }

    final form = _formKey.currentState;
    if (form == null || !form.validate()) {
      return;
    }

    setState(() {
      _isSigningIn = true;
      _failure = null;
    });

    try {
      await widget.onSignIn(
        SettleoraSignInSubmission(
          identifier: _identifierController.text,
          password: _passwordController.text,
        ),
      );
    } on SettleoraAuthFailure catch (failure) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = failure;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = const SettleoraAuthFailure(
          kind: SettleoraAuthFailureKind.storage,
          message:
              'Sign-in could not be saved on this device. Try again later.',
        );
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSigningIn = false;
        });
      }
    }
  }

  String? _validateIdentifier(String? value) {
    if ((value ?? '').trim().isEmpty) {
      return 'Enter your account identifier.';
    }

    return null;
  }

  String? _validatePassword(String? value) {
    if ((value ?? '').trim().isEmpty) {
      return 'Enter your password.';
    }

    return null;
  }

  void _showResetRequest() {
    setState(() {
      _isResetRequestVisible = true;
      _isResetSubmitted = false;
      _resetFailure = null;
      _resetIdentifierController.text = _identifierController.text.trim();
    });
  }

  void _backToSignIn() {
    setState(() {
      _isResetRequestVisible = false;
      _isResetSubmitted = false;
      _isRequestingReset = false;
      _resetFailure = null;
    });
  }

  String? _validateResetIdentifier(String? value) {
    if ((value ?? '').trim().isEmpty) {
      return 'Enter your email or username.';
    }

    return null;
  }

  Future<void> _requestReset() async {
    if (_isRequestingReset) {
      return;
    }

    final form = _resetFormKey.currentState;
    if (form == null || !form.validate()) {
      return;
    }

    setState(() {
      _isRequestingReset = true;
      _resetFailure = null;
    });

    try {
      await widget.passwordResetRepository.requestReset(
        SettleoraPasswordResetRequest(
          resetIdentifier: _resetIdentifierController.text,
        ),
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _isResetSubmitted = true;
      });
    } on SettleoraPasswordResetFailure catch (failure) {
      if (!mounted) {
        return;
      }

      setState(() {
        _resetFailure = failure;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _resetFailure = const SettleoraPasswordResetFailure(
          kind: SettleoraPasswordResetFailureKind.unavailable,
          message:
              'We could not process this request right now. Try again later.',
        );
      });
    } finally {
      if (mounted) {
        setState(() {
          _isRequestingReset = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final failure = _failure;
    final notice = widget.noticeMessage;
    final colors = context.settleoraColors;
    final resetFailure = _resetFailure;

    return Scaffold(
      appBar: AppBar(title: const Text('Settleora')),
      body: SafeArea(
        child: ListView(
          scrollCacheExtent: const ScrollCacheExtent.pixels(5000),
          padding: const EdgeInsets.fromLTRB(
            SettleoraSpacing.md,
            SettleoraSpacing.md,
            SettleoraSpacing.md,
            36,
          ),
          children: _isResetSubmitted
              ? _buildResetSubmittedContent()
              : _isResetRequestVisible
              ? _buildResetRequestContent(resetFailure)
              : _buildSignInContent(colors, notice, failure),
        ),
      ),
    );
  }

  List<Widget> _buildSignInContent(
    SettleoraColors colors,
    String? notice,
    SettleoraAuthFailure? failure,
  ) {
    return [
      AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SettleoraCompactHeader(
              title: 'Sign in to Settleora',
              subtitle:
                  'Use your server account to sync bills, groups, and settlements.',
              leadingIcon: Icons.lock_outline,
            ),
            const SizedBox(height: SettleoraSpacing.sm),
            Text(
              'Change server clears this device session only.',
              style: TextStyle(color: colors.textSubtle),
            ),
          ],
        ),
      ),
      if (notice != null) ...[
        const SizedBox(height: SettleoraSpacing.sm),
        _StatusMessage(
          icon: Icons.info_outline,
          title: 'Session expired',
          message: notice,
        ),
      ],
      if (failure != null) ...[
        const SizedBox(height: SettleoraSpacing.sm),
        _StatusMessage(
          icon: Icons.error_outline,
          title: failure.title,
          message: failure.safeDisplayMessage,
        ),
      ],
      const SizedBox(height: SettleoraSpacing.sm),
      Form(
        key: _formKey,
        child: AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                key: const Key('sign-in-identifier'),
                controller: _identifierController,
                enabled: !_isSigningIn,
                keyboardType: TextInputType.emailAddress,
                autocorrect: false,
                autofillHints: const [
                  AutofillHints.username,
                  AutofillHints.email,
                ],
                textInputAction: TextInputAction.next,
                validator: _validateIdentifier,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  labelText: 'Account identifier',
                  prefixIcon: Icon(Icons.person_outline),
                ),
              ),
              const SizedBox(height: SettleoraSpacing.sm),
              TextFormField(
                key: const Key('sign-in-password'),
                controller: _passwordController,
                enabled: !_isSigningIn,
                obscureText: true,
                autocorrect: false,
                enableSuggestions: false,
                autofillHints: const [AutofillHints.password],
                textInputAction: TextInputAction.done,
                onFieldSubmitted: (_) => _submit(),
                validator: _validatePassword,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  labelText: 'Password',
                  prefixIcon: Icon(Icons.lock_outline),
                ),
              ),
              const SizedBox(height: SettleoraSpacing.md),
              SizedBox(
                key: const Key('sign-in-submit'),
                width: double.infinity,
                child: AppButton(
                  label: 'Sign in',
                  onPressed: _isSigningIn ? null : _submit,
                  icon: Icons.login_outlined,
                  expanded: true,
                ),
              ),
              if (_isSigningIn) ...[
                const SizedBox(height: SettleoraSpacing.sm),
                const Center(
                  child: SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              ],
              const SizedBox(height: SettleoraSpacing.xs),
              SizedBox(
                key: const Key('sign-in-forgot-password'),
                width: double.infinity,
                child: AppButton(
                  label: 'Forgot password?',
                  onPressed: _isSigningIn ? null : _showResetRequest,
                  icon: Icons.help_outline,
                  variant: AppButtonVariant.soft,
                  expanded: true,
                ),
              ),
              const SizedBox(height: SettleoraSpacing.xs),
              SizedBox(
                key: const Key('sign-in-change-server'),
                width: double.infinity,
                child: AppButton(
                  label: 'Change Server',
                  onPressed: _isSigningIn ? null : widget.onChangeServer,
                  icon: Icons.tune_outlined,
                  variant: AppButtonVariant.secondary,
                  expanded: true,
                ),
              ),
            ],
          ),
        ),
      ),
    ];
  }

  List<Widget> _buildResetRequestContent(
    SettleoraPasswordResetFailure? resetFailure,
  ) {
    return [
      const AppCard(
        child: SettleoraCompactHeader(
          title: 'Reset your password',
          subtitle:
              'Enter the email or username you use for Settleora. If password reset is available for that account, you can continue from the reset link.',
          leadingIcon: Icons.lock_reset_outlined,
        ),
      ),
      if (resetFailure != null) ...[
        const SizedBox(height: SettleoraSpacing.sm),
        _StatusMessage(
          icon: Icons.error_outline,
          title: resetFailure.title,
          message: resetFailure.message,
        ),
      ],
      const SizedBox(height: SettleoraSpacing.sm),
      Form(
        key: _resetFormKey,
        child: AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                key: const Key('password-reset-identifier'),
                controller: _resetIdentifierController,
                enabled: !_isRequestingReset,
                keyboardType: TextInputType.emailAddress,
                autocorrect: false,
                autofillHints: const [
                  AutofillHints.username,
                  AutofillHints.email,
                ],
                textInputAction: TextInputAction.done,
                onFieldSubmitted: (_) => _requestReset(),
                validator: _validateResetIdentifier,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  labelText: 'Email or username',
                  hintText: 'name@example.com',
                  prefixIcon: Icon(Icons.alternate_email_outlined),
                ),
              ),
              const SizedBox(height: SettleoraSpacing.md),
              SizedBox(
                key: const Key('password-reset-submit'),
                width: double.infinity,
                child: AppButton(
                  label: 'Send reset link',
                  onPressed: _isRequestingReset ? null : _requestReset,
                  icon: Icons.outgoing_mail,
                  expanded: true,
                ),
              ),
              if (_isRequestingReset) ...[
                const SizedBox(height: SettleoraSpacing.sm),
                const Center(
                  child: SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              ],
              const SizedBox(height: SettleoraSpacing.xs),
              SizedBox(
                key: const Key('password-reset-back-to-sign-in'),
                width: double.infinity,
                child: AppButton(
                  label: 'Back to sign in',
                  onPressed: _isRequestingReset ? null : _backToSignIn,
                  icon: Icons.arrow_back,
                  variant: AppButtonVariant.secondary,
                  expanded: true,
                ),
              ),
            ],
          ),
        ),
      ),
    ];
  }

  List<Widget> _buildResetSubmittedContent() {
    return [
      const AppCard(
        child: SettleoraCompactHeader(
          title: 'Check your next step',
          subtitle:
              'If password reset is available for that account, use the reset link to continue. You can return to sign in now.',
          leadingIcon: Icons.mark_email_read_outlined,
        ),
      ),
      const SizedBox(height: SettleoraSpacing.sm),
      const SettleoraInlinePanel(
        icon: Icons.info_outline,
        title: 'Sign-in provider',
        message:
            "For accounts managed by an external sign-in provider, use that provider's recovery options.",
      ),
      const SizedBox(height: SettleoraSpacing.sm),
      AppCard(
        child: SizedBox(
          key: const Key('password-reset-submitted-back-to-sign-in'),
          width: double.infinity,
          child: AppButton(
            label: 'Back to sign in',
            onPressed: _backToSignIn,
            icon: Icons.arrow_back,
            expanded: true,
          ),
        ),
      ),
    ];
  }
}

class _StatusMessage extends StatelessWidget {
  const _StatusMessage({
    required this.icon,
    required this.title,
    required this.message,
  });

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return SettleoraInlinePanel(
      icon: icon,
      title: title,
      message: message,
      variant: icon == Icons.error_outline
          ? SettleoraSurfaceVariant.danger
          : SettleoraSurfaceVariant.info,
    );
  }
}
