#include <arpa/inet.h>
#include <errno.h>
#include <netdb.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>

__attribute__((constructor)) static void settleora_mark_interposer_loaded(void) {
  setenv("SETTLEORA_OCR_NETWORK_INTERPOSER_LOADED", "1", 1);
}

__attribute__((visibility("default"))) int settleora_network_interposer_loaded(void) {
  return 1;
}

static bool settleora_is_ipv4_loopback(const struct in_addr *address) {
  return (ntohl(address->s_addr) >> 24) == 127;
}

static bool settleora_is_external(const struct sockaddr *address) {
  if (address == NULL) return false;
  if (address->sa_family == AF_INET) {
    const struct sockaddr_in *ipv4 = (const struct sockaddr_in *)address;
    return !settleora_is_ipv4_loopback(&ipv4->sin_addr);
  }
  if (address->sa_family == AF_INET6) {
    const struct sockaddr_in6 *ipv6 = (const struct sockaddr_in6 *)address;
    if (IN6_IS_ADDR_LOOPBACK(&ipv6->sin6_addr)) return false;
    if (IN6_IS_ADDR_V4MAPPED(&ipv6->sin6_addr)) {
      struct in_addr mapped_ipv4;
      memcpy(
          &mapped_ipv4.s_addr,
          &ipv6->sin6_addr.s6_addr[12],
          sizeof(mapped_ipv4.s_addr));
      return !settleora_is_ipv4_loopback(&mapped_ipv4);
    }
    return true;
  }
  return false;
}

static int settleora_deny(void) {
  errno = ENETUNREACH;
  return -1;
}

static bool settleora_is_external_hostname(const char *hostname) {
  if (hostname == NULL || strcmp(hostname, "localhost") == 0) return false;
  struct in_addr ipv4;
  if (inet_pton(AF_INET, hostname, &ipv4) == 1) {
    return !settleora_is_ipv4_loopback(&ipv4);
  }
  struct in6_addr ipv6;
  if (inet_pton(AF_INET6, hostname, &ipv6) == 1) {
    return !IN6_IS_ADDR_LOOPBACK(&ipv6);
  }
  return true;
}

static int settleora_getaddrinfo(
    const char *hostname,
    const char *service,
    const struct addrinfo *hints,
    struct addrinfo **result) {
  if (settleora_is_external_hostname(hostname)) {
    errno = ENETUNREACH;
    return EAI_SYSTEM;
  }
  return getaddrinfo(hostname, service, hints, result);
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
SETTLEORA_INTERPOSE(settleora_getaddrinfo, getaddrinfo);
