'use strict';

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'teacher-kofi-secret';

const rooms = new Map(); // lessonId -> room state
const MAX_STROKES = 3000;
const MAX_MEDIA = 30;

function defaultRoom() {
  return {
    sockets: new Set(),
    strokes: [],
    media: [], // { id, kind, url, x, y, w, h }
    permissions: { draw: false, share: false, speak: false }, // applied to students
    feedActive: false,
  };
}

function getRoom(lessonId) {
  if (!rooms.has(lessonId)) rooms.set(lessonId, defaultRoom());
  return rooms.get(lessonId);
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg, except = null) {
  const text = JSON.stringify(msg);
  for (const ws of room.sockets) {
    if (ws !== except && ws.readyState === 1) ws.send(text);
  }
}

function relayTo(room, peerId, msg) {
  const text = JSON.stringify(msg);
  for (const ws of room.sockets) {
    if (ws.peer && ws.peer.id === peerId && ws.readyState === 1) ws.send(text);
  }
}

async function verifyAccess(decoded, lessonId) {
  const lesson = await prisma.marketplaceLesson.findUnique({ where: { id: lessonId } });
  if (!lesson) return { ok: false, status: 404, message: 'Lesson not found' };
  if (decoded.role === 'teacher') {
    if (lesson.teacherId !== decoded.id) return { ok: false, status: 403, message: 'Forbidden' };
    return { ok: true, lesson };
  }
  if (decoded.role === 'guest') {
    // Guest tokens are scoped to one lesson; must be an 'open' lesson.
    if (decoded.lessonId !== lesson.id || lesson.accessMode !== 'open') {
      return { ok: false, status: 403, message: 'Guest access is not allowed for this lesson' };
    }
    return { ok: true, lesson };
  }
  // student role
  const enrollment = await prisma.marketplaceEnrollment.findFirst({
    where: { lessonId, studentId: decoded.id, status: 'paid' },
  });
  const covered = !enrollment ? await subscriptionCovers(decoded.id, lesson) : null;
  // 'open' lessons accept any signed-in student; enrolled-only lessons accept paid enrollment or an active subscription.
  if (!enrollment && !covered && lesson.accessMode !== 'open') {
    return { ok: false, status: 403, message: 'You are not enrolled in this lesson' };
  }
  return { ok: true, lesson };
}

async function subscriptionCovers(studentId, lesson) {
  const now = new Date();
  const subscription = await prisma.marketplaceSubscription.findFirst({
    where: {
      studentId,
      status: 'active',
      endDate: { gte: now },
      OR: [
        { type: 'platform' },
        { type: 'teacher', teacherId: lesson.teacherId },
      ],
    },
  });
  return subscription || null;
}

async function loadPeer(decoded) {
  if (decoded.role === 'teacher') {
    const t = await prisma.marketplaceTeacher.findUnique({ where: { id: decoded.id }, select: { id: true, name: true } });
    return t ? { id: t.id, name: t.name, role: 'teacher' } : null;
  }
  if (decoded.role === 'guest') {
    return { id: decoded.id, name: decoded.name || 'Guest', role: 'guest' };
  }
  const s = await prisma.marketplaceStudent.findUnique({ where: { id: decoded.id }, select: { id: true, name: true } });
  return s ? { id: s.id, name: s.name, role: 'student' } : null;
}

function presenceList(room) {
  return [...room.sockets].map((ws) => ws.peer && { id: ws.peer.id, name: ws.peer.name, role: ws.peer.role }).filter(Boolean);
}

function attachClassroomSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const base = `http://${req.headers.host || 'localhost'}`;
    let url;
    try {
      url = new URL(req.url, base);
    } catch {
      socket.destroy();
      return;
    }
    const prefix = '/ws/classroom/';
    if (!url.pathname.startsWith(prefix)) return;

    const lessonId = decodeURIComponent(url.pathname.slice(prefix.length));
    const token = url.searchParams.get('token') || '';
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.type !== 'marketplace') throw new Error('bad type');
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, { lessonId, decoded });
    });
  });

  wss.on('connection', async (ws, req, ctx) => {
    const { lessonId, decoded } = ctx;

    const peer = await loadPeer(decoded);
    if (!peer) {
      send(ws, { type: 'error', message: 'Account not found' });
      ws.close(4003, 'Account not found');
      return;
    }

    const access = await verifyAccess(decoded, lessonId);
    if (!access.ok) {
      send(ws, { type: 'error', message: access.message });
      ws.close(access.status === 404 ? 4004 : 4003, access.message);
      return;
    }

    const room = getRoom(lessonId);
    ws.peer = peer;
    ws.lessonId = lessonId;
    room.sockets.add(ws);

    send(ws, {
      type: 'welcome',
      self: peer,
      lesson: {
        id: lessonId,
        title: access.lesson.title,
        subject: access.lesson.subject,
        status: access.lesson.status,
        joinLink: access.lesson.joinLink,
      },
      participants: presenceList(room),
      strokes: room.strokes.slice(-MAX_STROKES),
      media: room.media,
      permissions: { ...room.permissions },
      feedActive: room.feedActive,
    });

    broadcast(room, { type: 'presence', participants: presenceList(room) }, ws);

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }

      const isTeacher = peer.role === 'teacher';
      // guests are treated like students for permission gating
      const student = peer.role === 'student' || peer.role === 'guest';

      if (msg.type === 'chat') {
        const text = String(msg.text || '').slice(0, 2000).trim();
        if (!text) return;
        const chat = { type: 'chat', msg: { sender: { id: peer.id, name: peer.name, role: peer.role }, text, ts: Date.now() } };
        send(ws, chat);
        broadcast(room, chat, ws);
      } else if (msg.type === 'draw') {
        const stroke = msg.stroke;
        if (!stroke || !Array.isArray(stroke.points) || stroke.points.length === 0) return;
        if (student && !room.permissions.draw) return;
        stroke.points = stroke.points.slice(0, 4000);
        room.strokes.push(stroke);
        if (room.strokes.length > MAX_STROKES) room.strokes.splice(0, room.strokes.length - MAX_STROKES);
        broadcast(room, { type: 'draw', stroke }, ws);
      } else if (msg.type === 'clear') {
        if (student && !room.permissions.draw) return;
        room.strokes = [];
        broadcast(room, { type: 'clear' });
      } else if (msg.type === 'perms') {
        if (!isTeacher) return;
        room.permissions.draw = !!msg.draw;
        room.permissions.share = !!msg.share;
        room.permissions.speak = !!msg.speak;
        broadcast(room, { type: 'perms', permissions: { draw: room.permissions.draw, share: room.permissions.share, speak: room.permissions.speak } });
      } else if (msg.type === 'feed') {
        if (!isTeacher) return;
        room.feedActive = !!msg.active;
        broadcast(room, { type: 'feed', active: room.feedActive });
      } else if (msg.type === 'mediaAdd') {
        if (student && !room.permissions.share) return;
        const kind = msg.kind === 'video' ? 'video' : msg.kind === 'pdf' ? 'pdf' : 'image';
        if (!msg.url || typeof msg.url !== 'string' || msg.url.length > 5000) return;
        const item = {
          id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
          kind,
          url: msg.url,
          w: Math.max(8, Math.min(90, Number(msg.w) || 40)),
          x: Math.max(0, Math.min(90, Number(msg.x) || 20)),
          y: Math.max(0, Math.min(80, Number(msg.y) || 10)),
          by: peer.id,
          page: kind === 'pdf' ? Math.max(1, Number(msg.page) || 1) : undefined,
        };
        room.media.push(item);
        if (room.media.length > MAX_MEDIA) room.media.splice(0, room.media.length - MAX_MEDIA);
        broadcast(room, { type: 'mediaAdd', item });
        send(ws, { type: 'mediaAdd', item });
      } else if (msg.type === 'pdfPage') {
        // Anyone authorized to share may flip the slide deck; the new page is
        // broadcast so every participant renders the same slide.
        if (student && !room.permissions.share) return;
        const item = room.media.find((m) => m.id === msg.id && m.kind === 'pdf');
        if (!item) return;
        const page = Math.max(1, Number(msg.page) || 1);
        item.page = page;
        broadcast(room, { type: 'pdfPage', id: msg.id, page });
      } else if (msg.type === 'mediaMoved') {
        if (student && !room.permissions.share) return;
        const item = room.media.find((m) => m.id === msg.id);
        if (!item) return;
        if (typeof msg.x === 'number') item.x = Math.max(0, Math.min(95, msg.x));
        if (typeof msg.y === 'number') item.y = Math.max(0, Math.min(90, msg.y));
        if (typeof msg.w === 'number') item.w = Math.max(8, Math.min(95, msg.w));
        broadcast(room, { type: 'mediaMoved', id: msg.id, x: item.x, y: item.y, w: item.w });
      } else if (msg.type === 'mediaRemove') {
        if (student && !room.permissions.share) return;
        const idx = room.media.findIndex((m) => m.id === msg.id);
        if (idx === -1) return;
        room.media.splice(idx, 1);
        broadcast(room, { type: 'mediaRemove', id: msg.id });
      } else if (msg.type === 'rtc') {
        if (!msg.to || !msg.data) return;
        // A student may only initiate an offer (begin speaking) if the
        // teacher has granted the speak permission. Answers and ICE
        // (needed to receive the teacher's broadcast) are always relayed.
        const isOffer = !!msg.data.description && msg.data.description.type === 'offer';
        if (student && isOffer && !room.permissions.speak) return;
        relayTo(room, String(msg.to), { type: 'rtc', from: peer.id, data: msg.data });
      }
    });

    ws.on('close', () => {
      room.sockets.delete(ws);
      if (room.sockets.size === 0) rooms.delete(lessonId);
      else broadcast(room, { type: 'presence', participants: presenceList(room) });
    });

    ws.on('error', () => {
      room.sockets.delete(ws);
      if (room.sockets.size === 0) rooms.delete(lessonId);
      else broadcast(room, { type: 'presence', participants: presenceList(room) });
    });
  });

  return wss;
}

function notifyLessonEnded(lessonId) {
  const room = rooms.get(lessonId);
  if (!room) return;
  broadcast(room, { type: 'ended' });
  for (const ws of room.sockets) {
    try {
      ws.close(4000, 'Lesson ended');
    } catch {}
  }
  rooms.delete(lessonId);
}

module.exports = { attachClassroomSocket, notifyLessonEnded };