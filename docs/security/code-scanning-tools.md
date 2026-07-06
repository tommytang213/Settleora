# Code Scanning Tools

Settleora uses GitHub code scanning as the central place to review static
security findings. CodeQL remains the existing SAST/code scanning baseline.
This repository also runs two free advisory scanners:

- Trivy scans the checked-out repository filesystem for dependency,
  configuration, and vulnerability signals.
- Semgrep Community Edition runs open source static rules with
  `semgrep scan`.

Both Trivy and Semgrep CE workflows are intentionally non-blocking during the
baseline phase. Scanner findings should be triaged in GitHub Security / Code
scanning where SARIF upload is permitted, but a pull request should not fail
only because one of these scanners reports a finding.

The workflows do not require paid services, hosted vendor dashboards, or
repository secrets. `SEMGREP_APP_TOKEN` is not used, and Semgrep runs in
stand-alone Community Edition mode.

This setup does not fix, dismiss, suppress, or change existing CodeQL alerts.
It only adds additional SARIF-producing scanner workflows.

## Future Tightening Plan

Baseline triage should happen before enforcement changes. After the initial
alert volume is understood, the workflows can be tightened to fail only on
high-confidence Critical or High findings. Generated, dependency, and build
noise should stay excluded, while real source code remains included.
