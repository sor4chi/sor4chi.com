import { createHmac } from "node:crypto";

function decodeBase32(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.toUpperCase().replace(/[\s=-]/g, "");
  let bits = "";
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("TOTP secret is not valid Base32");
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  if (bytes.length === 0) throw new Error("TOTP secret is empty");
  return Buffer.from(bytes);
}

function extractBase32Secret(value: string): string {
  if (!value.startsWith("otpauth://")) return value;
  const secret = new URL(value).searchParams.get("secret");
  if (secret === null || secret === "") throw new Error("otpauth URI has no secret parameter");
  return secret;
}

export function generateTotp(
  secretOrUri: string,
  nowMs = Date.now(),
  digits = 6,
  periodSeconds = 30,
): string {
  const secret = decodeBase32(extractBase32Secret(secretOrUri.trim()));
  const counter = Math.floor(nowMs / 1000 / periodSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}
