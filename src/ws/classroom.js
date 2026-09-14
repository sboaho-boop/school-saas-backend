'use strict';

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'teacher-kofi-secret';

const rooms = new Map(); // lessonId -> { sockets: Set, strokes: [] }
const MAX_STROKES = 3000;

function getRoom(lessonId) {
  if (!rooms.has(lessonId)) rooms.set(lessonId, { sockets: new Set(), strokes: [] });
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

async function verifyAccess(decoded, lessonId) {
  const lesson = await prisma.marketplaceLesson.findUnique({ where: { id: lessonId } });
  if (!lesson) return { ok: false, status: 404, message: 'Lesson not found' };
  if (decoded.role === 'teacher') {
    if (lesson.teacherId !== decoded.id) return { ok: false, status: 403, message: 'Forbidden' };
    return { ok: true, lesson };
  }
  if (decoded.role === 'student') {
    const enrollment = await prisma.marketplaceEnrollment.findFirst({
      where: { lessonId, studentId: decoded.id, status: 'paid' },
    });
    if (!enrollment) return { ok: false, status: 403, message: 'You are not enrolled in this lesson' };
    return { ok: true, lesson };
  }
  return { ok: false, status: 403, message: 'Forbidden' };
}

async function loadPeer(decoded) {
  if (decoded.role === 'teacher') {
    const t = await prisma.marketplaceTeacher.findUnique({ where: { id: decoded.id }, select: { id: true, name: true } });
    return t ? { id: t.id, name: t.name, role: 'teacher' } : null;
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
    if (!url.pathname.startsWith(prefix)) return; // let other handlers decide

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
    });

    broadcast(room, { type: 'presence', participants: presenceList(room) }, ws);

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (msg.type === 'chat') {
        const text = String(msg.text || '').slice(0, 2000).trim();
        if (!text) return;
        const chat = { type: 'chat', msg: { sender: { id: peer.id, name: peer.name, role: peer.role }, text, ts: Date.now() } };
        send(ws, chat);
        broadcast(room, chat, ws);
      } else if (msg.type === 'draw') {
        const stroke = msg.stroke;
        if (!stroke || !Array.isArray(stroke.points) || stroke.points.length === 0) return;
        stroke.points = stroke.points.slice(0, 4000);
        room.strokes.push(stroke);
        if (room.strokes.length > MAX_STROKES) room.strokes.splice(0, room.strokes.length - MAX_STROKES);
        broadcast(room, { type: 'draw', stroke }, ws);
      } else if (msg.type === 'clear') {
        room.strokes = [];
        broadcast(room, { type: 'clear' });
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