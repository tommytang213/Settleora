import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollCacheExtent;

import '../ui/settleora_components.dart';
import '../ui/settleora_theme.dart';
import 'auth_session_repository.dart';

class SettleoraSignInScreen extends StatefulWidget {
  const SettleoraSignInScreen({
    super.key,
    required this.serverBaseUri,
    required this.onSignIn,
    required this.onChangeServer,
    this.noticeMessage,
  });

  final Uri serverBaseUri;
  final Future<void> Function(SettleoraSignInSubmission submission) onSignIn;
  final VoidCallback onChangeServer;
  final String? noticeMessage;

  @override
  State<SettleoraSignInScreen> createState() => _SettleoraSignInScreenState();
}

class _SettleoraSignInScreenState extends State<SettleoraSignInScreen> {
  final _formKey = GlobalKey<FormState>();
  final _identifierController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isSigningIn = false;
  SettleoraAuthFailure? _failure;

  @override
  void dispose() {
    _identifierController.dispose();
    _passwordController.dispose();
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

  @override
  Widget build(BuildContext context) {
    final failure = _failure;
    final notice = widget.noticeMessage;
    final colors = context.settleoraColors;

    return Scaffold(
      appBar: AppBar(title: const Text('Settleora')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            scrollCacheExtent: const ScrollCacheExtent.pixels(5000),
            padding: const EdgeInsets.fromLTRB(
              SettleoraSpacing.md,
              SettleoraSpacing.md,
              SettleoraSpacing.md,
              36,
            ),
            children: [
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
              AppCard(
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
            ],
          ),
        ),
      ),
    );
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
