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
    
    // Generate QR code image using the full redirect URL
    const redirectUrl = `${process.env.FRONTEND_URL}/qr/redirect/${randomCode}`;
    const qrCodeImage = await QRCode.toDataURL(redirectUrl, {
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
        qrData: randomCode, // Store the frontend redirect URL as QR data
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
      where: {
        id: req.params.id
      },
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
// Get QR code by code
const getQRCodeByCode = async (req, res) => {
  try {
    // If user is admin, can access any QR code, otherwise only user's own QR codes
    // const where = {
    //   id: req.params.id,
    //   ...(req.user.role !== 'admin' && { userId: req.user.userId })
    // };
    
    const qrCode = await prisma.qRCode.findFirst({
      where: {
        qrData: req.params.code
      },
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

// Increment scan count for QR code (authenticated endpoint)
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

// NEW: Get QR code analytics for a specific QR code
const getQRAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.user.role;
    const userId = req.user.userId;

    // Build where clause based on role
    const whereClause = {
      id,
      ...(userRole === 'user' ? { userId } : {})
    };

    // Get QR code with scan analytics
    const qrCode = await prisma.qRCode.findFirst({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            businessName: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    if (!qrCode) {
      return errorResponse(res, 'QR Code not found or access denied', 404);
    }

    // Calculate analytics
    const totalScans = qrCode.scanCount || 0;
    const todayScans = 0; // Placeholder - implement if you want daily tracking
    const thisWeekScans = 0; // Placeholder - implement if you want weekly tracking
    const thisMonthScans = 0; // Placeholder - implement if you want monthly tracking

    const analytics = {
      totalScans,
      todayScans,
      thisWeekScans,
      thisMonthScans,
      sharedCount: qrCode.shareCount || 0,
      averageScansPerDay: totalScans > 0 ? Math.round(totalScans / Math.max(1, Math.ceil((Date.now() - new Date(qrCode.createdAt).getTime()) / (1000 * 60 * 60 * 24)))) : 0
    };

    return successResponse(res, {
      qrCode: {
        id: qrCode.id,
        name: qrCode.name,
        qrData: qrCode.qrData,
        url: qrCode.url,
        createdAt: qrCode.createdAt,
        status: qrCode.isActive ? 'Active' : 'Inactive',
        businessOwner: qrCode.user ? (qrCode.user.businessName || `${qrCode.user.firstName || ''} ${qrCode.user.lastName || ''}`.trim() || 'Unknown') : 'Unknown'
      },
      analytics
    });

  } catch (error) {
    console.error('Error getting QR analytics:', error);
    return errorResponse(res, 'Failed to fetch QR analytics', 500);
  }
};

// NEW: Get QR code performance summary for the user
const getQRPerformance = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.userId;

    // Build where clause based on role
    const whereClause = userRole === 'user' ? { userId } : {};

    // Get performance metrics
    const [totalQRCodes, totalScans, totalShares] = await Promise.all([
      prisma.qRCode.count({ where: whereClause }),
      prisma.qRCode.aggregate({
        where: whereClause,
        _sum: { scanCount: true }
      }),
      prisma.qRCode.aggregate({
        where: whereClause,
        _sum: { shareCount: true }
      })
    ]);

    const performance = {
      totalQRCodes,
      totalScans: totalScans._sum.scanCount || 0,
      totalShares: totalShares._sum.shareCount || 0,
      averageScansPerQR: totalQRCodes > 0 ? Math.round((totalScans._sum.scanCount || 0) / totalQRCodes) : 0,
      averageSharesPerQR: totalQRCodes > 0 ? Math.round((totalShares._sum.shareCount || 0) / totalQRCodes) : 0
    };

    return successResponse(res, performance);

  } catch (error) {
    console.error('Error getting QR performance:', error);
    return errorResponse(res, 'Failed to fetch QR performance', 500);
  }
};

// NEW: Get QR codes with enhanced analytics for dashboard
const getQRCodesWithAnalytics = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.userId;

    // Build where clause based on role
    const whereClause = userRole === 'user' ? { userId } : {};

    // Get QR codes with analytics
    const qrCodes = await prisma.qRCode.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            businessName: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    // Calculate analytics for each QR code
    const qrCodesWithAnalytics = qrCodes.map(qr => {
      const daysSinceCreation = Math.ceil((Date.now() - new Date(qr.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      
      return {
        id: qr.id,
        name: qr.name,
        qrData: qr.qrData,
        url: qr.url,
        isActive: qr.isActive,
        scanCount: qr.scanCount,
        shareCount: qr.shareCount,
        createdAt: qr.createdAt,
        businessOwner: qr.user ? (qr.user.businessName || `${qr.user.firstName || ''} ${qr.user.lastName || ''}`.trim() || 'Unknown') : 'Unknown',
        analytics: {
          totalScans: qr.scanCount,
          totalShares: qr.shareCount,
          averageScansPerDay: daysSinceCreation > 0 ? (qr.scanCount / daysSinceCreation).toFixed(2) : 0,
          averageSharesPerDay: daysSinceCreation > 0 ? (qr.shareCount / daysSinceCreation).toFixed(2) : 0,
          daysSinceCreation
        }
      };
    });

    // Calculate overall statistics
    const totalScans = qrCodes.reduce((sum, qr) => sum + qr.scanCount, 0);
    const totalShares = qrCodes.reduce((sum, qr) => sum + qr.shareCount, 0);
    const activeQRCodes = qrCodes.filter(qr => qr.isActive).length;

    return successResponse(res, {
      qrCodes: qrCodesWithAnalytics,
      summary: {
        totalQRCodes: qrCodes.length,
        totalScans,
        totalShares,
        activeQRCodes,
        averageScansPerQR: qrCodes.length > 0 ? Math.round(totalScans / qrCodes.length) : 0,
        averageSharesPerQR: qrCodes.length > 0 ? Math.round(totalShares / qrCodes.length) : 0
      }
    });

  } catch (error) {
    console.error('Error getting QR codes with analytics:', error);
    return errorResponse(res, 'Failed to fetch QR codes with analytics', 500);
  }
};

module.exports = {
  getAllQRCodes,
  createQRCode,
  generateQRCodeWithUserInfo,
  getQRCodeById,
  getQRCodeByCode,
  updateQRCode,
  deleteQRCode,
  serveQRCodeImage,
  incrementShareCount,
  incrementScanCount,
  getUserOwnQRCodes,
  // New analytics methods
  getQRAnalytics,
  getQRPerformance,
  getQRCodesWithAnalytics
}; 