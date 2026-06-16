import 'package:flutter/material.dart';

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

    return Scaffold(
      appBar: AppBar(title: const Text('Settleora')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
            children: [
              Text(
                'Sign in to Settleora',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 6),
              Text(
                'Server authentication is required before collaboration, shared records, sync acceptance, or account data are available.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 6),
              Text(
                'Changing server configuration clears saved session material for that configured server only. It does not migrate local data, upload records, link accounts, or create a backup.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              if (notice != null) ...[
                const SizedBox(height: 14),
                _StatusMessage(
                  icon: Icons.info_outline,
                  title: 'Sign in required',
                  message: notice,
                ),
              ],
              if (failure != null) ...[
                const SizedBox(height: 14),
                _StatusMessage(
                  icon: Icons.error_outline,
                  title: failure.title,
                  message: failure.safeDisplayMessage,
                ),
              ],
              const SizedBox(height: 18),
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
              const SizedBox(height: 12),
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
              const SizedBox(height: 18),
              FilledButton.icon(
                key: const Key('sign-in-submit'),
                onPressed: _isSigningIn ? null : _submit,
                icon: _isSigningIn
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.login_outlined),
                label: const Text('Sign in'),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                key: const Key('sign-in-change-server'),
                onPressed: _isSigningIn ? null : widget.onChangeServer,
                icon: const Icon(Icons.tune_outlined),
                label: const Text('Change Server'),
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
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 20, color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: 2),
                  Text(message),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
