/**
 * Seed the first operator.
 *
 * SQL cannot hash a password, so this step is JavaScript. It reads the
 * credentials from the environment once and never stores them:
 *
 *     SEED_OPERATOR_EMAIL=you@actprove.com \
 *     SEED_OPERATOR_PASSWORD='...' \
 *     node db/migrate.mjs
 *
 * Nothing is hardcoded here. With the variables unset the step records itself as
 * applied and does nothing, which is the right behaviour on a deployment where
 * the operator already exists. Clear the variables afterwards; they have served
 * their purpose and a password in a shell history or a project setting is a
 * password in a place it should not be.
 */
import { argon2id } from "hash-wasm";
import { webcrypto } from "node:crypto";

export async function up(client) {
  const email = (process.env.SEED_OPERATOR_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.SEED_OPERATOR_PASSWORD ?? "";

  if (!email || !password) {
    console.log(
      "\n    no SEED_OPERATOR_EMAIL / SEED_OPERATOR_PASSWORD; no operator seeded ... ",
    );
    return;
  }
  if (password.length < 12) {
    throw new Error("SEED_OPERATOR_PASSWORD must be at least 12 characters.");
  }

  const existing = await client.query("SELECT 1 FROM operators LIMIT 1");
  if (existing.rowCount > 0) {
    console.log("\n    operators table is not empty; leaving it alone ... ");
    return;
  }

  const hash = await argon2id({
    password,
    salt: webcrypto.getRandomValues(new Uint8Array(16)),
    parallelism: 1,
    iterations: 2,
    memorySize: 19456,
    hashLength: 32,
    outputType: "encoded",
  });

  await client.query(
    `INSERT INTO operators (email, password_hash, role, notes)
     VALUES ($1, $2, 'admin', 'seeded by migration 0002')`,
    [email, hash],
  );
  console.log(`\n    seeded ${email} as admin ... `);
}
