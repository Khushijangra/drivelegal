import { createApp } from './api/app';
import { config } from './config';
import { closePool } from './database/db';

async function main() {
  const app = createApp();
  const server = app.listen(config.PORT, () => {
    console.log(`DriveLegal backend listening on port ${config.PORT}`);
  });

  const shutdown = async () => {
    server.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
