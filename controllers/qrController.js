const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const QRCode = require('qrcode');
const { stripe } = require('../lib/stripe');

// Helper function to check if user has active subscription
// Checks Stripe API first (most reliable), then falls back to database
const checkUserSubscription = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      subscriptionStatus: true,
      subscriptionExpirationDate: true,
      role: true,
      stripeSubscriptionId: true
    }
  });

  if (!user) {
    return { hasActiveSubscription: false, reason: 'User not found' };
  }

  // Admin users don't need subscription
  if (user.role === 'admin') {
    return { hasActiveSubscription: true };
  }

  // FIRST: Check Stripe API if stripeSubscriptionId is available (most reliable source)
  if (user.stripeSubscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      
      // Check subscription status from Stripe
      const stripeStatus = subscription.status?.toLowerCase();
      if (!stripeStatus || 
          stripeStatus === 'canceled' || 
          stripeStatus === 'unpaid' ||
          stripeStatus === 'past_due' ||
          stripeStatus === 'incomplete' ||
          stripeStatus === 'incomplete_expired') {
        return { hasActiveSubscription: false, reason: 'Subscription not active' };
      }

      // Check current_period_end from Stripe (Unix timestamp in seconds)
      if (subscription.current_period_end) {
        const expiryTimestamp = subscription.current_period_end * 1000; // Convert to milliseconds
        const now = Date.now();
        if (expiryTimestamp < now) {
          return { hasActiveSubscription: false, reason: 'Subscription expired' };
        }
      }

      // Stripe subscription is active and not expired
      return { hasActiveSubscription: true };
    } catch (stripeError) {
      // If Stripe API call fails, fall back to database check
      console.error('Error checking Stripe subscription:', stripeError.message);
    }
  }

  // SECOND: Fallback to database fields if Stripe check failed or no stripeSubscriptionId
  const subscriptionStatus = user.subscriptionStatus?.toLowerCase();
  
  // Block if subscription is not active
  if (!subscriptionStatus || 
      subscriptionStatus === 'pending' || 
      subscriptionStatus === 'canceled' || 
      subscriptionStatus === 'inactive' ||
      subscriptionStatus === 'expired') {
    return { hasActiveSubscription: false, reason: 'Subscription not active' };
  }

  // Check expiration date from database
  if (user.subscriptionExpirationDate) {
    const now = new Date();
    const expirationDate = new Date(user.subscriptionExpirationDate);
    if (expirationDate < now) {
      return { hasActiveSubscription: false, reason: 'Subscription expired' };
    }
  }

  return { hasActiveSubscription: true };
};

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
    
    // Get actual scan and share counts from qr_code_scans table
    const qrCodesWithActualCounts = await Promise.all(
      qrCodes.map(async (qrCode) => {
        // Count actual scans (where scanData is not null and sharedata is null)
        const actualScanCount = await prisma.qRCodeScan.count({
          where: {
            qrCodeId: qrCode.id,
            AND: [
              { scanData: { not: null } },
              { sharedata: null }
            ]
          }
        });
        
        // Count actual shares (where sharedata is not null and scanData is null)
        const actualShareCount = await prisma.qRCodeScan.count({
          where: {
            qrCodeId: qrCode.id,
            AND: [
              { sharedata: { not: null } },
              { scanData: null }
            ]
          }
        });
        
        // Generate QR code images for codes that don't have them
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
            
            return { 
              ...qrCode, 
              qrCodeImage,
              scanCount: actualScanCount, // Override with actual count from database
              shareCount: actualShareCount // Override with actual count from database
            };
          } catch (error) {
            console.error(`Error generating QR code image for ${qrCode.id}:`, error);
            return {
              ...qrCode,
              scanCount: actualScanCount, // Override with actual count from database
              shareCount: actualShareCount // Override with actual count from database
            };
          }
        }
        
        return {
          ...qrCode,
          scanCount: actualScanCount, // Override with actual count from database
          shareCount: actualShareCount // Override with actual count from database
        };
      })
    );
    
    const responseData = {
      qrCodes: qrCodesWithActualCounts,
      total: qrCodesWithActualCounts.length,
      userRole: req.user.role,
      isAdmin: req.user.role === 'admin'
    };
    
    return successResponse(res, responseData);
    
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

    // Check if user has active subscription - block QR code creation if subscription is not active
    const subscriptionCheck = await checkUserSubscription(req.user.userId);
    if (!subscriptionCheck.hasActiveSubscription) {
      return errorResponse(res, `Active subscription required. ${subscriptionCheck.reason === 'Subscription expired' ? 'Subscription has expired. Please renew to continue.' : 'QR code cannot be created without an active subscription.'}`, 403);
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

// Generate QR code with user's information (One QR code per user lifetime)
const generateQRCodeWithUserInfo = async (req, res) => {
  try {
    const { name, messageForCustomer, directMessage, directUrl, messageUrl, size = 200, color = '#000000', backgroundColor = '#FFFFFF' } = req.body;
    
    // Check if user has active subscription - block QR code generation if subscription is not active
    // This check MUST happen BEFORE any database operations
    const subscriptionCheck = await checkUserSubscription(req.user.userId);
    if (!subscriptionCheck.hasActiveSubscription) {
      return errorResponse(res, `Active subscription required. ${subscriptionCheck.reason === 'Subscription expired' ? 'Subscription has expired. Please renew to continue.' : 'QR code cannot be generated without an active subscription.'}`, 403);
    }
    
    // Check if user already has a QR code
    const existingQRCode = await prisma.qRCode.findFirst({
      where: { userId: req.user.userId }
    });
    
    if (existingQRCode) {
      return errorResponse(res, 'User already has a QR code. Only one QR code allowed per user.', 400);
    }
    
    // Get user information
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        firstName: true,
        lastName: true,
        businessName: true,
        phoneNumber: true,
        directChatMessage: true
      }
    });
    
    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }
    
    // Generate unique random code
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Use exact values from request body
    const customerMessage = messageForCustomer;
    const directMsg = directMessage;
    
    // Create WhatsApp URL with dynamic message
    const phoneNumber = user.phoneNumber || '';
    const whatsappUrl = `https://wa.me/${phoneNumber.replace(/\D/g, '')}?text=${encodeURIComponent(directMsg)}`;
    
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
    
    // Store in database with all the new fields
    const qrCode = await prisma.qRCode.create({
      data: {
        userId: req.user.userId,
        name: name || `${user.businessName || user.firstName}'s QR Code`,
        url: `${process.env.FRONTEND_URL}/qr/redirect/${randomCode}`, // Store frontend redirect URL
        qrData: randomCode, // Store the random code as QR data
        qrCodeImage: qrCodeImage,
        messageForCustomer: customerMessage, // Store custom message for customers
        directMessage: directMsg, // Store direct message for WhatsApp/contact
        directUrl: directUrl || whatsappUrl, // Store direct URL (WhatsApp or custom)
        messageUrl: messageUrl || `${process.env.FRONTEND_URL}/qr/${randomCode}`, // Store message URL (redirect or custom)
      }
    });
    
    return successResponse(res, {
      ...qrCode,
      qrCodeImage,
      userInfo: {
        firstName: user.firstName,
        lastName: user.lastName,
        businessName: user.businessName,
        phoneNumber: user.phoneNumber,
        customerMessage,
        directMessage: directMsg,
        whatsappUrl, 
        randomCode,
        directUrl: directUrl || whatsappUrl,
        messageUrl: messageUrl || redirectUrl,
        messageSource: {
          customerMessage: messageForCustomer ? 'user_input' : user.directChatMessage ? 'profile_default' : 'system_default',
          directMessage: directMessage ? 'user_input' : user.directChatMessage ? 'profile_default' : 'system_default',
          directUrl: directUrl ? 'user_input' : 'whatsapp_default',
          messageUrl: messageUrl ? 'user_input' : 'redirect_default'
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

// Get QR code by CODE (View Only - No Scan Tracking)
const getQRCodeByCode = async (req, res) => {
  try {
    const { code } = req.params;
    
    const qrCode = await prisma.qRCode.findFirst({
      where: {
        qrData: code
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
        where: { id: qrCode.id },
        data: { qrCodeImage: qrCodeImage }
      });
      
      qrCode.qrCodeImage = qrCodeImage;
    }
    
    return successResponse(res, {
      ...qrCode,
      message: 'QR code retrieved successfully'
    });
    
  } catch (error) {
    console.error('Get QR code error:', error);
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

// Increment scan count for QR code (Public API - No Authentication Required)
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
    
    // Track the scan with detailed information
    try {
      await prisma.qRCodeScan.create({
        data: {
          qrCodeId: qrCode.id,
          userId: qrCode.userId,
          referrer: req.get('Referer') || 'Direct Access',
          userAgent: req.get('User-Agent') || 'Unknown',
          ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
          scanData: JSON.stringify({
            timestamp: new Date().toISOString(),
            method: req.method,
            path: req.path,
            source: 'scan_endpoint'
          })
        }
      });
    } catch (scanError) {
      console.error('Error tracking QR code scan:', scanError);
      // Don't fail the main request if scan tracking fails
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
    
    // Get actual scan and share counts from qr_code_scans table
    const qrCodesWithActualCounts = await Promise.all(
      qrCodes.map(async (qrCode) => {
        // Count actual scans (where scanData is not null and sharedata is null)
        const actualScanCount = await prisma.qRCodeScan.count({
          where: {
            qrCodeId: qrCode.id,
            AND: [
              { scanData: { not: null } },
              { sharedata: null }
            ]
          }
        });
        
        // Count actual shares (where sharedata is not null and scanData is null)
        const actualShareCount = await prisma.qRCodeScan.count({
          where: {
            qrCodeId: qrCode.id,
            AND: [
              { sharedata: { not: null } },
              { scanData: null }
            ]
          }
        });
        
        // Generate QR code images for codes that don't have them
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
            
            return { 
              ...qrCode, 
              qrCodeImage,
              scanCount: actualScanCount, // Override with actual count from database
              shareCount: actualShareCount // Override with actual count from database
            };
          } catch (error) {
            console.error(`Error generating QR code image for ${qrCode.id}:`, error);
            return {
              ...qrCode,
              scanCount: actualScanCount, // Override with actual count from database
              shareCount: actualShareCount // Override with actual count from database
            };
          }
        }
        
        return {
          ...qrCode,
          scanCount: actualScanCount, // Override with actual count from database
          shareCount: actualShareCount // Override with actual count from database
        };
      })
    );
    
    const responseData = {
      qrCodes: qrCodesWithActualCounts,
      total: qrCodesWithActualCounts.length,
      message: 'User\'s own QR codes retrieved successfully'
    };
    
    return successResponse(res, responseData);
    
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

// Generate WhatsApp QR code with short links (Client's requirement)
const generateWhatsAppQRCode = async (req, res) => {
  try {
    const { userMessage, directChatPhone, directChatMessage } = req.body;
    
    if (!userMessage || !directChatPhone || !directChatMessage) {
      return errorResponse(res, 'Missing required data: userMessage, directChatPhone, directChatMessage', 400);
    }

    // Check if user has active subscription - block QR code generation if subscription is not active
    // This check MUST happen BEFORE any database operations
    const subscriptionCheck = await checkUserSubscription(req.user.userId);
    if (!subscriptionCheck.hasActiveSubscription) {
      return errorResponse(res, `Active subscription required. ${subscriptionCheck.reason === 'Subscription expired' ? 'Subscription has expired. Please renew to continue.' : 'QR code cannot be generated without an active subscription.'}`, 403);
    }

    const appUrl = process.env.FRONTEND_URL || 'https://www.plusfive.io';

    // 1. Direct Chat short link (with /he/)
    const directChatShortCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const encodedDirectChatMsg = encodeURIComponent(directChatMessage);
    const directChatTargetUrl = `https://api.whatsapp.com/send?phone=${directChatPhone}&text=${encodedDirectChatMsg}`;

    // Store direct chat link in database
    const directChatLink = await prisma.qRCode.create({
      data: {
        userId: req.user.userId,
        name: `Direct Chat - ${directChatPhone}`,
        url: directChatTargetUrl,
        qrData: directChatShortCode,
        messageForCustomer: directChatMessage,
        directMessage: directChatMessage,
        directUrl: directChatTargetUrl,
        messageUrl: `${appUrl}/${directChatShortCode}`,
        qrCodeImage: null, // Will be generated later
      }
    });

    const directChatShortLink = `${appUrl}/${directChatShortCode}`;

    // 2. Main short link (with /he/)
    const finalMessage = `${userMessage}\n\n${directChatShortLink}`;
    const encodedFinalMessage = encodeURIComponent(finalMessage);
    const mainTargetUrl = `https://api.whatsapp.com/send?text=${encodedFinalMessage}`;

    const mainShortCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const mainLink = await prisma.qRCode.create({
      data: {
        userId: req.user.userId,
        name: `Main Message - ${req.user.userId}`,
        url: mainTargetUrl,
        qrData: mainShortCode,
        messageForCustomer: userMessage,
        directMessage: finalMessage,
        directUrl: mainTargetUrl,
        messageUrl: `${appUrl}/${mainShortCode}`,
        qrCodeImage: null, // Will be generated later
      }
    });

    const mainShortLink = `${appUrl}/${mainShortCode}`;

    // Generate QR code images for both links
    const [directChatQRImage, mainQRImage] = await Promise.all([
      QRCode.toDataURL(directChatShortLink, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        width: 200,
        color: { dark: '#000000', light: '#FFFFFF' }
      }),
      QRCode.toDataURL(mainShortLink, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        width: 200,
        color: { dark: '#000000', light: '#FFFFFF' }
      })
    ]);

    // Update both QR codes with generated images
    await Promise.all([
      prisma.qRCode.update({
        where: { id: directChatLink.id },
        data: { qrCodeImage: directChatQRImage }
      }),
      prisma.qRCode.update({
        where: { id: mainLink.id },
        data: { qrCodeImage: mainQRImage }
      })
    ]);

    return successResponse(res, {
      mainShortLink,
      directChatShortLink,
      mainLinkId: mainLink.id,
      directChatLinkId: directChatLink.id,
      mainQRImage,
      directChatQRImage,
      links: {
        main: {
          shortCode: mainShortCode,
          targetUrl: mainTargetUrl,
          shortLink: mainShortLink
        },
        directChat: {
          shortCode: directChatShortCode,
          targetUrl: directChatTargetUrl,
          shortLink: directChatShortLink
        }
      }
    }, 'WhatsApp QR codes generated successfully');

  } catch (error) {
    console.error('Generate WhatsApp QR code error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Scan QR code and increment scan count
const scanQRCode = async (req, res) => {
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
    
    // Create scan record in QRCodeScan table
    await prisma.qRCodeScan.create({
      data: {
        qrCodeId: qrCode.id,
        userId: qrCode.userId,
        referrer: req.headers.referer || null,
        userAgent: req.headers['user-agent'] || null,
        ipAddress: req.ip || req.connection.remoteAddress || null,
        scanData: `Scan via shortCode: ${shortCode}`,
        sharedata: null, // Not a share action
        scanTime: new Date()
      }
    });
    
    // Redirect to the actual WhatsApp URL
    res.redirect(qrCode.url);
    
  } catch (error) {
    console.error('QR scan error:', error);
    res.status(500).send('Internal server error');
  }
};

// Share QR code and increment share count
const shareQRCode = async (req, res) => {
  try {
    const { shortCode } = req.params;
    
    // Find QR code by short code
    const qrCode = await prisma.qRCode.findFirst({
      where: { qrData: shortCode }
    });
    
    if (!qrCode) {
      return res.status(404).send('QR Code not found');
    }
    
    // Increment share count
    await prisma.qRCode.update({
      where: { id: qrCode.id },
      data: {
        shareCount: {
          increment: 1
        }
      }
    });
    
    // Create share record in QRCodeScan table
    await prisma.qRCodeScan.create({
      data: {
        qrCodeId: qrCode.id,
        userId: qrCode.userId,
        referrer: req.headers.referer || null,
        userAgent: req.headers['user-agent'] || null,
        ipAddress: req.ip || req.connection.remoteAddress || null,
        scanData: null, // Not a scan action
        sharedata: `Share via shortCode: ${shortCode}`,
        scanTime: new Date()
      }
    });
    
    // Redirect to the actual WhatsApp URL
    res.redirect(qrCode.url);
    
  } catch (error) {
    console.error('QR share error:', error);
    res.status(500).send('Internal server error');
  }
};

module.exports = {
  getAllQRCodes,
  createQRCode,
  generateQRCodeWithUserInfo,
  getQRCodeById,
  getQRCodeByCode,
  deleteQRCode,
  serveQRCodeImage,
  incrementShareCount,
  incrementScanCount,
  getUserOwnQRCodes,
  // New analytics methods
  getQRAnalytics,
  getQRPerformance,
  getQRCodesWithAnalytics,
  generateWhatsAppQRCode,
  scanQRCode,
  shareQRCode
}; 