// Vercel Node.js Function — single entrypoint for ALL /api/* requests.
// See ../vercel.json: a rewrite maps "/api/:path*" to this function while
// preserving the original request path/URL, which @hono/node-server/vercel's
// handle() reconstructs into a Fetch Request for Hono's own internal router
// to match. This sidesteps Vercel's filename-based dynamic route conventions
// entirely (both [...route].ts and [[...route]].ts turned out unreliable
// here — see git history on this file for the two prior failed attempts).
//
// IMPORTANT: imports the pre-bundled ../dist/index.js (produced by
// `vite build` using the existing _core/fc-entry.ts SSR entry, noExternal:
// true) instead of the raw TS source tree, because Vercel's own build step
// does not reliably resolve this project's many relative imports.
//
// Rebuild before deploying if server source changed:
//   cd apps/server && pnpm exec vite build
//
// BODY-READ WORKAROUND (2026-08-14): every POST to /api/auth/* (sign-in,
// sign-up) hung for the full 300s Vercel timeout, while GETs worked fine.
// Root cause: @hono/node-server's vercel adapter reconstructs the fetch
// Request body by wrapping the raw IncomingMessage in a ReadableStream
// (Readable.toWeb(incoming).getReader()) UNLESS `incoming.rawBody` is
// already a Buffer, in which case it takes a fast synchronous path instead
// (see node_modules/@hono/node-server/dist/vercel.js — the
// `"rawBody" in incoming` branch). On this project's Vercel Node.js Function
// runtime the stream-based path never emits data/end, so any handler that
// awaits req.json()/req.text() (better-auth's POST routes do) hangs forever.
// Fix: buffer the request body ourselves and set `rawBody` before handing
// off to Hono, which routes it onto the fast, non-streaming path.
import { handle } from "@hono/node-server/vercel";
// @ts-expect-error -- dist/index.js is a built JS bundle with no .d.ts; the
// runtime export (a Hono app instance) is correct, only the type is unknown.
import app from "../dist/index.js";
import type { IncomingMessage, ServerResponse } from "node:http";

const honoHandler = handle(app);

function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

type IncomingWithRawBody = IncomingMessage & { rawBody?: Buffer };

export default async function routeHandler(req: IncomingWithRawBody, res: ServerResponse) {
  if (req.method !== "GET" && req.method !== "HEAD" && req.rawBody === undefined) {
    req.rawBody = await readRawBody(req);
  }
  return honoHandler(req, res);
}
