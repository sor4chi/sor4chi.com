import { describe, expect, it } from "vitest";
import { generateTotp } from "./totp.js";

const rfc6238Sha1Secret = ["GEZDGNBV", "GY3TQOJQ", "GEZDGNBV", "GY3TQOJQ"].join("");

describe("generateTotp", () => {
  it("matches the RFC 6238 SHA-1 test vector", () => {
    expect(generateTotp(rfc6238Sha1Secret, 59_000, 8)).toBe("94287082");
  });

  it("accepts an otpauth URI", () => {
    expect(generateTotp(`otpauth://totp/example?secret=${rfc6238Sha1Secret}`, 59_000, 8)).toBe(
      "94287082",
    );
  });
});
