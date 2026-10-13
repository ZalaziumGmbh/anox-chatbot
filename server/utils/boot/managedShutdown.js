// Managed DEV needs a clean, bounded stop before its consistent data backup.
function managedShutdown(server, disconnect = async () => {}) {
  if (process.env.MANAGED_RUNTIME !== "true") return;
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 45000);
    server.close(async (error) => {
      try {
        if (error) throw error;
        await disconnect();
        clearTimeout(deadline);
        process.exit(0);
      } catch {
        clearTimeout(deadline);
        process.exit(1);
      }
    });
    server.closeIdleConnections?.();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

module.exports = { managedShutdown };
