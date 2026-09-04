import { describe, it, expect } from "vitest";
import {
  isPrivateOrReservedIpv4,
  isPrivateOrReservedIpv6,
  validateSsrfTargetUrl,
} from "../../server/designClone/ssrfValidator";

describe("SSRF Validator (Etapa 1.27D)", () => {
  describe("isPrivateOrReservedIpv4", () => {
    it("should identify loopback addresses as private/unsafe", () => {
      expect(isPrivateOrReservedIpv4("127.0.0.1")).toBe(true);
      expect(isPrivateOrReservedIpv4("127.255.255.255")).toBe(true);
    });

    it("should identify 10.0.0.0/8 private network", () => {
      expect(isPrivateOrReservedIpv4("10.0.0.1")).toBe(true);
      expect(isPrivateOrReservedIpv4("10.254.1.20")).toBe(true);
    });

    it("should identify 172.16.0.0/12 private network", () => {
      expect(isPrivateOrReservedIpv4("172.16.0.1")).toBe(true);
      expect(isPrivateOrReservedIpv4("172.31.255.255")).toBe(true);
      expect(isPrivateOrReservedIpv4("172.32.0.1")).toBe(false); // Public
    });

    it("should identify 192.168.0.0/16 private network", () => {
      expect(isPrivateOrReservedIpv4("192.168.0.1")).toBe(true);
      expect(isPrivateOrReservedIpv4("192.168.100.50")).toBe(true);
    });

    it("should identify 169.254.0.0/16 cloud metadata/link-local address", () => {
      expect(isPrivateOrReservedIpv4("169.254.169.254")).toBe(true);
      expect(isPrivateOrReservedIpv4("169.254.1.1")).toBe(true);
    });

    it("should allow public IPv4 addresses", () => {
      expect(isPrivateOrReservedIpv4("8.8.8.8")).toBe(false);
      expect(isPrivateOrReservedIpv4("1.1.1.1")).toBe(false);
      expect(isPrivateOrReservedIpv4("151.101.1.69")).toBe(false);
    });
  });

  describe("isPrivateOrReservedIpv6", () => {
    it("should identify loopback ::1", () => {
      expect(isPrivateOrReservedIpv6("::1")).toBe(true);
      expect(isPrivateOrReservedIpv6("0:0:0:0:0:0:0:1")).toBe(true);
    });

    it("should identify link-local fe80::", () => {
      expect(isPrivateOrReservedIpv6("fe80::1")).toBe(true);
    });

    it("should identify unique local fc00:: and fd00::", () => {
      expect(isPrivateOrReservedIpv6("fc00::1")).toBe(true);
      expect(isPrivateOrReservedIpv6("fd12:3456:789a::1")).toBe(true);
    });

    it("should identify IPv4-mapped loopback", () => {
      expect(isPrivateOrReservedIpv6("::ffff:127.0.0.1")).toBe(true);
    });
  });

  describe("validateSsrfTargetUrl", () => {
    it("should reject non-http/https protocols", async () => {
      const fileRes = await validateSsrfTargetUrl("file:///etc/passwd");
      expect(fileRes.isSafe).toBe(false);
      expect(fileRes.reason).toContain("Protocolo");

      const gopherRes = await validateSsrfTargetUrl("gopher://127.0.0.1:70");
      expect(gopherRes.isSafe).toBe(false);
    });

    it("should reject localhost and internal hostnames", async () => {
      const res1 = await validateSsrfTargetUrl("http://localhost:3000");
      expect(res1.isSafe).toBe(false);

      const res2 = await validateSsrfTargetUrl("http://app.local/secret");
      expect(res2.isSafe).toBe(false);

      const res3 = await validateSsrfTargetUrl("http://service.internal");
      expect(res3.isSafe).toBe(false);
    });

    it("should reject direct private IP literals in URLs", async () => {
      const res1 = await validateSsrfTargetUrl("http://127.0.0.1:8080/admin");
      expect(res1.isSafe).toBe(false);

      const res2 = await validateSsrfTargetUrl("http://169.254.169.254/latest/meta-data/");
      expect(res2.isSafe).toBe(false);

      const res3 = await validateSsrfTargetUrl("http://10.1.2.3/internal-doc");
      expect(res3.isSafe).toBe(false);
    });

    it("should allow localhost when allowLocalTestHosts option is explicitly true", async () => {
      const res = await validateSsrfTargetUrl("http://127.0.0.1:9090/test", {
        allowLocalTestHosts: true,
      });
      expect(res.isSafe).toBe(true);
    });
  });
});
