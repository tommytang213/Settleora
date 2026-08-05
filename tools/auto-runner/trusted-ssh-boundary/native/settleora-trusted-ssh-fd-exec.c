#define _GNU_SOURCE

#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#ifndef SETTLEORA_EXPECTED_ENTRY_UID
#define SETTLEORA_EXPECTED_ENTRY_UID 0U
#endif

static void fail_closed(const char *code, int status) {
  (void)fprintf(stderr, "SETTLEORA_SSH_GATE_%s\n", code);
  _exit(status);
}

static int ascii_hex(const char *value, size_t length) {
  size_t index;
  if (strlen(value) != length) {
    return 0;
  }
  for (index = 0; index < length; index += 1U) {
    const unsigned char byte = (unsigned char)value[index];
    if (!((byte >= (unsigned char)'0' && byte <= (unsigned char)'9')
          || (byte >= (unsigned char)'a' && byte <= (unsigned char)'f'))) {
      return 0;
    }
  }
  return 1;
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
    if (index < 14U ? (byte < (unsigned char)'0' || byte > (unsigned char)'9')
                    : !((byte >= (unsigned char)'0' && byte <= (unsigned char)'9')
                        || (byte >= (unsigned char)'a' && byte <= (unsigned char)'f'))) {
      return 0;
    }
  }
  return 1;
}

int main(int argc, char **argv) {
  struct stat entry;
  struct stat package_directory;
  int flags;
  char *bash_argv[7];
  char *clean_env[6];
  const char *phase;

  if (argc != 4 || (strcmp(argv[1], "preflight") != 0 && strcmp(argv[1], "execute") != 0)
      || !handoff_key(argv[2]) || !ascii_hex(argv[3], 64U)) {
    fail_closed("E64", 64);
  }
  if (fstat(3, &entry) != 0 || !S_ISREG(entry.st_mode) || entry.st_uid != SETTLEORA_EXPECTED_ENTRY_UID
      || entry.st_nlink != 1 || (entry.st_mode & 0022) != 0) {
    fail_closed("E65", 65);
  }
  if (fstat(4, &package_directory) != 0 || !S_ISDIR(package_directory.st_mode)
      || package_directory.st_uid != SETTLEORA_EXPECTED_ENTRY_UID || (package_directory.st_mode & 0022) != 0
      || fchdir(4) != 0) {
    fail_closed("E65", 65);
  }
  flags = fcntl(3, F_GETFD);
  if (flags < 0 || fcntl(3, F_SETFD, flags & ~FD_CLOEXEC) != 0) {
    fail_closed("E70", 70);
  }
  if (strcmp(argv[1], "execute") == 0 && !isatty(STDIN_FILENO)) {
    fail_closed("E66", 66);
  }
  phase = strcmp(argv[1], "execute") == 0 ? "--execute" : "--preflight";
  bash_argv[0] = (char *)"/usr/bin/bash";
  bash_argv[1] = (char *)"--noprofile";
  bash_argv[2] = (char *)"--norc";
  bash_argv[3] = (char *)"/proc/self/fd/3";
  bash_argv[4] = (char *)phase;
  bash_argv[5] = argv[3];
  bash_argv[6] = NULL;
  clean_env[0] = (char *)"HOME=/nonexistent";
  clean_env[1] = (char *)"LANG=C";
  clean_env[2] = (char *)"LC_ALL=C";
  clean_env[3] = (char *)"PATH=/usr/bin:/bin";
  clean_env[4] = (char *)"TZ=UTC";
  clean_env[5] = NULL;
  execve("/usr/bin/bash", bash_argv, clean_env);
  fail_closed("E70", 70);
  return 70;
}
