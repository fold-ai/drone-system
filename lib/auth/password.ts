/**
 * Argon2id password hashing.
 *
 * hash-wasm rather than a native binding: it is WebAssembly, so it behaves the
 * same locally and on the serverless runtime with no prebuilt binary to trace
 * or to be missing at deploy time.
 *
 * Parameters follow the OWASP argon2id guidance: 19 MiB, two passes, one lane.
 * The encoded string carries them, so raising the cost later does not
 * invalidate existing hashes.
 */
import { argon2id, argon2Verify } from "hash-wasm";

const MEMORY_KIB = 19456;
const ITERATIONS = 2;
const PARALLELISM = 1;

function salt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) {
    throw new Error("Password must be at least 12 characters.");
  }
  return argon2id({
    password,
    salt: salt(),
    parallelism: PARALLELISM,
    iterations: ITERATIONS,
    memorySize: MEMORY_KIB,
    hashLength: 32,
    outputType: "encoded",
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash });
  } catch {
    return false;
  }
}
