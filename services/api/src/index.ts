import { buildServer } from './server.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const app = buildServer();

app.listen({ port: PORT, host: HOST }, (err, address) => {
  if (err) {
    console.error('Failed to start personal cloud API:', err);
    process.exit(1);
  }
  console.log(`Personal Cloud API running at ${address}`);
});
