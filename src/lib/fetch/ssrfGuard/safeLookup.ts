import dns from "node:dns";
import type { LookupFunction } from "node:net";
import { isBlockedAddress } from "./blockedAddresses";
import { blockedAddressError } from "./errors";

// LAYER 2: re-check at the moment of connecting.
//
// Why a second check? A hostile DNS server can answer "public IP" when assertSafeUrl() asks and
// "127.0.0.1" a moment later when the real connection is made (DNS rebinding). This lookup
// runs at connect time and refuses a blocked address, so there is no gap.
//
// Use it as the `lookup` option of the HTTP request. It works exactly like Node's normal lookup
// otherwise.

export const safeLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, []);

    const bad = addresses.find((entry) => isBlockedAddress(entry.address));
    if (bad) {
      return callback(
        blockedAddressError(bad.address) as NodeJS.ErrnoException,
        [],
      );
    }

    // Node may ask for one address or all of them, depending on the caller.
    if (options.all) return callback(null, addresses);
    const first = addresses[0];
    return callback(null, first.address, first.family);
  });
};
