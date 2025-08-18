const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');

// Create referral when user registers with referral code
const createReferral = async (req, res) => {
  try {
    const { referrerCode, referredUserId } = req.body;

    if (!referrerCode || !referredUserId) {
      return errorResponse(res, 'Referrer code and referred user ID are required', 400);
    }

    // Find referrer by referral code from user table
    const referrer = await prisma.user.findUnique({
      where: { referralCode: referrerCode }
    });

    if (!referrer) {
      return errorResponse(res, 'Invalid referral code', 400);
    }

    // Check if referral already exists
    const existingReferral = await prisma.referral.findFirst({
      where: {
        referrerId: referrer.id,
        referredUserId: referredUserId
      }
    });

    if (existingReferral) {
      return errorResponse(res, 'Referral already exists', 400);
    }

    // Create referral with both IDs
    const referral = await prisma.referral.create({
      data: {
        referrerId: referrer.id,        // ID from user table based on referrerCode
        referredUserId: referredUserId, // ID of newly registered user
        status: 'pending',
        commission: 0
      },
      include: {
        referrer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            referralCode: true
          }
        },
        referredUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    return successResponse(res, referral, 'Referral created successfully', 201);
  } catch (error) {
    console.error('Create referral error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Get user's referral statistics
const getReferralStats = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get referrals given by user
    const referralsGiven = await prisma.referral.findMany({
      where: { referrerId: userId },
      include: {
        referredUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            createdAt: true
          }
        }
      },
      orderBy: { date: 'desc' }
    });

    // Get total commission earned
    const totalCommission = referralsGiven.reduce((sum, ref) => sum + ref.commission, 0);

    // Get pending referrals
    const pendingReferrals = referralsGiven.filter(ref => ref.status === 'pending').length;
    const activeReferrals = referralsGiven.filter(ref => ref.status === 'active').length;

    const stats = {
      totalReferrals: referralsGiven.length,
      pendingReferrals,
      activeReferrals,
      totalCommission,
      referrals: referralsGiven
    };

    return successResponse(res, stats, 'Referral statistics retrieved successfully');
  } catch (error) {
    console.error('Get referral stats error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Get current user's referrals (user can see their own referrals)
const getUserReferrals = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get referrals given by current user
    const referralsGiven = await prisma.referral.findMany({
      where: { referrerId: userId },
      select: {
        id: true,
        status: true,
        commission: true,
        date: true,
        referredUser: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      },
      orderBy: { date: 'desc' }
    });

    // Get referrals received by current user (if any)
    const referralsReceived = await prisma.referral.findMany({
      where: { referredUserId: userId },
      select: {
        id: true,
        status: true,
        commission: true,
        date: true,
        referrer: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      },
      orderBy: { date: 'desc' }
    });

    // Flatten the data structure and combine both arrays
    const flattenedReferralsGiven = referralsGiven.map(ref => ({
      id: ref.id,
      status: ref.status,
      commission: ref.commission,
      date: ref.date,
      firstName: ref.referredUser.firstName,
      lastName: ref.referredUser.lastName,
      email: ref.referredUser.email
    }));

    const flattenedReferralsReceived = referralsReceived.map(ref => ({
      id: ref.id,
      status: ref.status,
      commission: ref.commission,
      date: ref.date,
      firstName: ref.referrer.firstName,
      lastName: ref.referrer.lastName,
      email: ref.referrer.email
    }));

    // Return simple array with all referrals
    const allReferrals = [...flattenedReferralsGiven, ...flattenedReferralsReceived];

    return successResponse(res, allReferrals, 'User referrals retrieved successfully');
  } catch (error) {
    console.error('Get user referrals error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Get all referrals (admin only)
const getAllReferrals = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return errorResponse(res, 'Admin access required', 403);
    }

    const referrals = await prisma.referral.findMany({
      include: {
        referrer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            referralCode: true
          }
        },
        referredUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      },
      orderBy: { date: 'desc' }
    });

    // Flatten the data structure for admin
    const flattenedReferrals = referrals.map(referral => ({
      id: referral.id,
      status: referral.status,
      commission: referral.commission,
      date: referral.date,
      referrerId: referral.referrerId,
      referredUserId: referral.referredUserId,
      // Referrer details
      referrerId: referral.referrer.id,
      referrerFirstName: referral.referrer.firstName,
      referrerLastName: referral.referrer.lastName,
      referrerEmail: referral.referrer.email,
      referrerCode: referral.referrer.referralCode,
      // Referred user details
      referredUserId: referral.referredUser.id,
      referredFirstName: referral.referredUser.firstName,
      referredLastName: referral.referredUser.lastName,
      referredEmail: referral.referredUser.email
    }));

    return successResponse(res, flattenedReferrals, 'All referrals retrieved successfully');
  } catch (error) {
    console.error('Get all referrals error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Update referral status (admin only)
const updateReferralStatus = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return errorResponse(res, 'Admin access required', 403);
    }

    const { id } = req.params;
    const { status, commission } = req.body;

    if (!status || !['pending', 'active', 'cancelled'].includes(status)) {
      return errorResponse(res, 'Valid status required: pending, active, or cancelled', 400);
    }

    const referral = await prisma.referral.update({
      where: { id },
      data: {
        status,
        ...(commission !== undefined && { commission: parseFloat(commission) })
      },
      include: {
        referrer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        referredUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    return successResponse(res, referral, 'Referral status updated successfully');
  } catch (error) {
    console.error('Update referral status error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Get referral by ID
const getReferralById = async (req, res) => {
  try {
    const { id } = req.params;

    const referral = await prisma.referral.findUnique({
      where: { id },
      include: {
        referrer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            referralCode: true
          }
        },
        referredUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (!referral) {
      return errorResponse(res, 'Referral not found', 404);
    }

    return successResponse(res, referral, 'Referral retrieved successfully');
  } catch (error) {
    console.error('Get referral by ID error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

module.exports = {
  createReferral,
  getReferralStats,
  getUserReferrals,
  getAllReferrals,
  updateReferralStatus,
  getReferralById
};
