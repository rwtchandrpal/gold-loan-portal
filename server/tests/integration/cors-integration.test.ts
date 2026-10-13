import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';

describe('CORS Enforcement Integration Tests', () => {
  it('permits requests from authorized origin and responds with Access-Control-Allow-Origin header', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.body.status).toBe('ok');
  });

  it('permits requests without Origin header (curl, mobile, backend-to-backend)', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('rejects requests from unauthorized origins with HTTP 403 and CORS_FORBIDDEN code', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://unauthorized-phishing-site.com');

    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('CORS_FORBIDDEN');
    expect(res.body.error.message).toMatch(/Origin not allowed by CORS configuration/);
  });
});
