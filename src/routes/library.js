const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/books', async (req, res) => {
  const books = await prisma.book.findMany({ where: { schoolId: req.schoolId }, orderBy: { title: 'asc' } });
  res.json(books);
});

router.post('/books', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  const { title, author, isbn, publisher, category, quantity, shelfLocation } = req.body;
  if (!title || !author) return res.status(400).json({ error: 'title and author required' });
  const q = parseInt(quantity || 1);
  const book = await prisma.book.create({ data: { schoolId: req.schoolId, title, author, isbn: isbn || '', publisher: publisher || '', category: category || '', quantity: q, availableQuantity: q, shelfLocation: shelfLocation || '' } });
  res.status(201).json(book);
});

router.put('/books/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  await prisma.book.updateMany({ where: { id: req.params.id, schoolId: req.schoolId }, data: req.body });
  res.json({ ok: true });
});

router.delete('/books/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  await prisma.bookLoan.deleteMany({ where: { bookId: req.params.id, schoolId: req.schoolId } });
  await prisma.book.deleteMany({ where: { id: req.params.id, schoolId: req.schoolId } });
  res.json({ ok: true });
});

router.get('/loans', async (req, res) => {
  const loans = await prisma.bookLoan.findMany({ where: { schoolId: req.schoolId }, include: { book: { select: { title: true, author: true } } }, orderBy: { borrowedDate: 'desc' } });
  res.json(loans);
});

router.post('/loans', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  const { bookId, borrowedBy, borrowedType, dueDate } = req.body;
  if (!bookId || !borrowedBy || !dueDate) return res.status(400).json({ error: 'bookId, borrowedBy, dueDate required' });
  const book = await prisma.book.findFirst({ where: { id: bookId, schoolId: req.schoolId } });
  if (!book || book.availableQuantity < 1) return res.status(400).json({ error: 'No copies available' });
  const loan = await prisma.bookLoan.create({ data: { schoolId: req.schoolId, bookId, borrowedBy, borrowedType: borrowedType || 'student', borrowedDate: new Date().toISOString().split('T')[0], dueDate } });
  await prisma.book.update({ where: { id: bookId }, data: { availableQuantity: { decrement: 1 } } });
  res.status(201).json(loan);
});

router.post('/loans/:id/return', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  const loan = await prisma.bookLoan.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  const today = new Date().toISOString().split('T')[0];
  const fine = new Date(today) > new Date(loan.dueDate) ? parseFloat(req.body.fine || 0) : 0;
  await prisma.bookLoan.update({ where: { id: req.params.id }, data: { returnedDate: today, status: 'returned', fine } });
  await prisma.book.update({ where: { id: loan.bookId }, data: { availableQuantity: { increment: 1 } } });
  res.json({ ok: true });
});

module.exports = router;
