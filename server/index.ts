import { startServer } from './src/app.js';

const started = startServer();

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) {
    process.exit(1);
  }
  shuttingDown = true;

  void started
    .close()
    .catch((error) => {
      console.error('Error while shutting down server:', error);
    })
    .finally(() => {
      process.exit(0);
    });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
