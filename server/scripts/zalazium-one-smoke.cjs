// Only run against the fresh synthetic database created by qualification CI.
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const prisma = require("../utils/prisma");
const { User } = require("../models/user");
const { SystemSettings } = require("../models/systemSettings");

async function main() {
  assert(process.getuid() !== 0 && process.env.ONE_SYNTHETIC_TEST === "1");
  assert.equal(await prisma.users.count(), 0, "Fresh synthetic database required");
  const username = "zalazium@zalazium.de";
  const firstPassword = "Synthetic-admin-Only-123!";
  async function bootstrap() {
    const existing = await prisma.users.findUnique({ where: { username } });
    if (existing) {
      assert.equal(existing.role, "admin");
      return existing.id;
    }
    const result = await User.create({ username, password: firstPassword, role: "admin" });
    assert(result.user && !result.error, "Admin creation failed");
    return result.user.id;
  }
  const id = await bootstrap();
  const other = await User.create({ username: "synthetic-user", password: firstPassword });
  assert(other.user && !other.error, "Synthetic user creation failed");
  assert.equal(await bootstrap(), id);
  assert.equal(await prisma.users.count(), 2, "Repeated initialization changed users");
  const enabled = await SystemSettings._updateSettings({ multi_user_mode: true, onboarding_complete: true });
  assert(enabled.success && await SystemSettings.isMultiUserMode());
  const rotated = "Synthetic-rotated-Only-456!";
  assert((await User.update(id, { password: rotated })).success);
  assert.equal(await bootstrap(), id);
  const row = await prisma.users.findUnique({ where: { id } });
  assert(bcrypt.compareSync(rotated, row.password), "Rotated password was not preserved");
  assert(!bcrypt.compareSync(firstPassword, row.password), "Old password remained usable");
  console.log("PASS: email admin, multi-user mode, repeat initialization, preserved user and password rotation");
}

main().catch(() => {
  console.error("Synthetic administrator qualification failed");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
