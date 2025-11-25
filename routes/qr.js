const express = require('express');
const router = express.Router();
const { getAllQRCodes, createQRCode, generateQRCodeWithUserInfo, generateWhatsAppQRCode, getQRCodeById, getQRCodeByCode, deleteQRCode, serveQRCodeImage, incrementShareCount, incrementScanCount, getUserOwnQRCodes, getQRAnalytics, getQRPerformance, getQRCodesWithAnalytics, scanQRCode, shareQRCode } = require('../controllers/qrController');
const { authenticateToken } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const { validateRequest } = require('../middleware/validation');
const { qrCodeCreateSchema } = require('../lib/validations');
const prisma = require('../lib/prisma');

// Redirect route for short links (when QR codes are scanned)
router.get('/qr/:shortCode', async (req, res) => {
  try {
    const { shortCode } = req.params;
    
    // Find QR code by short code
    const qrCode = await prisma.qRCode.findFirst({
      where: { qrData: shortCode }
    });
    
    if (!qrCode) {
      return res.status(404).send('QR Code not found');
    }
    
    // Increment scan count
    await prisma.qRCode.update({
      where: { id: qrCode.id },
      data: {
        scanCount: {
          increment: 1
        }
      }
    });
    
    // Redirect to the actual WhatsApp URL
    res.redirect(qrCode.url);
    
  } catch (error) {
    console.error('QR redirect error:', error);
    res.status(500).send('Internal server error');
  }
});

// POST /api/qr/scan/:shortCode - Scan QR code and increment scan count
router.post('/scan/:shortCode', scanQRCode);

// POST /api/qr/share/:shortCode - Share QR code and increment share count
router.post('/share/:shortCode', shareQRCode);

// Public redirect route for QR code scanning
router.get('/redirect/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find QR code
    const qrCode = await prisma.qRCode.findFirst({
      where: { id }
    });
    
    if (!qrCode) {
      return res.status(404).send('QR Code not found');
    }
    
    // Increment scan count
    await prisma.qRCode.update({
      where: { id },
      data: {
        scanCount: {
          increment: 1
        }
      }
    });
    
    // Redirect to the actual URL
    res.redirect(qrCode.url);
    
  } catch (error) {
    console.error('QR redirect error:', error);
    res.status(500).send('Internal server error');
  }
});

// GET /api/qr - Get all QR codes
router.get('/', authenticateToken, getAllQRCodes);

// GET /api/qr/my-qr-codes - Get user's own QR codes only
router.get('/my-qr-codes', authenticateToken, getUserOwnQRCodes);

// GET /api/qr/analytics - Get QR codes with enhanced analytics for dashboard
router.get('/analytics', authenticateToken, getQRCodesWithAnalytics);

// GET /api/qr/performance - Get overall QR performance summary
router.get('/performance', authenticateToken, getQRPerformance);

// POST /api/qr - Create new QR code (with optional direct generation) - requires subscription
router.post('/', authenticateToken, checkSubscription, validateRequest(qrCodeCreateSchema), createQRCode);

// POST /api/qr/generate-with-user-info - Generate QR code with user's information - requires subscription
router.post('/generate-with-user-info', authenticateToken, checkSubscription, generateQRCodeWithUserInfo);

// POST /api/qr/generate-whatsapp - Generate WhatsApp QR codes with short links (Client's requirement) - requires subscription
router.post('/generate-whatsapp', authenticateToken, checkSubscription, generateWhatsAppQRCode);

// GET /api/qr/qr-code/:code - Get QR code by Code (View Only - No Scan Tracking)
router.get('/qr-code/:code', getQRCodeByCode);

// GET /api/qr/:id/analytics - Get analytics for a specific QR code
router.get('/:id/analytics', authenticateToken, getQRAnalytics);

// POST /api/qr/:id/share - Increment share count
router.post('/:id/share', authenticateToken, incrementShareCount);

// POST /api/qr/:id/scan - Increment scan count (Public API - No Authentication Required)
router.post('/:id/scan', incrementScanCount);

// GET /api/qr/:id/image - Serve QR code image directly
router.get('/:id/image', authenticateToken, serveQRCodeImage);

// DELETE /api/qr/:id - Delete QR code
router.delete('/:id', authenticateToken, deleteQRCode);

// GET /api/qr/:id - Get QR code by ID (Must be last to avoid conflicts)
router.get('/:id', authenticateToken, getQRCodeById);

module.exports = router; 