#define SETTLEORA_SYS_WRITE 1L
#define SETTLEORA_SYS_GETUID 102L
#define SETTLEORA_SYS_GETEUID 107L
#define SETTLEORA_SYS_EXECVE 59L
#define SETTLEORA_SYS_EXIT 60L
#define NODE "/usr/bin/node"
#define MODULE "/opt/settleora/trusted-ssh/lib/settleora-trusted-ssh-root-gate.mjs"
#define GATE "/opt/settleora/trusted-ssh/bin/settleora-root-gate"
#define ACCOUNT "settleora_handoff"

typedef __SIZE_TYPE__ settleora_size_t;

static long syscall0(long number) {
  register long result __asm__("rax") = number;
  __asm__ volatile("syscall" : "+a"(result) : : "rcx", "r11", "memory");
  return result;
}

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
  while (prefix[index] != '\0') { if (value[index] != prefix[index]) return 0; index += 1UL; }
  return 1;
}

static const char *environment_value(char **environment, const char *name) {
  const settleora_size_t name_length = text_length(name);
  settleora_size_t index;
  for (index = 0UL; environment[index] != (char *)0; index += 1UL) {
    if (text_prefix(environment[index], name) && environment[index][name_length] == '=') {
      return environment[index] + name_length + 1UL;
    }
  }
  return (const char *)0;
}

static int canonical_id(const char *value) {
  settleora_size_t index;
  const settleora_size_t length = value == (const char *)0 ? 0UL : text_length(value);
  if (length < 1UL || length > 10UL || (length > 1UL && value[0] == '0')) return 0;
  for (index = 0UL; index < length; index += 1UL) if (value[index] < '0' || value[index] > '9') return 0;
  return value[0] != '0';
}

__attribute__((noreturn)) static void fail_closed(int status) {
  static const char e64[] = "SETTLEORA_ROOT_GATE_E64\n";
  static const char e70[] = "SETTLEORA_ROOT_GATE_E70\n";
  const char *message = status == 64 ? e64 : e70;
  (void)syscall3(SETTLEORA_SYS_WRITE, 2L, (long)message, (long)text_length(message));
  (void)syscall1(SETTLEORA_SYS_EXIT, (long)status);
  __builtin_unreachable();
}

__attribute__((used, noreturn)) static void gate_main(long argc, char **argv, char **environment) {
  const char *sudo_user = environment_value(environment, "SUDO_USER");
  const char *sudo_command = environment_value(environment, "SUDO_COMMAND");
  const char *sudo_uid = environment_value(environment, "SUDO_UID");
  const char *sudo_gid = environment_value(environment, "SUDO_GID");
  char *gate_argv[6];
  char *clean_env[6];
  (void)argv;
  if (argc != 1L || syscall0(SETTLEORA_SYS_GETUID) != 0L || syscall0(SETTLEORA_SYS_GETEUID) != 0L
      || sudo_user == (const char *)0 || sudo_command == (const char *)0
      || !text_equal(sudo_user, ACCOUNT) || !text_equal(sudo_command, GATE)
      || !canonical_id(sudo_uid) || !canonical_id(sudo_gid)) fail_closed(64);
  gate_argv[0] = (char *)NODE;
  gate_argv[1] = (char *)"--disable-proto=throw";
  gate_argv[2] = (char *)MODULE;
  gate_argv[3] = (char *)sudo_uid;
  gate_argv[4] = (char *)sudo_gid;
  gate_argv[5] = (char *)0;
  clean_env[0] = (char *)"HOME=/root";
  clean_env[1] = (char *)"LANG=C";
  clean_env[2] = (char *)"LC_ALL=C";
  clean_env[3] = (char *)"PATH=/usr/sbin:/usr/bin:/sbin:/bin";
  clean_env[4] = (char *)"TZ=UTC";
  clean_env[5] = (char *)0;
  (void)syscall3(SETTLEORA_SYS_EXECVE, (long)NODE, (long)gate_argv, (long)clean_env);
  fail_closed(70);
}

__attribute__((naked, noreturn)) void _start(void) {
  __asm__ volatile(
    "xor %rbp,%rbp\n"
    "mov (%rsp),%rdi\n"
    "lea 8(%rsp),%rsi\n"
    "lea 16(%rsp,%rdi,8),%rdx\n"
    "andq $-16,%rsp\n"
    "call gate_main\n"
  );
}
