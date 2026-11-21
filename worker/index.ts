import { ROOM_CODE_RE } from '../src/online/protocol';
import { PedroLobby } from './lobby';
import { PedroRoom, type Env } from './room';

export { PedroLobby, PedroRoom };

/**
 * Entry point on Cloudflare: `/api/room/<CODE>/ws` connects to that room,
 * everything else is the website itself (served from ./dist).
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/api\/room\/([^/]+)\/ws$/);
    if (m) {
      const code = m[1].toUpperCase();
      if (!ROOM_CODE_RE.test(code)) return new Response('Bad room code', { status: 400 });
      const room = env.ROOMS.get(env.ROOMS.idFromName(code));
      return room.fetch(request);
    }
    // The lobby: who's online, open tables, quick match.
    if (url.pathname === '/api/lobby' || url.pathname === '/api/lobby/ws' || url.pathname === '/api/lobby/quick') {
      return env.LOBBY.get(env.LOBBY.idFromName('main')).fetch(request);
    }
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
