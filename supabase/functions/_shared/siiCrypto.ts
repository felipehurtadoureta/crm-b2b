/** Cifrado AES-GCM para claves tributarias SII (solo Edge Functions). */

const ENC_PREFIX = 'v1:'

function keyBytes(secret: string): Uint8Array {
  const enc = new TextEncoder().encode(secret.padEnd(32, '0').slice(0, 32))
  return enc
}

export async function encryptSecret(plain: string, secretKey: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await crypto.subtle.importKey('raw', keyBytes(secretKey), { name: 'AES-GCM' }, false, [
    'encrypt',
  ])
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain))
  const combined = new Uint8Array(iv.length + cipher.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(cipher), iv.length)
  return ENC_PREFIX + btoa(String.fromCharCode(...combined))
}

export async function decryptSecret(ciphertext: string, secretKey: string): Promise<string> {
  if (!ciphertext.startsWith(ENC_PREFIX)) {
    throw new Error('Formato de credencial inválido')
  }
  const raw = Uint8Array.from(atob(ciphertext.slice(ENC_PREFIX.length)), c => c.charCodeAt(0))
  const iv = raw.slice(0, 12)
  const data = raw.slice(12)
  const key = await crypto.subtle.importKey('raw', keyBytes(secretKey), { name: 'AES-GCM' }, false, [
    'decrypt',
  ])
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(plain)
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
