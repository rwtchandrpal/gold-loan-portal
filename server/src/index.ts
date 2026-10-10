import { app } from './app.js';
import { env } from './config/env.js';

app.listen(env.PORT, () => {
  console.log(`[Server] Gold Loan Portal API running on http://localhost:${env.PORT}`);
  console.log(`[Server] Environment: ${env.NODE_ENV}`);
});
