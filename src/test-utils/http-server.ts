/**
 * HTTP Server Test Utilities
 *
 * Provides utilities for creating test HTTP servers for integration testing.
 * Uses Node.js built-in http module - no external dependencies required.
 *
 * @example
 * ```ts
 * const server = await createTestServer();
 * try {
 *   const response = await fetch(server.url);
 *   // test response
 * } finally {
 *   await server.close();
 * }
 * ```
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { promisify } from 'node:util';

/**
 * Test HTTP server interface
 */
export interface TestServer {
  /** The underlying Node.js HTTP server */
  server: Server;
  /** The allocated port number */
  port: number;
  /** The base URL for the server (e.g., http://localhost:12345) */
  url: string;
  /** Close the server and release the port */
  close: () => Promise<void>;
  /** Array of received requests (for testing request logging) */
  receivedRequests: TestRequest[];
}

/**
 * Recorded request information
 */
export interface TestRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: string;
  timestamp: number;
}

/**
 * Configuration for sequential responses
 */
export interface ResponseSequenceConfig {
  /** Match condition for this response */
  match?: (req: TestRequest) => boolean;
  /** HTTP status code to return */
  status: number;
  /** Response body */
  body?: unknown;
  /** Delay in milliseconds before responding */
  delay?: number;
  /** Number of times to use this response (-1 for infinite) */
  uses?: number;
}

/**
 * Extended test server interface with error injection and response control
 */
export interface ExtendedTestServer extends TestServer {
  /** Set response delay in milliseconds */
  setDelay(ms: number): void;
  /** Inject error response for all subsequent requests */
  injectError(statusCode: number, error?: Error): void;
  /** Configure sequential responses */
  addResponseSequence(responses: ResponseSequenceConfig[]): void;
  /** Reset all injected states */
  reset(): void;
}

/**
 * Handler function for processing incoming requests
 */
export type RequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { receivedRequests: TestRequest[] }
) => void | Promise<void>;

/**
 * Default request handler that responds with 200 OK
 */
const defaultHandler: RequestHandler = (_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok' }));
};

/**
 * Options for creating a test server
 */
export interface TestServerOptions {
  /** Custom request handler */
  handler?: RequestHandler;
  /** Specific port to use (0 for auto-assignment) */
  port?: number;
  /** Host to bind to (default: localhost) */
  host?: string;
}

/**
 * Create a test HTTP server
 *
 * @param options - Server configuration options
 * @returns Promise resolving to a TestServer instance
 *
 * @example
 * ```ts
 * const server = await createTestServer();
 * console.log(server.url); // http://localhost:12345
 * await server.close();
 * ```
 */
export async function createTestServer(options: TestServerOptions = {}): Promise<ExtendedTestServer> {
  const { handler = defaultHandler, port = 0, host = 'localhost' } = options;
  const receivedRequests: TestRequest[] = [];

  // State for extended features
  let delay = 0;
  let errorToInject: { statusCode: number; error?: Error } | null = null;
  let responseSequence: ResponseSequenceConfig[] = [];
  let sequenceUsed: number[] = [];

  const server = createServer(async (req, res) => {
    // Record the request
    const requestData: TestRequest = {
      method: req.method || 'GET',
      url: req.url || '/',
      headers: req.headers as Record<string, string | string[] | undefined>,
      timestamp: Date.now(),
    };

    // Collect body if present
    const bodyChunks: Buffer[] = [];
    req.on('data', chunk => bodyChunks.push(chunk));

    // This callback is async but we don't await it - we let it run in parallel with handler
    req.on('end', () => {
      if (bodyChunks.length > 0) {
        requestData.body = Buffer.concat(bodyChunks).toString('utf-8');
      }
      receivedRequests.push(requestData);
    });

    // Check for injected error
    if (errorToInject) {
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      res.writeHead(errorToInject.statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: errorToInject.error?.message || 'Injected error' }));
      return;
    }

    // Check for sequential responses
    if (responseSequence.length > 0) {
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      for (let i = 0; i < responseSequence.length; i++) {
        const config = responseSequence[i];
        const used = sequenceUsed[i] || 0;

        const matchResult = !config.match || config.match(requestData);
        const hasRemainingUses = config.uses === -1 || used < (config.uses || 1);

        if (matchResult && hasRemainingUses) {
          sequenceUsed[i] = used + 1;

          if (config.delay) {
            await new Promise(r => setTimeout(r, config.delay));
          }

          res.writeHead(config.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(config.body || {}));
          return;
        }
      }
    }

    // Call the handler (original behavior)
    try {
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      await handler(req, res, { receivedRequests });
    } catch {
      // Ensure response is sent even if handler throws
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
  });

  // Start listening on an available port
  await new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unexpected server address type');
  }

  const actualPort = address.port;

  return {
    server,
    port: actualPort,
    url: `http://${host}:${actualPort}`,
    close: async () => {
      await promisify((cb: (err?: Error) => void) => server.close(cb))();
    },
    receivedRequests,
    setDelay(ms: number) {
      delay = ms;
    },
    injectError(statusCode: number, error?: Error) {
      errorToInject = { statusCode, error };
    },
    addResponseSequence(responses: ResponseSequenceConfig[]) {
      responseSequence = responses;
      sequenceUsed = [];
    },
    reset() {
      delay = 0;
      errorToInject = null;
      responseSequence = [];
      sequenceUsed = [];
    },
  };
}

/**
 * Create a mock ZTM Agent server for testing
 *
 * Responds to common ZTM Agent API endpoints:
 * - GET /api/v1/messages - List messages
 * - POST /api/v1/messages - Send a message
 * - GET /api/v1/messages/watch - Watch for new messages (SSE)
 * - POST /api/v1/mesh/join - Join mesh network
 *
 * @param options - Server configuration options
 * @returns Promise resolving to a TestServer instance
 *
 * @example
 * ```ts
 * const agent = await createZTMAgentMock();
 * try {
 *   const response = await fetch(`${agent.url}/api/v1/messages`, {
 *     method: 'POST',
 *     body: JSON.stringify({ content: 'Hello' })
 *   });
 * } finally {
 *   await agent.close();
 * }
 * ```
 */
export async function createZTMAgentMock(
  options: Omit<TestServerOptions, 'handler'> = {}
): Promise<TestServer> {
  const ztmHandler: RequestHandler = (req, res) => {
    const url = req.url || '/';

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Route handling
    if (url === '/api/v1/messages' && req.method === 'GET') {
      // List messages endpoint
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          messages: [],
          watermark: Date.now(),
        })
      );
    } else if (url === '/api/v1/messages' && req.method === 'POST') {
      // Send message endpoint
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: `msg-${Date.now()}`,
          timestamp: Date.now(),
          status: 'sent',
        })
      );
    } else if (url.startsWith('/api/v1/messages/') && req.method === 'GET') {
      // Get specific message
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: url.split('/').pop(),
          content: 'Test message',
          timestamp: Date.now(),
        })
      );
    } else if (url === '/api/v1/mesh/join' && req.method === 'POST') {
      // Join mesh endpoint
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          meshId: 'test-mesh',
          status: 'joined',
        })
      );
    } else if (url === '/api/v1/mesh/leave' && req.method === 'POST') {
      // Leave mesh endpoint
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'left',
        })
      );
    } else if (url === '/api/v1/pair/request' && req.method === 'POST') {
      // Pairing request endpoint
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          code: 'PAIR-' + Math.random().toString(36).substring(7),
          expiresAt: Date.now() + 3600000,
        })
      );
    } else if (url === '/api/v1/status' && req.method === 'GET') {
      // Status endpoint
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          connected: true,
          meshConnected: true,
          peerCount: 1,
        })
      );
    } else {
      // Unknown endpoint
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Not found',
          path: url,
        })
      );
    }
  };

  return createTestServer({
    ...options,
    handler: ztmHandler,
  });
}

/**
 * Create a test server that responds with a specific status code
 *
 * Useful for testing error scenarios.
 *
 * @param statusCode - HTTP status code to return
 * @param options - Additional server options
 * @returns Promise resolving to a TestServer instance
 *
 * @example
 * ```ts
 * const server = await createStatusCodeServer(500);
 * const response = await fetch(server.url);
 * expect(response.status).toBe(500);
 * await server.close();
 * ```
 */
export async function createStatusCodeServer(
  statusCode: number,
  options: Omit<TestServerOptions, 'handler'> = {}
): Promise<TestServer> {
  const handler: RequestHandler = (req, res) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: `Error ${statusCode}`,
        status: statusCode,
      })
    );
  };

  return createTestServer({
    ...options,
    handler,
  });
}

/**
 * Create a test server that responds after a delay
 *
 * Useful for testing timeout scenarios.
 *
 * @param delayMs - Delay in milliseconds before responding
 * @param options - Additional server options
 * @returns Promise resolving to a TestServer instance
 *
 * @example
 * ```ts
 * const server = await createDelayedServer(5000);
 * // This request will timeout if client timeout is < 5000ms
 * const response = await fetch(server.url);
 * await server.close();
 * ```
 */
export async function createDelayedServer(
  delayMs: number,
  options: Omit<TestServerOptions, 'handler'> = {}
): Promise<TestServer> {
  const handler: RequestHandler = async (req, res) => {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', delayed: delayMs }));
  };

  return createTestServer({
    ...options,
    handler,
  });
}

/**
 * Create a test server that echoes back the request
 *
 * Useful for debugging and verifying request formatting.
 *
 * @param options - Additional server options
 * @returns Promise resolving to a TestServer instance
 *
 * @example
 * ```ts
 * const server = await createEchoServer();
 * const response = await fetch(server.url, {
 *   method: 'POST',
 *   body: JSON.stringify({ test: 'data' })
 * });
 * const echoed = await response.json();
 * console.log(echoed.body); // { test: 'data' }
 * await server.close();
 * ```
 */
export async function createEchoServer(
  options: Omit<TestServerOptions, 'handler'> = {}
): Promise<TestServer> {
  const handler: RequestHandler = async (req, res, { receivedRequests }) => {
    // Wait for body to be collected
    await new Promise(resolve => setTimeout(resolve, 10));

    const lastRequest = receivedRequests[receivedRequests.length - 1];

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: lastRequest?.body,
      })
    );
  };

  return createTestServer({
    ...options,
    handler,
  });
}
