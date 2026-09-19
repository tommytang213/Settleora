#include <arpa/inet.h>
#include <errno.h>
#include <stdbool.h>
#include <stddef.h>
#include <sys/socket.h>

static bool settleora_is_external(const struct sockaddr *address) {
  if (address == NULL) return false;
  if (address->sa_family == AF_INET) {
    const struct sockaddr_in *ipv4 = (const struct sockaddr_in *)address;
    return (ntohl(ipv4->sin_addr.s_addr) >> 24) != 127;
  }
  if (address->sa_family == AF_INET6) {
    const struct sockaddr_in6 *ipv6 = (const struct sockaddr_in6 *)address;
    return !IN6_IS_ADDR_LOOPBACK(&ipv6->sin6_addr);
  }
  return false;
}

static int settleora_deny(void) {
  errno = ENETUNREACH;
  return -1;
}

static int settleora_connect(
    int socket_descriptor,
    const struct sockaddr *address,
    socklen_t address_length) {
  if (settleora_is_external(address)) return settleora_deny();
  return connect(socket_descriptor, address, address_length);
}

static ssize_t settleora_sendto(
    int socket_descriptor,
    const void *buffer,
    size_t length,
    int flags,
    const struct sockaddr *destination,
    socklen_t destination_length) {
  if (settleora_is_external(destination)) return settleora_deny();
  return sendto(
      socket_descriptor,
      buffer,
      length,
      flags,
      destination,
      destination_length);
}

static ssize_t settleora_sendmsg(
    int socket_descriptor,
    const struct msghdr *message,
    int flags) {
  if (message != NULL &&
      settleora_is_external((const struct sockaddr *)message->msg_name)) {
    return settleora_deny();
  }
  return sendmsg(socket_descriptor, message, flags);
}

static int settleora_connectx(
    int socket_descriptor,
    const sa_endpoints_t *endpoints,
    sae_associd_t association_id,
    unsigned int flags,
    const struct iovec *iov,
    unsigned int iov_count,
    size_t *length,
    sae_connid_t *connection_id) {
  if (endpoints != NULL && settleora_is_external(endpoints->sae_dstaddr)) {
    return settleora_deny();
  }
  return connectx(
      socket_descriptor,
      endpoints,
      association_id,
      flags,
      iov,
      iov_count,
      length,
      connection_id);
}

#define SETTLEORA_INTERPOSE(replacement, replacee)                       \
  __attribute__((used)) static struct {                                  \
    const void *replacement;                                             \
    const void *replacee;                                                \
  } settleora_interpose_##replacee                                       \
      __attribute__((section("__DATA,__interpose"))) = {                 \
          (const void *)(unsigned long)&replacement,                     \
          (const void *)(unsigned long)&replacee,                        \
      }

SETTLEORA_INTERPOSE(settleora_connect, connect);
SETTLEORA_INTERPOSE(settleora_sendto, sendto);
SETTLEORA_INTERPOSE(settleora_sendmsg, sendmsg);
SETTLEORA_INTERPOSE(settleora_connectx, connectx);
