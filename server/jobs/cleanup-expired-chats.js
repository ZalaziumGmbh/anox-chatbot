const { log, conclude } = require("./helpers/index.js");
const prisma = require("../utils/prisma");

// Chat histories, including those of website visitors, are kept for 24 hours.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

(async () => {
  try {
    const where = { createdAt: { lt: new Date(Date.now() - MAX_AGE_MS) } };
    const [embed, workspace] = await prisma.$transaction([
      prisma.embed_chats.deleteMany({ where }),
      prisma.workspace_chats.deleteMany({ where }),
    ]);
    if (embed.count || workspace.count)
      log(
        `Deleted ${embed.count} embed and ${workspace.count} workspace chats older than 24 hours.`
      );
  } catch (error) {
    console.error(error);
    log(`Error during chat cleanup: ${error.message}`);
  } finally {
    conclude();
  }
})();
