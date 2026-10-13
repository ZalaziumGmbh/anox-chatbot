jest.mock("../utils/prisma", () => ({
  users: { findUnique: jest.fn(), count: jest.fn() },
}));
jest.mock("../models/user", () => ({ User: { create: jest.fn() } }));
jest.mock("../models/systemSettings", () => ({ SystemSettings: {
  isMultiUserMode: jest.fn(), _updateSettings: jest.fn(),
} }));
jest.mock("../models/telemetry", () => ({ Telemetry: {} }));
jest.mock("../utils/vectorStore/resetAllVectorStores", () => ({}));

const prisma = require("../utils/prisma");
const { User } = require("../models/user");
const { SystemSettings } = require("../models/systemSettings");
const { bootstrap } = require("../scripts/managed-bootstrap.cjs");
const { updateENV, dumpENV } = require("../utils/helpers/updateENV");
const original = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...original, MANAGED_RUNTIME: "true", ADMIN_EMAIL: "zalazium@zalazium.de" };
  for (const key of ["ADMIN_PASSWORD", "JWT_SECRET", "SIG_KEY", "SIG_SALT", "LITE_LLM_API_KEY"])
    process.env[key] = "synthetic-only-credential-123!";
  prisma.users.findUnique.mockResolvedValue(null);
  prisma.users.count.mockResolvedValue(0);
  User.create.mockResolvedValue({ user: { id: 1 }, error: null });
  SystemSettings._updateSettings.mockResolvedValue({ success: true });
  SystemSettings.isMultiUserMode.mockResolvedValue(true);
});
afterEach(() => { process.env = original; jest.restoreAllMocks(); });

test("creates the email administrator and closes onboarding before HTTP startup", async () => {
  await bootstrap();
  expect(User.create).toHaveBeenCalledWith({ username: "zalazium@zalazium.de",
    password: process.env.ADMIN_PASSWORD, role: "admin" });
  expect(SystemSettings._updateSettings).toHaveBeenCalledWith({
    multi_user_mode: true, onboarding_complete: true,
  });
});
test("preserves existing administrator password and unrelated users", async () => {
  prisma.users.findUnique.mockResolvedValue({ id: 1, role: "admin", suspended: false });
  await bootstrap();
  expect(User.create).not.toHaveBeenCalled();
  expect(SystemSettings._updateSettings).not.toHaveBeenCalled();
});
test.each([{ role: "default" }, { role: "admin", suspended: true }])(
  "refuses an unsuitable existing account", async (user) => {
    prisma.users.findUnique.mockResolvedValue(user);
    await expect(bootstrap()).rejects.toThrow("requires review");
  }
);
test("refuses taking over an existing installation", async () => {
  prisma.users.count.mockResolvedValue(1);
  await expect(bootstrap()).rejects.toThrow("existing installation");
  expect(User.create).not.toHaveBeenCalled();
});
test("missing credentials prevent initialization", async () => {
  delete process.env.JWT_SECRET;
  await expect(bootstrap()).rejects.toThrow("incomplete");
  expect(User.create).not.toHaveBeenCalled();
});
test("incomplete multi-user state never reopens automatic onboarding", async () => {
  prisma.users.findUnique.mockResolvedValue({ role: "admin" });
  SystemSettings.isMultiUserMode.mockResolvedValue(false);
  await expect(bootstrap()).rejects.toThrow("requires review");
});
test("ordinary installations retain their existing bootstrap behavior", async () => {
  delete process.env.MANAGED_RUNTIME;
  await bootstrap();
  expect(prisma.users.findUnique).not.toHaveBeenCalled();
});
test("managed runtime refuses provider changes and never writes credentials", async () => {
  const write = jest.spyOn(require("fs"), "writeFileSync").mockImplementation(() => {});
  process.env.LLM_PROVIDER = "litellm";
  const result = await updateENV({ LLMProvider: "openai" }, true);
  expect(result.error).toMatch(/managed/);
  expect(process.env.LLM_PROVIDER).toBe("litellm");
  dumpENV();
  expect(write).not.toHaveBeenCalled();
});
