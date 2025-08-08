const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const QRCode = require('qrcode');

// Get all QR codes
const getAllQRCodes = async (req, res) => {
  try {
    const isActive = req.query.isActive;
    
    // If user is admin, show all QR codes, otherwise show only user's QR codes
    const where = {
      ...(req.user.role !== 'admin' && { userId: req.user.userId }),
      ...(isActive !== undefined && { isActive: isActive === 'true' })
    };
    
    const qrCodes = await prisma.qRCode.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
            businessName: true,
            businessType: true,
            address: true,
            whatsappNumber: true,
            role: true,
            accountStatus: true,
            subscriptionStatus: true,
            subscriptionPlan: true,
            createdAt: true
          }
        }
      }
    });
    
    // Generate QR code images for codes that don't have them
    const qrCodesWithImages = await Promise.all(
      qrCodes.map(async (qrCode) => {
        if (!qrCode.qrCodeImage) {
          try {
            const qrCodeImage = await QRCode.toDataURL(qrCode.qrData, {
              errorCorrectionLevel: 'M',
              type: 'image/png',
              quality: 0.92,
              margin: 1,
              color: {
                dark: '#000000',
                light: '#FFFFFF'
              }
            });
            
            // Update the QR code with the generated image
            await prisma.qRCode.update({
              where: { id: qrCode.id },
              data: { qrCodeImage: qrCodeImage }
            });
            
            return { ...qrCode, qrCodeImage };
          } catch (error) {
            console.error(`Error generating QR code image for ${qrCode.id}:`, error);
            return qrCode;
          }
        }
        return qrCode;
      })
    );
    
    return successResponse(res, {
      qrCodes: qrCodesWithImages,
      total: qrCodesWithImages.length,
      userRole: req.user.role,
      isAdmin: req.user.role === 'admin'
    });
    
  } catch (error) {
    console.error('Get QR codes error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Create new QR code
const createQRCode = async (req, res) => {
  try {
    const { name, code, directGenerate = false, size = 200, color = '#000000', backgroundColor = '#FFFFFF' } = req.body;
    
    if (!code) {
      return errorResponse(res, 'QR code is required', 400);
    }
    
    // Generate QR code image based on the short code
    const qrCodeImage = await QRCode.toDataURL(code, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      width: size,
      color: {
        dark: color,
        light: backgroundColor
      }
    });
    
    // If directGenerate is true, return image directly without storing in database
    if (directGenerate) {
      // Extract base64 data from data URL
      const base64Data = qrCodeImage.replace(/^data:image\/png;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      // Set headers for image response
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Length', imageBuffer.length);
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
      
      return res.send(imageBuffer);
    }
    
    // Store in database (normal flow)
    const qrCode = await prisma.qRCode.create({
      data: {
        userId: req.user.userId,
        name: name || `QR Code ${code}`,
        url: `${process.env.FRONTEND_URL}/qr/redirect/${code}`, // Store frontend redirect URL
        qrData: code, // Store the short code as QR data
        qrCodeImage: qrCodeImage,
      }
    });
    
    return successResponse(res, {
      ...qrCode,
      qrCodeImage
    }, 'QR code created successfully');
    
  } catch (error) {
    console.error('Create QR code error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Generate QR code with user's information
const generateQRCodeWithUserInfo = async (req, res) => {
  try {
    const { name, messageForCustomer, directMessage, size = 200, color = '#000000', backgroundColor = '#FFFFFF' } = req.body;
    
    // Get user information
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        firstName: true,
        lastName: true,
        businessName: true,
        whatsappNumber: true,
        directChatMessage: true
      }
    });
    
    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }
    
    // Generate unique random code
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Use dynamic messages - user input first, then profile default, then fallback
    const customerMessage = messageForCustomer || user.directChatMessage || `Hi ${user.firstName}! I found your business through QR code.`;
    const directMsg = directMessage || user.directChatMessage || `Hi ${user.firstName}! I'm interested in your services.`;
    
    // Create WhatsApp URL with dynamic message
    const whatsappNumber = user.whatsappNumber || '';
    const whatsappUrl = `https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(directMsg)}`;
    
    // Generate QR code image using the random code
    const qrCodeImage = await QRCode.toDataURL(randomCode, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      width: size,
      color: {
        dark: color,
        light: backgroundColor
      }
    });
    
    // Store in database with random code as qrData and redirect URL as url
    const qrCode = await prisma.qRCode.create({
      data: {
        userId: req.user.userId,
        name: name || `${user.businessName || user.firstName}'s QR Code`,
        url: `${process.env.FRONTEND_URL}/qr/redirect/${randomCode}`, // Store frontend redirect URL
        qrData: randomCode, // Store the random code as QR data
        qrCodeImage: qrCodeImage,
      }
    });
    
    return successResponse(res, {
      ...qrCode,
      qrCodeImage,
      userInfo: {
        firstName: user.firstName,
        lastName: user.lastName,
        businessName: user.businessName,
        whatsappNumber: user.whatsappNumber,
        customerMessage,
        directMessage: directMsg,
        whatsappUrl, 
        randomCode,
        messageSource: {
          customerMessage: messageForCustomer ? 'user_input' : user.directChatMessage ? 'profile_default' : 'system_default',
          directMessage: directMessage ? 'user_input' : user.directChatMessage ? 'profile_default' : 'system_default'
        }
      }
    }, 'QR code generated successfully with user information');
    
  } catch (error) {
    console.error('Generate QR code with user info error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Get QR code by ID
const getQRCodeById = async (req, res) => {
  try {
    // If user is admin, can access any QR code, otherwise only user's own QR codes
    // const where = {
    //   id: req.params.id,
    //   ...(req.user.role !== 'admin' && { userId: req.user.userId })
    // };
    
    const qrCode = await prisma.qRCode.findFirst({
      // where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
            businessName: true,
            businessType: true,
            address: true,
            whatsappNumber: true,
            role: true,
            accountStatus: true,
            subscriptionStatus: true,
            subscriptionPlan: true,
            createdAt: true
          }
        }
      }
    });
    
    if (!qrCode) {
      return errorResponse(res, 'QR code not found', 404);
    }
    
    // If QR code image doesn't exist, generate it
    if (!qrCode.qrCodeImage) {
      const qrCodeImage = await QRCode.toDataURL(qrCode.qrData, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      // Update the QR code with the generated image
      await prisma.qRCode.update({
        where: { id: req.params.id },
        data: { qrCodeImage: qrCodeImage }
      });
      
      qrCode.qrCodeImage = qrCodeImage;
    }
    
    return successResponse(res, {
      ...qrCode,
      userRole: req.user.role,
      isAdmin: req.user.role === 'admin'
    });
    
  } catch (error) {
    console.error('Get QR code error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Update QR code
const updateQRCode = async (req, res) => {
  try {
    // Check if QR code exists and belongs to user
    const existingQRCode = await prisma.qRCode.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.userId
      }
    });
    
    if (!existingQRCode) {
      return errorResponse(res, 'QR code not found', 404);
    }
    
    // Update QR code
    const qrCode = await prisma.qRCode.update({
      where: { id: req.params.id },
      data: req.body
    });
    
    return successResponse(res, qrCode, 'QR code updated successfully');
    
  } catch (error) {
    console.error('Update QR code error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Delete QR code
const deleteQRCode = async (req, res) => {
  try {
    // Check if QR code exists and belongs to user
    const existingQRCode = await prisma.qRCode.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.userId
      }
    });
    
    if (!existingQRCode) {
      return errorResponse(res, 'QR code not found', 404);
    }
    
    // Delete QR code
    await prisma.qRCode.delete({
      where: { id: req.params.id }
    });
    
    return successResponse(res, null, 'QR code deleted successfully');
    
  } catch (error) {
    console.error('Delete QR code error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Increment scan count for QR code (public endpoint - no auth required)
const incrementScanCount = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find QR code by ID (public access)
    const qrCode = await prisma.qRCode.findFirst({
      where: { id }
    });
    
    if (!qrCode) {
      return errorResponse(res, 'QR code not found', 404);
    }
    
    // Increment scan count
    const updatedQRCode = await prisma.qRCode.update({
      where: { id },
      data: {
        scanCount: {
          increment: 1
        }
      }
    });
    
    return successResponse(res, {
      qrCode: updatedQRCode,
      message: 'Scan count incremented successfully'
    });
    
  } catch (error) {
    console.error('Increment scan count error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Increment share count for QR code
const incrementShareCount = async (req, res) => {
  try {
    const { id } = req.params;
    
    // If user is admin, can access any QR code, otherwise only user's own QR codes
    const where = {
      id,
      ...(req.user.role !== 'admin' && { userId: req.user.userId })
    };
    
    const qrCode = await prisma.qRCode.findFirst({
      where
    });
    
    if (!qrCode) {
      return errorResponse(res, 'QR code not found', 404);
    }
    
    // Increment share count
    const updatedQRCode = await prisma.qRCode.update({
      where: { id },
      data: {
        shareCount: {
          increment: 1
        }
      }
    });
    
    return successResponse(res, {
      qrCode: updatedQRCode,
      message: 'Share count incremented successfully'
    });
    
  } catch (error) {
    console.error('Increment share count error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Serve QR code image directly
const serveQRCodeImage = async (req, res) => {
  try {
    const { id } = req.params;
    
    // If user is admin, can access any QR code, otherwise only user's own QR codes
    const where = {
      id,
      ...(req.user.role !== 'admin' && { userId: req.user.userId })
    };
    
    const qrCode = await prisma.qRCode.findFirst({
      where
    });
    
    if (!qrCode) {
      return errorResponse(res, 'QR code not found', 404);
    }
    
    // If QR code image doesn't exist, generate it
    if (!qrCode.qrCodeImage) {
      const qrCodeImage = await QRCode.toDataURL(qrCode.qrData, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      // Update the QR code with the generated image
      await prisma.qRCode.update({
        where: { id },
        data: { qrCodeImage: qrCodeImage }
      });
      
      qrCode.qrCodeImage = qrCodeImage;
    }
    
    // Extract base64 data from data URL
    const base64Data = qrCode.qrCodeImage.replace(/^data:image\/png;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    // Set headers for image response
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', imageBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    
    return res.send(imageBuffer);
    
  } catch (error) {
    console.error('Serve QR code image error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Get user's own QR codes only
const getUserOwnQRCodes = async (req, res) => {
  try {
    const isActive = req.query.isActive;
    
    // Only show current user's QR codes
    const where = {
      userId: req.user.userId,
      ...(isActive !== undefined && { isActive: isActive === 'true' })
    };
    
    const qrCodes = await prisma.qRCode.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
            businessName: true,
            businessType: true,
            address: true,
            whatsappNumber: true,
            role: true,
            accountStatus: true,
            subscriptionStatus: true,
            subscriptionPlan: true,
            createdAt: true
          }
        }
      }
    });
    
    // Generate QR code images for codes that don't have them
    const qrCodesWithImages = await Promise.all(
      qrCodes.map(async (qrCode) => {
        if (!qrCode.qrCodeImage) {
          try {
            const qrCodeImage = await QRCode.toDataURL(qrCode.qrData, {
              errorCorrectionLevel: 'M',
              type: 'image/png',
              quality: 0.92,
              margin: 1,
              color: {
                dark: '#000000',
                light: '#FFFFFF'
              }
            });
            
            // Update the QR code with the generated image
            await prisma.qRCode.update({
              where: { id: qrCode.id },
              data: { qrCodeImage: qrCodeImage }
            });
            
            return { ...qrCode, qrCodeImage };
          } catch (error) {
            console.error(`Error generating QR code image for ${qrCode.id}:`, error);
            return qrCode;
          }
        }
        return qrCode;
      })
    );
    
    return successResponse(res, {
      qrCodes: qrCodesWithImages,
      total: qrCodesWithImages.length,
      message: 'User\'s own QR codes retrieved successfully'
    });
    
  } catch (error) {
    console.error('Get user own QR codes error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

module.exports = {
  getAllQRCodes,
  createQRCode,
  generateQRCodeWithUserInfo,
  getQRCodeById,
  updateQRCode,
  deleteQRCode,
  serveQRCodeImage,
  incrementShareCount,
  incrementScanCount,
  getUserOwnQRCodes,
}; 