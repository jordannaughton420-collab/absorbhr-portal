import { describe, expect, it } from "vitest";
import { clientIpFromForwardedFor, trustedProxyHops } from "@/lib/client-ip";

describe("visitor address from X-Forwarded-For", () => {
  it("uses the entry our proxy added, not one the visitor wrote", () => {
    // The visitor sent "X-Forwarded-For: 1.2.3.4"; LiteSpeed appended the real address.
    expect(clientIpFromForwardedFor("1.2.3.4, 203.0.113.7")).toBe("203.0.113.7");
  });

  it("can't be dodged by sending a different made-up address on every try", () => {
    const real = "203.0.113.7";
    const seen = new Set(
      ["9.9.9.9", "10.0.0.1, 8.8.8.8", "a, b, c", "", "unknown", "::1"].map((forged) =>
        clientIpFromForwardedFor(forged ? `${forged}, ${real}` : real),
      ),
    );
    expect([...seen]).toEqual([real]);
  });

  it("uses the only entry when there is one", () =>
    expect(clientIpFromForwardedFor("203.0.113.7")).toBe("203.0.113.7"));

  it("counts trusted hops in from the right (CDN in front of LiteSpeed)", () => {
    // forged, real visitor (added by CDN), CDN address (added by LiteSpeed)
    const header = "6.6.6.6, 203.0.113.7, 198.51.100.2";
    expect(clientIpFromForwardedFor(header, 2)).toBe("203.0.113.7");
    expect(clientIpFromForwardedFor(header, 1)).toBe("198.51.100.2");
  });

  it("falls back to the left-most entry when there are fewer entries than hops", () =>
    expect(clientIpFromForwardedFor("203.0.113.7", 2)).toBe("203.0.113.7"));

  it("ignores spaces and empty entries", () =>
    expect(clientIpFromForwardedFor(" 1.2.3.4 ,, 203.0.113.7 , ")).toBe("203.0.113.7"));

  it("treats IPv4-mapped IPv6 and ports as the same visitor", () => {
    expect(clientIpFromForwardedFor("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(clientIpFromForwardedFor("203.0.113.7:51234")).toBe("203.0.113.7");
    expect(clientIpFromForwardedFor("[2001:DB8::1]:443")).toBe("2001:db8::1");
    expect(clientIpFromForwardedFor("2001:db8::1")).toBe("2001:db8::1");
  });

  it("returns 'unknown' for a missing, empty or junk header", () => {
    for (const h of [null, undefined, "", " , ", "not-an-ip", "<script>", "1".repeat(65)])
      expect(clientIpFromForwardedFor(h)).toBe("unknown");
  });
});

describe("TRUSTED_PROXY_HOPS setting", () => {
  it("defaults to 1", () => {
    for (const v of [undefined, "", "0", "-1", "two", "1.5"]) expect(trustedProxyHops(v)).toBe(1);
  });
  it("accepts a small whole number", () => {
    expect(trustedProxyHops("2")).toBe(2);
    expect(trustedProxyHops(" 3 ")).toBe(3);
  });
  it("is capped at 5", () =>
    expect(trustedProxyHops("99")).toBe(5));
});
