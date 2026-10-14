/* eslint-env jest */
const DAY_MS = 24 * 60 * 60 * 1000;

let mockResolveConcluded;
const concluded = new Promise((resolve) => (mockResolveConcluded = resolve));
const mockLog = jest.fn();
const mockEmbedDelete = jest.fn().mockResolvedValue({ count: 2 });
const mockWorkspaceDelete = jest.fn().mockResolvedValue({ count: 1 });

jest.mock("../../jobs/helpers", () => ({
  log: (...args) => mockLog(...args),
  conclude: jest.fn(() => mockResolveConcluded()),
}));
jest.mock("../../utils/prisma", () => ({
  embed_chats: { deleteMany: (...args) => mockEmbedDelete(...args) },
  workspace_chats: { deleteMany: (...args) => mockWorkspaceDelete(...args) },
  $transaction: (operations) => Promise.all(operations),
}));

describe("cleanup-expired-chats job", () => {
  it("deletes visitor and workspace chats older than 24 hours", async () => {
    const started = Date.now();
    require("../../jobs/cleanup-expired-chats.js");
    await concluded;

    for (const deleteMany of [mockEmbedDelete, mockWorkspaceDelete]) {
      expect(deleteMany).toHaveBeenCalledTimes(1);
      const cutoff = deleteMany.mock.calls[0][0].where.createdAt.lt.getTime();
      expect(cutoff).toBeGreaterThanOrEqual(started - DAY_MS);
      expect(cutoff).toBeLessThanOrEqual(Date.now() - DAY_MS);
    }
    expect(mockLog).toHaveBeenCalledWith(
      "Deleted 2 embed and 1 workspace chats older than 24 hours."
    );
  });
});
