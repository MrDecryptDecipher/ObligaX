import { defaultCantonWireServer } from './test-harness/canton-wire-server';
import http from 'http';

let isWireServerRunning = false;

beforeAll(async () => {
  try {
    // Check if real Canton Participant or another worker is already running on port 5011
    const isCantonUp = await new Promise<boolean>(resolve => {
      const req = http.get('http://localhost:5011/v2/health', res => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(500, () => {
        req.destroy();
        resolve(false);
      });
    });

    if (!isCantonUp) {
      await defaultCantonWireServer.listen(5011);
      isWireServerRunning = true;
    }
  } catch (err: any) {
    if (err.code !== 'EADDRINUSE') {
      console.warn('Warning starting wire server:', err.message);
    }
  }
});

afterEach(() => {
  if (isWireServerRunning) {
    defaultCantonWireServer.clear();
  }
});

afterAll(async () => {
  if (isWireServerRunning) {
    await defaultCantonWireServer.close();
  }
});
