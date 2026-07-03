import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollCacheExtent;

import '../ui/settleora_components.dart';
import '../ui/settleora_theme.dart';
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
    final colors = context.settleoraColors;

    return Scaffold(
      appBar: AppBar(title: const Text('Settleora Setup')),
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
                      title: 'Choose your Settleora mode',
                      subtitle:
                          'Connect to a server to sync, or keep this device local.',
                      leadingIcon: Icons.shield_moon_outlined,
                    ),
                    const SizedBox(height: SettleoraSpacing.md),
                    Wrap(
                      spacing: SettleoraSpacing.xs,
                      runSpacing: SettleoraSpacing.xs,
                      children: const [
                        StatusChip(
                          label: 'Server checked',
                          icon: Icons.verified_user_outlined,
                          variant: StatusChipVariant.info,
                          size: StatusChipSize.small,
                        ),
                        StatusChip(
                          label: 'Local stays local',
                          icon: Icons.phone_android_outlined,
                          variant: StatusChipVariant.neutral,
                          size: StatusChipSize.small,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: SettleoraSpacing.sm),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Device setup',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: SettleoraSpacing.xs),
                    Text(
                      'Choose how this device should start.',
                      style: TextStyle(color: colors.textMuted),
                    ),
                    const SizedBox(height: SettleoraSpacing.md),
                    SegmentedButton<SettleoraAppMode>(
                      key: const Key('setup-mode-choice'),
                      segments: const [
                        ButtonSegment(
                          value: SettleoraAppMode.server,
                          icon: Icon(Icons.cloud_outlined),
                          label: Text('Connect to server'),
                        ),
                        ButtonSegment(
                          value: SettleoraAppMode.local,
                          icon: Icon(Icons.phone_android_outlined),
                          label: Text('Use local mode'),
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
                  ],
                ),
              ),
              const SizedBox(height: SettleoraSpacing.sm),
              if (isServerMode)
                _ServerModeFormFields(
                  controller: _serverBaseUrlController,
                  enabled: !_isSaving,
                  isSaving: _isSaving,
                  onSave: _save,
                  warning: warning,
                  validator: _validateServerBaseUrl,
                ),
              if (!isServerMode) ...[
                const SizedBox(height: SettleoraSpacing.md),
                SizedBox(
                  key: const Key('setup-save'),
                  width: double.infinity,
                  child: AppButton(
                    label: 'Use local mode',
                    onPressed: _isSaving ? null : _save,
                    icon: Icons.check_circle_outline,
                    expanded: true,
                  ),
                ),
              ],
              if (_isSaving) ...[
                const SizedBox(height: SettleoraSpacing.sm),
                const Center(
                  child: SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              ],
              if (!isServerMode) ...[
                const SizedBox(height: SettleoraSpacing.sm),
                const _LocalModeNotice(),
              ],
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
    required this.isSaving,
    required this.onSave,
    required this.warning,
    required this.validator,
  });

  final TextEditingController controller;
  final bool enabled;
  final bool isSaving;
  final VoidCallback onSave;
  final String? warning;
  final String? Function(String?) validator;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;

    return AppCard(
      child: Column(
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
              helperText: 'Use the server address from your Settleora admin.',
              prefixIcon: Icon(Icons.link_outlined),
            ),
          ),
          const SizedBox(height: SettleoraSpacing.md),
          SizedBox(
            key: const Key('setup-save'),
            width: double.infinity,
            child: AppButton(
              label: 'Save Server',
              onPressed: isSaving ? null : onSave,
              icon: Icons.cloud_done_outlined,
              expanded: true,
            ),
          ),
          const SizedBox(height: SettleoraSpacing.sm),
          _CompactBoundaryText(
            icon: Icons.verified_user_outlined,
            text: 'Connect to your Settleora server to sync and share bills.',
            color: colors.textMuted,
          ),
          const SizedBox(height: SettleoraSpacing.xs),
          _CompactBoundaryText(
            icon: Icons.swap_horiz_outlined,
            text: 'Changing server signs out this device only.',
            color: colors.textMuted,
          ),
          if (warning != null) ...[
            const SizedBox(height: SettleoraSpacing.sm),
            SettleoraInlinePanel(
              icon: Icons.developer_mode_outlined,
              title: 'Development server',
              message: warning!,
              variant: SettleoraSurfaceVariant.warning,
            ),
          ],
        ],
      ),
    );
  }
}

class _CompactBoundaryText extends StatelessWidget {
  const _CompactBoundaryText({
    required this.icon,
    required this.text,
    required this.color,
  });

  final IconData icon;
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(width: SettleoraSpacing.xs),
        Expanded(
          child: Text(
            text,
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: color, letterSpacing: 0),
          ),
        ),
      ],
    );
  }
}

class _LocalModeNotice extends StatelessWidget {
  const _LocalModeNotice();

  @override
  Widget build(BuildContext context) {
    return const SettleoraInlinePanel(
      icon: Icons.info_outline,
      title: 'Use local mode',
      message:
          'Keep data on this device only. Sharing and server backup are unavailable.',
      variant: SettleoraSurfaceVariant.info,
    );
  }
}
