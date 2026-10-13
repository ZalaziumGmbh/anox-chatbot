// Optional managed DEV bootstrap, before any HTTP listener is opened.
const prisma = require("../utils/prisma");
const { User } = require("../models/user");
const { SystemSettings } = require("../models/systemSettings");

async function bootstrap() {
  if (process.env.MANAGED_RUNTIME !== "true") return;
  const username = process.env.ADMIN_EMAIL;
  if (username !== "zalazium@zalazium.de" ||
      ["ADMIN_PASSWORD", "JWT_SECRET", "SIG_KEY", "SIG_SALT", "LITE_LLM_API_KEY"]
        .some((key) => !process.env[key] || process.env[key].length < 16))
    throw new Error("Managed DEV credentials are incomplete");
  const existing = await prisma.users.findUnique({ where: { username } });
  if (existing) {
    if (existing.role !== "admin" || existing.suspended ||
        !(await SystemSettings.isMultiUserMode()))
      throw new Error("Existing managed administrator requires review");
    return; // Preserve rotated passwords and every unrelated user.
  }
  if (await prisma.users.count())
    throw new Error("Refusing automatic bootstrap of an existing installation");
  const result = await User.create({
    username, password: process.env.ADMIN_PASSWORD, role: "admin",
  });
  if (!result.user || result.error) throw new Error("Managed administrator creation failed");
  const settings = await SystemSettings._updateSettings({
    multi_user_mode: true, onboarding_complete: true,
  });
  if (!settings.success || !(await SystemSettings.isMultiUserMode()))
    throw new Error("Managed multi-user initialization failed");
}

module.exports = { bootstrap };
if (require.main === module) {
  bootstrap().then(() => console.log("Managed DEV administrator ready"))
    .catch(() => {
      console.error("Managed DEV bootstrap refused; HTTP startup remains closed");
      process.exitCode = 1;
    }).finally(() => prisma.$disconnect());
}
