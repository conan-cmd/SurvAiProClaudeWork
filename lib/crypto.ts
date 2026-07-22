import "server-only"
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"

// AES-256-GCM for secrets at rest (e.g. Gmail refresh tokens). The key is
// derived from NEXTAUTH_SECRET so there's no extra secret to manage.
function key(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error("NEXTAUTH_SECRET is required to encrypt secrets")
  return createHash("sha256").update(secret).digest()
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".")
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".")
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted payload")
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"))
  decipher.setAuthTag(Buffer.from(tagB64, "base64"))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8")
}
