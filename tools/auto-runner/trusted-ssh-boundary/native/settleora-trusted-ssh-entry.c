#define SETTLEORA_SYS_WRITE 1L
#define SETTLEORA_SYS_IOCTL 16L
#define SETTLEORA_SYS_EXECVE 59L
#define SETTLEORA_SYS_EXIT 60L
#define SETTLEORA_TCGETS 0x5401UL

#ifndef SETTLEORA_DISPATCH_EXECUTABLE
#define SETTLEORA_DISPATCH_EXECUTABLE "/usr/bin/node"
#endif

#ifndef SETTLEORA_DISPATCH_MODULE
#define SETTLEORA_DISPATCH_MODULE "/opt/settleora/trusted-ssh/lib/settleora-trusted-ssh-dispatcher.mjs"
#endif

#define FORCE_COMMAND "settleora-handoff-v1"
#define PROGRAM_NAME "settleora-trusted-ssh-entry"
#define MAX_COMMAND_BYTES 128UL

typedef __SIZE_TYPE__ settleora_size_t;

static long syscall1(long number, long first) {
  register long result __asm__("rax") = number;
  register long argument1 __asm__("rdi") = first;
  __asm__ volatile("syscall" : "+a"(result) : "D"(argument1) : "rcx", "r11", "memory");
  return result;
}

static long syscall3(long number, long first, long second, long third) {
  register long result __asm__("rax") = number;
  register long argument1 __asm__("rdi") = first;
  register long argument2 __asm__("rsi") = second;
  register long argument3 __asm__("rdx") = third;
  __asm__ volatile("syscall" : "+a"(result) : "D"(argument1), "S"(argument2), "d"(argument3)
                   : "rcx", "r11", "memory");
  return result;
}

static settleora_size_t text_length(const char *value) {
  settleora_size_t length = 0UL;
  while (value[length] != '\0') length += 1UL;
  return length;
}

static int text_equal(const char *left, const char *right) {
  settleora_size_t index = 0UL;
  while (left[index] != '\0' && left[index] == right[index]) index += 1UL;
  return left[index] == right[index];
}

static int text_prefix(const char *value, const char *prefix) {
  settleora_size_t index = 0UL;
  while (prefix[index] != '\0') {
    if (value[index] != prefix[index]) return 0;
    index += 1UL;
  }
  return 1;
}

static const char *environment_value(char **environment, const char *name) {
  settleora_size_t name_length = text_length(name);
  settleora_size_t index;
  for (index = 0UL; environment[index] != (char *)0; index += 1UL) {
    if (text_prefix(environment[index], name) && environment[index][name_length] == '=') {
      return environment[index] + name_length + 1UL;
    }
  }
  return (const char *)0;
}

static void copy_bytes(char *target, const char *source, settleora_size_t count) {
  settleora_size_t index;
  for (index = 0UL; index < count; index += 1UL) target[index] = source[index];
}

__attribute__((noreturn)) static void fail_closed(int code) {
  static const char e64[] = "SETTLEORA_SSH_BOUNDARY_E64\n";
  static const char e65[] = "SETTLEORA_SSH_BOUNDARY_E65\n";
  static const char e66[] = "SETTLEORA_SSH_BOUNDARY_E66\n";
  static const char e70[] = "SETTLEORA_SSH_BOUNDARY_E70\n";
  const char *message = code == 64 ? e64 : code == 65 ? e65 : code == 66 ? e66 : e70;
  (void)syscall3(SETTLEORA_SYS_WRITE, 2L, (long)message, (long)text_length(message));
  (void)syscall1(SETTLEORA_SYS_EXIT, (long)code);
  __builtin_unreachable();
}

static int ascii_hex(const char *value, settleora_size_t length) {
  settleora_size_t index;
  for (index = 0UL; index < length; index += 1UL) {
    const unsigned char byte = (unsigned char)value[index];
    if (!((byte >= (unsigned char)'0' && byte <= (unsigned char)'9')
          || (byte >= (unsigned char)'a' && byte <= (unsigned char)'f'))) return 0;
  }
  return value[length] == '\0';
}

static int handoff_key(const char *value) {
  settleora_size_t index;
  if (text_length(value) != 30UL || value[8] != '-' || value[13] != '-') return 0;
  for (index = 0UL; index < 30UL; index += 1UL) {
    const unsigned char byte = (unsigned char)value[index];
    if (index == 8UL || index == 13UL) continue;
    if (index < 14UL ? (byte < (unsigned char)'0' || byte > (unsigned char)'9')
                     : !((byte >= (unsigned char)'0' && byte <= (unsigned char)'9')
                         || (byte >= (unsigned char)'a' && byte <= (unsigned char)'f'))) return 0;
  }
  return 1;
}

static const char *program_basename(const char *value) {
  const char *result = value;
  while (*value != '\0') { if (*value == '/') result = value + 1; value += 1; }
  return result;
}

__attribute__((used, noreturn)) static void entry_main(long argc, char **argv, char **environment) {
  const char *original;
  const char *mode;
  const char *key;
  const char *operation;
  char command[MAX_COMMAND_BYTES + 1UL];
  char *spaces[3];
  char *dispatch_argv[7];
  char *dispatch_env[6];
  settleora_size_t length = 0UL;
  settleora_size_t index;
  int space_count = 0;

  if (argc != 3L || !text_equal(program_basename(argv[0]), PROGRAM_NAME)
      || !text_equal(argv[1], "-c") || !text_equal(argv[2], FORCE_COMMAND)) fail_closed(64);
  original = environment_value(environment, "SSH_ORIGINAL_COMMAND");
  if (original == (const char *)0) fail_closed(65);
  while (length <= MAX_COMMAND_BYTES && original[length] != '\0') length += 1UL;
  if (length == 0UL || length > MAX_COMMAND_BYTES) fail_closed(65);
  copy_bytes(command, original, length + 1UL);
  for (index = 0UL; index < length; index += 1UL) {
    const unsigned char byte = (unsigned char)command[index];
    if (byte < 0x20U || byte > 0x7eU) fail_closed(65);
    if (command[index] == ' ') {
      if (space_count >= 3) fail_closed(65);
      spaces[space_count] = command + index;
      space_count += 1;
    }
  }
  if (space_count != 3) fail_closed(65);
  *spaces[0] = '\0'; *spaces[1] = '\0'; *spaces[2] = '\0';
  mode = spaces[0] + 1; key = spaces[1] + 1; operation = spaces[2] + 1;
  if (!text_equal(command, FORCE_COMMAND)
      || (!text_equal(mode, "preflight") && !text_equal(mode, "execute"))
      || !handoff_key(key) || !ascii_hex(operation, 64UL)) fail_closed(65);
  if (text_equal(mode, "execute")) {
    unsigned char terminal_state[64];
    if (syscall3(SETTLEORA_SYS_IOCTL, 0L, SETTLEORA_TCGETS, (long)terminal_state) < 0L) fail_closed(66);
  }

  dispatch_argv[0] = (char *)SETTLEORA_DISPATCH_EXECUTABLE;
  dispatch_argv[1] = (char *)"--disable-proto=throw";
  dispatch_argv[2] = (char *)SETTLEORA_DISPATCH_MODULE;
  dispatch_argv[3] = (char *)mode;
  dispatch_argv[4] = (char *)key;
  dispatch_argv[5] = (char *)operation;
  dispatch_argv[6] = (char *)0;
  dispatch_env[0] = (char *)"HOME=/nonexistent";
  dispatch_env[1] = (char *)"LANG=C";
  dispatch_env[2] = (char *)"LC_ALL=C";
  dispatch_env[3] = (char *)"PATH=/usr/bin:/bin";
  dispatch_env[4] = (char *)"TZ=UTC";
  dispatch_env[5] = (char *)0;
  (void)syscall3(SETTLEORA_SYS_EXECVE, (long)SETTLEORA_DISPATCH_EXECUTABLE,
                 (long)dispatch_argv, (long)dispatch_env);
  fail_closed(70);
}

__attribute__((naked, noreturn)) void _start(void) {
  __asm__ volatile(
    "xor %rbp,%rbp\n"
    "mov (%rsp),%rdi\n"
    "lea 8(%rsp),%rsi\n"
    "lea 16(%rsp,%rdi,8),%rdx\n"
    "andq $-16,%rsp\n"
    "call entry_main\n"
  );
}
