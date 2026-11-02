import { BlockList, isIP } from "node:net";

// RULE 1: which IP addresses are off limits.
//
//   isBlockedAddress("127.0.0.1")       -> true   (this machine)
//   isBlockedAddress("169.254.169.254") -> true   (cloud metadata service)
//   isBlockedAddress("10.0.0.5")        -> true   (private network)
//   isBlockedAddress("93.184.216.34")   -> false  (a normal public address)

// Everything that is not a normal public address.
const blocked = new BlockList();

const IPV4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, includes the cloud metadata IP 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, includes broadcast
];
for (const [network, prefix] of IPV4_BLOCKED) {
  blocked.addSubnet(network, prefix, "ipv4");
}

const IPV6_BLOCKED: [string, number][] = [
  // ::/96 covers unspecified (::), loopback (::1) and the deprecated IPv4-compatible form.
  // IPv4-mapped addresses (::ffff:0:0/96) are NOT listed here: Node's BlockList treats every
  // IPv4 address as IPv4-mapped, so that rule would block the whole IPv4 internet.
  // They are rejected explicitly in isBlockedAddress() instead.
  ["::", 96],
  ["64:ff9b::", 96], // NAT64, embeds an IPv4 address
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard-only
  ["2001::", 32], // Teredo, embeds an IPv4 address
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4, embeds an IPv4 address
  ["fc00::", 7], // unique local (includes the AWS IPv6 metadata address)
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
];
for (const [network, prefix] of IPV6_BLOCKED) {
  blocked.addSubnet(network, prefix, "ipv6");
}

/** True if the IP must not be fetched. Anything that is not a valid IP counts as blocked. */
export function isBlockedAddress(ip: string): boolean {
  const address = ip.split("%")[0]; // drop an IPv6 zone id such as fe80::1%eth0
  const family = isIP(address);
  if (family === 0) return true;
  if (family === 4) return blocked.check(address, "ipv4");

  // IPv4-mapped IPv6 (::ffff:127.0.0.1, ::ffff:7f00:1, 0:0:0:0:0:ffff:7f00:1) is the classic way
  // to smuggle an IPv4 address past an IPv6 check. Public hosts never need it, so block it all.
  // The URL parser gives every spelling the same canonical form.
  const canonical = new URL(`http://[${address}]/`).hostname;
  if (canonical.startsWith("[::ffff:")) return true;

  return blocked.check(address, "ipv6");
}
