function publicBaseUrl(req) {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, '');
  if (req && req.get) {
    const host = req.get('host');
    if (host) {
      const proto = req.protocol || (req.secure ? 'https' : 'http');
      if (proto === 'https' || host.includes('onrender.com')) return `https://${host}`;
      return `${proto}://${host}`;
    }
  }
  return 'http://localhost:4000';
}

function publicFrontendUrl() {
  return (process.env.FRONTEND_URL || 'https://eduplatformsoftware.com').replace(/\/$/, '');
}

module.exports = { publicBaseUrl, publicFrontendUrl };