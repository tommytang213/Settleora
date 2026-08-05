#define _GNU_SOURCE

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#ifndef SETTLEORA_DISPATCH_EXECUTABLE
#define SETTLEORA_DISPATCH_EXECUTABLE "/usr/bin/node"
#endif

#ifndef SETTLEORA_DISPATCH_MODULE
#define SETTLEORA_DISPATCH_MODULE "/opt/settleora/trusted-ssh/lib/settleora-trusted-ssh-dispatcher.mjs"
#endif

#define FORCE_COMMAND "settleora-handoff-v1"
#define PROGRAM_NAME "settleora-trusted-ssh-entry"
#define MAX_COMMAND_BYTES 128U

extern char **environ;

static void fail_closed(const char *code, int status) {
  (void)fprintf(stderr, "SETTLEORA_SSH_BOUNDARY_%s\n", code);
  _exit(status);
}

static int ascii_hex(const char *value, size_t length) {
  size_t index;
  for (index = 0; index < length; index += 1U) {
    const unsigned char byte = (unsigned char)value[index];
    if (!((byte >= (unsigned char)'0' && byte <= (unsigned char)'9')
          || (byte >= (unsigned char)'a' && byte <= (unsigned char)'f'))) {
      return 0;
    }
  }
  return value[length] == '\0';
}

static int handoff_key(const char *value) {
  size_t index;
  if (strlen(value) != 30U || value[8] != '-' || value[13] != '-') {
    return 0;
  }
  for (index = 0; index < 30U; index += 1U) {
    const unsigned char byte = (unsigned char)value[index];
    if (index == 8U || index == 13U) {
      continue;
    }
    if (index < 14U) {
      if (byte < (unsigned char)'0' || byte > (unsigned char)'9') {
        return 0;
      }
    } else if (!((byte >= (unsigned char)'0' && byte <= (unsigned char)'9')
                 || (byte >= (unsigned char)'a' && byte <= (unsigned char)'f'))) {
      return 0;
    }
  }
  return 1;
}

static const char *program_basename(const char *value) {
  const char *slash = strrchr(value, '/');
  return slash == NULL ? value : slash + 1;
}

int main(int argc, char **argv) {
  const char *original;
  const char *mode;
  const char *key;
  const char *operation;
  char command[MAX_COMMAND_BYTES + 1U];
  char *cursor;
  char *first_space;
  char *second_space;
  char *third_space;
  char *dispatch_argv[7];
  char *dispatch_env[6];
  size_t length;

  if (argc != 3 || strcmp(program_basename(argv[0]), PROGRAM_NAME) != 0
      || strcmp(argv[1], "-c") != 0 || strcmp(argv[2], FORCE_COMMAND) != 0) {
    fail_closed("E64", 64);
  }
  original = getenv("SSH_ORIGINAL_COMMAND");
  if (original == NULL) {
    fail_closed("E65", 65);
  }
  length = strnlen(original, MAX_COMMAND_BYTES + 1U);
  if (length == 0U || length > MAX_COMMAND_BYTES) {
    fail_closed("E65", 65);
  }
  (void)memcpy(command, original, length + 1U);
  for (cursor = command; *cursor != '\0'; cursor += 1) {
    const unsigned char byte = (unsigned char)*cursor;
    if (byte < 0x20U || byte > 0x7eU) {
      fail_closed("E65", 65);
    }
  }
  first_space = strchr(command, ' ');
  if (first_space == NULL) {
    fail_closed("E65", 65);
  }
  *first_space = '\0';
  second_space = strchr(first_space + 1, ' ');
  if (second_space == NULL) {
    fail_closed("E65", 65);
  }
  *second_space = '\0';
  third_space = strchr(second_space + 1, ' ');
  if (third_space == NULL || strchr(third_space + 1, ' ') != NULL) {
    fail_closed("E65", 65);
  }
  *third_space = '\0';
  if (strcmp(command, FORCE_COMMAND) != 0) {
    fail_closed("E65", 65);
  }
  mode = first_space + 1;
  key = second_space + 1;
  operation = third_space + 1;
  if ((strcmp(mode, "preflight") != 0 && strcmp(mode, "execute") != 0)
      || !handoff_key(key) || !ascii_hex(operation, 64U)) {
    fail_closed("E65", 65);
  }
  if (strcmp(mode, "execute") == 0 && !isatty(STDIN_FILENO)) {
    fail_closed("E66", 66);
  }

  if (clearenv() != 0) {
    fail_closed("E70", 70);
  }
  dispatch_argv[0] = (char *)SETTLEORA_DISPATCH_EXECUTABLE;
  dispatch_argv[1] = (char *)"--disable-proto=throw";
  dispatch_argv[2] = (char *)SETTLEORA_DISPATCH_MODULE;
  dispatch_argv[3] = (char *)mode;
  dispatch_argv[4] = (char *)key;
  dispatch_argv[5] = (char *)operation;
  dispatch_argv[6] = NULL;
  dispatch_env[0] = (char *)"HOME=/nonexistent";
  dispatch_env[1] = (char *)"LANG=C";
  dispatch_env[2] = (char *)"LC_ALL=C";
  dispatch_env[3] = (char *)"PATH=/usr/bin:/bin";
  dispatch_env[4] = (char *)"TZ=UTC";
  dispatch_env[5] = NULL;
  environ = dispatch_env;
  execve(SETTLEORA_DISPATCH_EXECUTABLE, dispatch_argv, dispatch_env);
  (void)errno;
  fail_closed("E70", 70);
  return 70;
}
