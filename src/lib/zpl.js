function escapeZpl(str) {
  return str.replace(/[\\^~]/g, '');
}

function generateCardZpl({ schoolName = 'EduPlatform', studentName, cardUid }) {
  const sn = escapeZpl(schoolName);
  const nm = escapeZpl(studentName || 'Student');
  const uid = escapeZpl(cardUid || 'EDU-NONE');
  const lines = [
    '^XA',
    '^CF0,20',
    '^FO25,20^FD' + sn + '^FS',
    '^GB0,50,812,2,B,0^FS',
    '^CF0,45',
    '^FO25,100^FD' + nm + '^FS',
    '^BY3,3,80',
    '^FO25,250^BCN,100,Y,N,N^FD' + uid + '^FS',
    '^CF0,18',
    '^FO25,370^FD' + uid + '^FS',
    '^GB0,50,812,2,B,0^FS',
    '^FO25,410^CF0,14^FDEduPlatform NFC Card^FS',
    '^FO25,435^CF0,12^FDwww.eduplatform.com^FS',
    '^XZ',
  ];
  return lines.join('\r\n');
}

function generateBatchZpl(cards) {
  return cards.map((c) => generateCardZpl(c)).join('\r\n');
}

module.exports = { generateCardZpl, generateBatchZpl };
