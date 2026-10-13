import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { parseCorsOrigins, isOriginAllowed } from './config/cors.js';
import { apiRouter } from './routes/api.routes.js';
import { errorHandler } from './middlewares/error.middleware.js';

export const app = express();

const allowedOrigins = parseCorsOrigins(env.CORS_ORIGIN);

app.use(
  cors({
    origin: (requestOrigin, callback) => {
      if (isOriginAllowed(requestOrigin, allowedOrigins)) {
        return callback(null, true);
      }
      return callback(new Error(`Not allowed by CORS: ${requestOrigin}`));
    },
    credentials: true,
  })
);

app.use(express.json());

// Health check endpoint for monitoring and development verification
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'gldportal-server',
  });
});

// Mount Core REST Endpoints
app.use('/api/v1', apiRouter);

// Central error handler (must be last middleware)
app.use(errorHandler);
