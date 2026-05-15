import { startTasklistServer } from './server-core.js';

const port = Number(process.env.PORT || 8080);
const launcherPid = Number(process.env.TASKLIST_PARENT_PID || process.env.NBK_PARENT_PID || process.ppid || 0);

const server = startTasklistServer({
  exitOnClose: true,
  launcherPid,
  port
});

server.ready
  .then(() => {
    console.log(`Tasklist sync server: ${server.url}`);
  })
  .catch(error => {
    if (error.code === 'EADDRINUSE') {
      console.error('');
      console.error(`Cannot start Tasklist: port ${port} is already in use.`);
      console.error('Close the other Tasklist console window first, or use a different PORT value.');
      console.error(`Example: PORT=8081 node server.js`);
      console.error('');
      process.exit(1);
    }

    throw error;
  });

process.once('SIGINT', () => server.close(0));
process.once('SIGTERM', () => server.close(0));
process.once('SIGHUP', () => server.close(0));
