#!/usr/bin/node
import {
  renderNativeInstallRemoteControllerFlowSource,
  renderNativeInstallWindowsSshCoordinatorSource,
} from "./lib/semantic-recovery-native-install-handoff.mjs";

export function main(argv = process.argv.slice(2), output = process.stdout, errorOutput = process.stderr) {
  if (argv.length !== 1 || !["--windows-ssh-coordinator", "--remote-controller-flow"].includes(argv[0])) {
    errorOutput.write("one closed native install handoff rendering mode is required\n");
    return 1;
  }
  const source = argv[0] === "--windows-ssh-coordinator"
    ? renderNativeInstallWindowsSshCoordinatorSource()
    : renderNativeInstallRemoteControllerFlowSource();
  output.write(`${source}\n`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main();
