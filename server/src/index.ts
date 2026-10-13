import { app } from './app.js';
import { env } from './config/env.js';

app.listen(env.PORT, '0.0.0.0', () => {
  const hostLabel = env.NODE_ENV === 'production' ? `port ${env.PORT}` : `http://localhost:${env.PORT}`;
  console.log(`[Server] Gold Loan Portal API listening on ${hostLabel} (Environment: ${env.NODE_ENV})`);
});
