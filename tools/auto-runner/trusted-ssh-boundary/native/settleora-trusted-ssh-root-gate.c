#define _GNU_SOURCE

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#define NODE "/usr/bin/node"
#define MODULE "/opt/settleora/trusted-ssh/lib/settleora-trusted-ssh-root-gate.mjs"
#define GATE "/opt/settleora/trusted-ssh/bin/settleora-root-gate"
#define ACCOUNT "settleora_handoff"

int main(int argc, char **argv) {
  char *gate_argv[4];
  char *clean_env[6];
  (void)argv;
  const char *sudo_user = getenv("SUDO_USER");
  const char *sudo_command = getenv("SUDO_COMMAND");
  if (argc != 1 || getuid() != 0U || geteuid() != 0U || sudo_user == NULL || sudo_command == NULL
      || strcmp(sudo_user, ACCOUNT) != 0 || strcmp(sudo_command, GATE) != 0) {
    (void)fprintf(stderr, "SETTLEORA_ROOT_GATE_E64\n");
    return 64;
  }
  gate_argv[0] = (char *)NODE;
  gate_argv[1] = (char *)"--disable-proto=throw";
  gate_argv[2] = (char *)MODULE;
  gate_argv[3] = NULL;
  clean_env[0] = (char *)"HOME=/root";
  clean_env[1] = (char *)"LANG=C";
  clean_env[2] = (char *)"LC_ALL=C";
  clean_env[3] = (char *)"PATH=/usr/sbin:/usr/bin:/sbin:/bin";
  clean_env[4] = (char *)"TZ=UTC";
  clean_env[5] = NULL;
  execve(NODE, gate_argv, clean_env);
  (void)fprintf(stderr, "SETTLEORA_ROOT_GATE_E70\n");
  return 70;
}
