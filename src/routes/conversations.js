const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { triggerNotification, NOTIFICATION_TYPES, getStudentGuardians } = require('../lib/notification-engine');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    const participations = await prisma.conversationParticipant.findMany({
      where: { userId: req.user.id },
      select: { conversationId: true },
    });
    const conversationIds = participations.map(p => p.conversationId);

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where: { id: { in: conversationIds }, schoolId: req.schoolId },
        include: {
          participants: {
            include: {
              user: { select: { id: true, name: true, email: true, role: true } },
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, body: true, senderId: true, createdAt: true },
          },
          student: { select: { id: true, firstName: true, lastName: true, className: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.conversationParticipant.count({ where: { userId: req.user.id } }),
    ]);

    res.json({ conversations, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, schoolId: req.schoolId },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        student: { select: { id: true, firstName: true, lastName: true, className: true } },
      },
    });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const isParticipant = conversation.participants.some(p => p.userId === req.user.id);
    const isAdmin = ['headteacher', 'admin'].includes(req.user.role);
    if (!isParticipant && !isAdmin) return res.status(403).json({ error: 'Access denied' });

    const messages = await prisma.conversationMessage.findMany({
      where: { conversationId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });

    await prisma.conversationParticipant.updateMany({
      where: { conversationId: req.params.id, userId: req.user.id },
      data: { lastReadAt: new Date() },
    });

    res.json({ ...conversation, messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { participantIds, title, studentId } = req.body;
    if (!participantIds || !participantIds.length) {
      return res.status(400).json({ error: 'participantIds required' });
    }

    const allParticipantIds = [...new Set([req.user.id, ...participantIds])];

    for (const pid of allParticipantIds) {
      const user = await prisma.user.findFirst({ where: { id: pid, schoolId: req.schoolId } });
      if (!user) return res.status(404).json({ error: `User ${pid} not found in this school` });
    }

    let resolvedStudentId = studentId || null;
    if (studentId) {
      const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: req.schoolId } });
      if (!student) return res.status(404).json({ error: 'Student not found' });
      if (!title) resolvedStudentId = studentId;
    }

    const conversation = await prisma.conversation.create({
      data: {
        schoolId: req.schoolId,
        studentId: resolvedStudentId,
        title: title || null,
        participants: {
          create: allParticipantIds.map(userId => ({ userId })),
        },
      },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, email: true, role: true } } },
        },
        student: { select: { id: true, firstName: true, lastName: true, className: true } },
      },
    });

    res.status(201).json(conversation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/messages', async (req, res) => {
  try {
    const { body, type, fileUrl } = req.body;
    if (!body) return res.status(400).json({ error: 'body required' });

    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, schoolId: req.schoolId },
      include: { participants: true },
    });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const isParticipant = conversation.participants.some(p => p.userId === req.user.id);
    const isAdmin = ['headteacher', 'admin'].includes(req.user.role);
    if (!isParticipant && !isAdmin) return res.status(403).json({ error: 'Access denied' });

    const message = await prisma.conversationMessage.create({
      data: {
        conversationId: req.params.id,
        senderId: req.user.id,
        body,
        type: type || 'text',
        fileUrl: fileUrl || null,
      },
    });

    await prisma.conversation.update({
      where: { id: req.params.id },
      data: { updatedAt: new Date() },
    });

    const otherParticipants = conversation.participants
      .filter(p => p.userId !== req.user.id)
      .map(p => p.userId);

    for (const userId of otherParticipants) {
      triggerNotification(req.schoolId, NOTIFICATION_TYPES.NEW_MESSAGE, {
        title: `New message from ${req.user.name}`,
        message: body.substring(0, 100),
        recipients: [userId],
      }).catch(() => {});
    }

    res.status(201).json(message);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/with-parent/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await prisma.student.findFirst({
      where: { id: studentId, schoolId: req.schoolId },
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const guardianIds = await getStudentGuardians(req.schoolId, studentId);
    if (guardianIds.length === 0) {
      return res.status(404).json({ error: 'No parent/guardian linked to this student' });
    }

    const allParticipantIds = [...new Set([req.user.id, ...guardianIds])];

    const existing = await prisma.conversation.findFirst({
      where: {
        schoolId: req.schoolId,
        studentId,
        participants: { some: { userId: req.user.id } },
      },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, email: true, role: true } } },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        student: { select: { id: true, firstName: true, lastName: true, className: true } },
      },
    });

    if (existing) {
      const isParticipant = existing.participants.some(p => p.userId === req.user.id);
      if (isParticipant) return res.json(existing);
    }

    const conversation = await prisma.conversation.create({
      data: {
        schoolId: req.schoolId,
        studentId,
        title: `${student.firstName} ${student.lastName}`,
        participants: {
          create: allParticipantIds.map(userId => ({ userId })),
        },
      },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, email: true, role: true } } },
        },
        student: { select: { id: true, firstName: true, lastName: true, className: true } },
      },
    });

    res.status(201).json(conversation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/unread-count', async (req, res) => {
  try {
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: req.params.id, userId: req.user.id } },
    });
    if (!participant) return res.json({ count: 0 });

    const where = { conversationId: req.params.id, createdAt: { gt: participant.lastReadAt || new Date(0) } };
    if (participant.lastReadAt) {
      where.senderId = { not: req.user.id };
    } else {
      where.senderId = { not: req.user.id };
    }

    const count = await prisma.conversationMessage.count({ where });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/messages', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const before = req.query.before;

    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, schoolId: req.schoolId },
      include: { participants: true },
    });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const isParticipant = conversation.participants.some(p => p.userId === req.user.id);
    const isAdmin = ['headteacher', 'admin'].includes(req.user.role);
    if (!isParticipant && !isAdmin) return res.status(403).json({ error: 'Access denied' });

    const query = { conversationId: req.params.id };
    if (before) query.createdAt = { lt: new Date(before) };

    const messages = await prisma.conversationMessage.findMany({
      where: query,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
