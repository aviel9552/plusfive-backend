const express = require('express');
const router = express.Router();
const { getAllQRCodes, createQRCode, generateQRCodeWithUserInfo, getQRCodeById, updateQRCode, deleteQRCode, serveQRCodeImage, incrementShareCount, incrementScanCount } = require('../controllers/qrController');
const { authenticateToken } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { qrCodeCreateSchema, qrCodeUpdateSchema } = require('../lib/validations');

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

// POST /api/qr - Create new QR code (with optional direct generation)
router.post('/', authenticateToken, validateRequest(qrCodeCreateSchema), createQRCode);

// POST /api/qr/generate-with-user-info - Generate QR code with user's information
router.post('/generate-with-user-info', authenticateToken, generateQRCodeWithUserInfo);

// GET /api/qr/:id - Get QR code by ID
router.get('/:id', authenticateToken, getQRCodeById);

// PUT /api/qr/:id - Update QR code
router.put('/:id', authenticateToken, validateRequest(qrCodeUpdateSchema), updateQRCode);

// DELETE /api/qr/:id - Delete QR code
router.delete('/:id', authenticateToken, deleteQRCode);

// GET /api/qr/:id/image - Serve QR code image directly
router.get('/:id/image', authenticateToken, serveQRCodeImage);

// POST /api/qr/:id/share - Increment share count
router.post('/:id/share', authenticateToken, incrementShareCount);

// POST /api/qr/:id/scan - Increment scan count
router.post('/:id/scan', incrementScanCount);

module.exports = router; 