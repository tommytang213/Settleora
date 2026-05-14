import 'package:flutter/material.dart';

import 'app_configuration.dart';

class SettleoraSetupScreen extends StatefulWidget {
  const SettleoraSetupScreen({
    super.key,
    required this.onSaveConfiguration,
    this.initialConfiguration,
  });

  final SettleoraAppConfiguration? initialConfiguration;
  final Future<void> Function(SettleoraAppConfiguration configuration)
  onSaveConfiguration;

  @override
  State<SettleoraSetupScreen> createState() => _SettleoraSetupScreenState();
}

class _SettleoraSetupScreenState extends State<SettleoraSetupScreen> {
  final _formKey = GlobalKey<FormState>();
  late SettleoraAppMode _selectedMode;
  late final TextEditingController _serverBaseUrlController;
  bool _isSaving = false;
  ServerBaseUriValidationResult? _lastValidation;

  @override
  void initState() {
    super.initState();
    final initial = widget.initialConfiguration;
    _selectedMode = initial?.mode ?? SettleoraAppMode.server;
    _serverBaseUrlController = TextEditingController(
      text: initial?.serverBaseUri?.toString() ?? '',
    );
  }

  @override
  void dispose() {
    _serverBaseUrlController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_isSaving) {
      return;
    }

    final configuration = switch (_selectedMode) {
      SettleoraAppMode.local => const SettleoraAppConfiguration.local(),
      SettleoraAppMode.server => _serverConfigurationFromForm(),
    };

    if (configuration == null) {
      return;
    }

    setState(() {
      _isSaving = true;
    });

    try {
      await widget.onSaveConfiguration(configuration);
    } finally {
      if (mounted) {
        setState(() {
          _isSaving = false;
        });
      }
    }
  }

  SettleoraAppConfiguration? _serverConfigurationFromForm() {
    final form = _formKey.currentState;
    if (form == null || !form.validate()) {
      return null;
    }

    final validation = validateServerBaseUri(_serverBaseUrlController.text);
    setState(() {
      _lastValidation = validation;
    });

    final normalized = validation.normalizedUri;
    if (normalized == null) {
      return null;
    }

    return SettleoraAppConfiguration.server(serverBaseUri: normalized);
  }

  String? _validateServerBaseUrl(String? value) {
    final validation = validateServerBaseUri(value ?? '');
    _lastValidation = validation;
    return validation.errorMessage;
  }

  @override
  Widget build(BuildContext context) {
    final isServerMode = _selectedMode == SettleoraAppMode.server;
    final warning = isServerMode ? _lastValidation?.warningMessage : null;

    return Scaffold(
      appBar: AppBar(title: const Text('Settleora Setup')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
            children: [
              Text(
                'Choose how this device should start.',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              SegmentedButton<SettleoraAppMode>(
                key: const Key('setup-mode-choice'),
                segments: const [
                  ButtonSegment(
                    value: SettleoraAppMode.server,
                    icon: Icon(Icons.cloud_outlined),
                    label: Text('Connect'),
                  ),
                  ButtonSegment(
                    value: SettleoraAppMode.local,
                    icon: Icon(Icons.phone_android_outlined),
                    label: Text('Local'),
                  ),
                ],
                selected: {_selectedMode},
                onSelectionChanged: _isSaving
                    ? null
                    : (selection) {
                        setState(() {
                          _selectedMode = selection.single;
                          _lastValidation = null;
                        });
                      },
              ),
              const SizedBox(height: 18),
              if (isServerMode)
                _ServerModeFormFields(
                  controller: _serverBaseUrlController,
                  enabled: !_isSaving,
                  warning: warning,
                  validator: _validateServerBaseUrl,
                )
              else
                const _LocalModeNotice(),
              const SizedBox(height: 18),
              FilledButton.icon(
                key: const Key('setup-save'),
                onPressed: _isSaving ? null : _save,
                icon: _isSaving
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Icon(
                        isServerMode
                            ? Icons.cloud_done_outlined
                            : Icons.check_circle_outline,
                      ),
                label: Text(isServerMode ? 'Save Server' : 'Use Local Mode'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ServerModeFormFields extends StatelessWidget {
  const _ServerModeFormFields({
    required this.controller,
    required this.enabled,
    required this.warning,
    required this.validator,
  });

  final TextEditingController controller;
  final bool enabled;
  final String? warning;
  final String? Function(String?) validator;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextFormField(
          key: const Key('setup-server-base-url'),
          controller: controller,
          enabled: enabled,
          keyboardType: TextInputType.url,
          autocorrect: false,
          textInputAction: TextInputAction.done,
          validator: validator,
          decoration: const InputDecoration(
            border: OutlineInputBorder(),
            labelText: 'Server base URL',
            helperText:
                'HTTPS is recommended. HTTP is only for local development.',
            prefixIcon: Icon(Icons.link_outlined),
          ),
        ),
        if (warning != null) ...[
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                Icons.developer_mode_outlined,
                color: Theme.of(context).colorScheme.primary,
                size: 20,
              ),
              const SizedBox(width: 8),
              Expanded(child: Text(warning!)),
            ],
          ),
        ],
      ],
    );
  }
}

class _LocalModeNotice extends StatelessWidget {
  const _LocalModeNotice();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Padding(
        padding: EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.info_outline),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'Local Mode keeps this device separate. Server collaboration, friends, groups, and server sync are unavailable until the local runtime exists.',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
