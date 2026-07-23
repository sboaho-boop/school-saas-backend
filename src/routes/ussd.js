const { Router } = require('express');
const prisma = require('../lib/prisma');
const { sendFulfillmentCallback, buildResponse, endSession, addToCart } = require('../lib/hubtel-ussd');

const router = Router();

router.post('/interaction', async (req, res) => {
  try {
    const { Type, Mobile, SessionId, ServiceCode, Message, Operator, Sequence, ClientState, Platform } = req.body;

    const schools = await prisma.school.findMany();
    const school = schools.length > 0 ? schools[0] : null;

    if (Type === 'Initiation') {
      return res.json(buildResponse({
        sessionId: SessionId,
        type: 'response',
        message: 'Welcome to EDUPLATFORM\n1. Check Fees\n2. Pay Fees\n3. Check Balance\n4. Student Results\n5. Contact School',
        label: 'EDUPLATFORM Services',
        dataType: 'input',
        fieldType: 'text',
        clientState: 'MAIN_MENU',
      }));
    }

    if (Type === 'Timeout') {
      return res.json(endSession({ sessionId: SessionId, message: 'Session timed out. Goodbye.' }));
    }

    switch (ClientState) {
      case 'MAIN_MENU':
        switch (Message) {
          case '1':
            return res.json(buildResponse({
              sessionId: SessionId,
              type: 'response',
              message: 'Enter student index number:',
              label: 'Check Fees',
              dataType: 'input',
              fieldType: 'text',
              clientState: 'CHECK_FEES',
            }));
          case '2':
            return res.json(buildResponse({
              sessionId: SessionId,
              type: 'response',
              message: 'Enter student index number:',
              label: 'Pay Fees',
              dataType: 'input',
              fieldType: 'text',
              clientState: 'PAY_FEES',
            }));
          case '3':
            return res.json(buildResponse({
              sessionId: SessionId,
              type: 'response',
              message: 'Enter student index number:',
              label: 'Check Balance',
              dataType: 'input',
              fieldType: 'text',
              clientState: 'CHECK_BALANCE',
            }));
          case '4':
            return res.json(buildResponse({
              sessionId: SessionId,
              type: 'response',
              message: 'Enter student index number:',
              label: 'Student Results',
              dataType: 'input',
              fieldType: 'text',
              clientState: 'CHECK_RESULTS',
            }));
          case '5':
            return res.json(endSession({
              sessionId: SessionId,
              message: 'For support, call 055 667 4353 or visit eduplatformsoftware.com',
              label: 'Contact',
            }));
          default:
            return res.json(buildResponse({
              sessionId: SessionId,
              type: 'response',
              message: 'Invalid option. Please try again.\n1. Check Fees\n2. Pay Fees\n3. Check Balance\n4. Student Results\n5. Contact School',
              label: 'Invalid option',
              dataType: 'input',
              fieldType: 'text',
              clientState: 'MAIN_MENU',
            }));
        }

      case 'CHECK_FEES':
      case 'CHECK_BALANCE': {
        const indexNumber = Message.trim();
        const student = await prisma.student.findFirst({ where: { indexNumber } });
        if (!student) {
          return res.json(endSession({ sessionId: SessionId, message: `Student ${indexNumber} not found. Goodbye.` }));
        }
        const feesPaid = student.feesPaid || 0;
        const totalFees = student.totalFees || 0;
        const balance = totalFees - feesPaid;
        return res.json(endSession({
          sessionId: SessionId,
          message: `${student.firstName} ${student.lastName}\nTotal Fees: GHS ${totalFees}\nPaid: GHS ${feesPaid}\nBalance: GHS ${balance}`,
          label: 'Fee Balance',
        }));
      }

      case 'PAY_FEES': {
        const indexNumber = Message.trim();
        const student = await prisma.student.findFirst({ where: { indexNumber } });
        if (!student) {
          return res.json(endSession({ sessionId: SessionId, message: `Student ${indexNumber} not found. Goodbye.` }));
        }
        return res.json(buildResponse({
          sessionId: SessionId,
          type: 'response',
          message: `Fees for ${student.firstName} ${student.lastName}\nBalance: GHS ${(student.totalFees || 0) - (student.feesPaid || 0)}\nEnter amount to pay:`,
          label: 'Pay Fees',
          dataType: 'input',
          fieldType: 'decimal',
          clientState: `PAY_AMOUNT:${student.id}`,
        }));
      }

      case 'CHECK_RESULTS': {
        const indexNumber = Message.trim();
        const student = await prisma.student.findFirst({ where: { indexNumber } });
        if (!student) {
          return res.json(endSession({ sessionId: SessionId, message: `Student ${indexNumber} not found. Goodbye.` }));
        }
        return res.json(endSession({
          sessionId: SessionId,
          message: `Results for ${student.firstName} ${student.lastName}:\nClass: ${student.class || 'N/A'}\nVisit eduplatformsoftware.com for detailed results.`,
          label: 'Student Results',
        }));
      }

      default:
        if (ClientState && ClientState.startsWith('PAY_AMOUNT:')) {
          const studentId = ClientState.split(':')[1];
          const amount = parseFloat(Message);
          if (isNaN(amount) || amount <= 0) {
            return res.json(endSession({ sessionId: SessionId, message: 'Invalid amount. Goodbye.' }));
          }

          const student = await prisma.student.findFirst({ where: { id: studentId } });
          const itemName = student ? `School Fees — ${student.firstName} ${student.lastName}` : 'School Fees';

          return res.json(addToCart({
            sessionId: SessionId,
            message: `Pay GHS ${amount} for ${itemName}? Please approve payment on your phone.`,
            itemName,
            qty: 1,
            price: amount,
            label: `Pay GHS ${amount}`,
          }));
        }

        return res.json(endSession({ sessionId: SessionId, message: 'Invalid session. Goodbye.' }));
    }
  } catch (err) {
    console.error('USSD interaction error:', err);
    res.json({
      SessionId: req.body?.SessionId || '',
      Type: 'release',
      Message: 'An error occurred. Please try again later.',
      Label: 'Error',
      DataType: 'display',
    });
  }
});

router.post('/fulfillment', async (req, res) => {
  try {
    console.log('USSD fulfillment received:', JSON.stringify(req.body));
    const { SessionId, OrderId, ExtraData, OrderInfo } = req.body;

    if (OrderInfo?.Status === 'Paid') {
      const amountPaid = OrderInfo.Payment?.AmountPaid || 0;
      const customerName = OrderInfo.CustomerName || 'Customer';
      const customerMobile = OrderInfo.CustomerMobileNumber || '';

      console.log(`USSD payment fulfilled: ${OrderId} — GHS ${amountPaid} from ${customerName} (${customerMobile})`);

      const schools = await prisma.school.findMany();
      const school = schools.length > 0 ? schools[0] : null;

      if (school) {
        await sendFulfillmentCallback({
          sessionId: SessionId,
          orderId: OrderId,
          serviceStatus: 'success',
          credentials: school,
        });
      }
    }

    res.status(200).json({ message: 'OK' });
  } catch (err) {
    console.error('USSD fulfillment error:', err);
    res.status(200).json({ message: 'OK' });
  }
});

module.exports = router;
