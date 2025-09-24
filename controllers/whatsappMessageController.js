const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const { stripe } = require('../lib/stripe');

// Create WhatsApp message record for usage tracking
async function createWhatsappMessageRecord(customerName, phoneNumber, messageType, userId = null) {
    try {
        // Find customer by phone number only (more reliable)
        const customer = await prisma.customers.findFirst({
            where: {
                customerPhone: phoneNumber
            },
            select: {
                id: true,
                userId: true,
                customerFullName: true
            }
        });

        if (!customer) {
            return null;
        }

        // Use provided userId or get from customer data
        const businessUserId = userId || customer.userId;

        if (!businessUserId) {
            return null;
        }

        // First, update customer status in CustomerUser table (only for at_risk, lost, recovered)
        let customerStatusUpdate = null;
        if (messageType === 'at_risk' || messageType === 'lost' || messageType === 'recovered') {
            customerStatusUpdate = await prisma.customerUser.updateMany({
                where: {
                    customerId: customer.id,
                    userId: businessUserId
                },
                data: {
                    status: messageType, // at_risk, lost, recovered
                    updatedAt: new Date()
                }
            });
        }



        // Create whatsappMessage record
        const whatsappMessage = await prisma.whatsappMessage.create({
            data: {
                messageType: messageType, // at_risk, lost, recovered, review_*
                messageDate: new Date(),
                billStatus: false,
                billDate: null,
                customerId: customer.id,
                userId: businessUserId
            }
        });

        // Report usage to Stripe immediately after database record creation
        await reportUsageToStripe(businessUserId);

        return whatsappMessage;
    } catch (error) {
        console.error('Error creating whatsappMessage record:', error);
        throw error;
    }
}

// Get all WhatsApp messages with filters
async function getAllWhatsappMessages(req, res) {
    try {
        // Always take userId from req.user (set by auth middleware)
        const userId = req.user.userId;

        if (!userId) {
            return errorResponse(res, 'User not authenticated', 401);
        }

        // Build where clause
        const whereClause = { userId };

        // Get all data with relations
        const data = await prisma.whatsappMessage.findMany({
            where: whereClause,
            include: {
                customer: {
                    select: {
                        id: true,
                        customerFullName: true,
                        customerPhone: true,
                        businessName: true,
                    },
                },
                user: {
                    select: {
                        id: true,
                        businessName: true,
                        email: true,
                    },
                },
            },
            orderBy: {
                messageDate: 'desc',
            },
        });

        // Calculate counts
        const availablePaymentCount = data.filter(item => 
            item.billStatus === false && item.billDate === null
        ).length;

        const paidPaymentCount = data.filter(item => 
            item.billStatus === true && item.billDate !== null
        ).length;

        return successResponse(res, { 
            data, 
            availablePaymentCount, 
            paidPaymentCount 
        }, 'WhatsApp messages Data retrieved successfully');
    } catch (error) {
        console.error('Error in getAllWhatsappMessages:', error);
        return errorResponse(res, 'Failed to retrieve WhatsApp messages Data', error.message);
    }
}

// Report usage to Stripe for metered billing
async function reportUsageToStripe(userId) {
    try {
        // Get user with Stripe subscription
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { 
                id: true, 
                email: true, 
                stripeSubscriptionId: true 
            }
        });

        if (!user || !user.stripeSubscriptionId) {
            return;
        }
        
        // Get subscription from Stripe
        const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        
        // Find the metered subscription item (WhatsApp messages)
        const meteredItem = subscription.items.data.find(item => 
            item.price?.recurring?.usage_type === 'metered'
        );

        if (!meteredItem) {
            return;
        }

        // Report 1 usage to Stripe
        const usageRecord = await stripe.subscriptionItems.createUsageRecord(
            meteredItem.id,
            {
                quantity: 1,
                timestamp: Math.floor(Date.now() / 1000),
                action: 'increment' // Add 1 to existing usage
            }
        );

    } catch (error) {
        console.error('❌ Error reporting usage to Stripe:', error.message);
        // Don't throw error - database record was created successfully
    }
}

// ✅ Stripe usage reporting for metered billing (Stripe v17+)
async function reportUsageToStripe1(req, res) {
    try {
      const { userId } = req.body;
    //   console.log('🧪 userId:', userId);
    //   console.log('🧪 stripe keys:', Object.keys(stripe));
    //   console.log('🧪 stripe.meterEvents:', stripe.meterEvents);
      
  
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "userId is required in body"
        });
      }
  
      // Fetch user from DB
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          stripeSubscriptionId: true
        }
      });
  
      if (!user || !user.stripeSubscriptionId) {
        return res.status(404).json({
          success: false,
          message: `No Stripe subscription found for user ${userId}`
        });
      }
  
      // Get subscription from Stripe
      const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
  
      // Find metered item
      const meteredItem = subscription.items.data.find(
        item => item.price?.recurring?.usage_type === 'metered'
      );
  
      if (!meteredItem) {
        return res.status(400).json({
          success: false,
          message: `No metered subscription item found for user ${user.email}`
        });
      }
  
      // ✅ Correct usage record creation (Stripe v17+)
    //   const usageRecord = await stripe.meterEvents.create({
    //     customer: subscription.customer,
    //     timestamp: Math.floor(Date.now() / 1000),
    //     meter_event_type: 'whatsapp_message', // 👈 Define this in Stripe dashboard
    //     quantity: 1
    //   });
    const usageRecord = await stripe.request({
        method: 'POST',
        path: '/v1/billing/meter_events',
        body: {
          customer: subscription.customer,
          timestamp: Math.floor(Date.now() / 1000),
          meter_event_type: 'whatsapp_message',
          quantity: 1
        }
      });
  
      return res.json({
        success: true,
        message: `Usage reported for user ${user.email}`,
        usageRecord
      });
  
    } catch (error) {
      console.error('❌ Error reporting usage to Stripe:', error);
      return res.status(500).json({
        success: false,
        message: "Failed to report usage",
        error: error.message
      });
    }
  }

module.exports = {
    getAllWhatsappMessages,
    createWhatsappMessageRecord,
    reportUsageToStripe1,
};
