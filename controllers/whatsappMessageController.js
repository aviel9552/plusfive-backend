const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');

// Create WhatsApp message record for usage tracking
async function createWhatsappMessageRecord(customerName, phoneNumber, messageType, userId = null) {
    try {
        // Find customer by name and phone number
        const customer = await prisma.customers.findFirst({
            where: {
                customerFullName: customerName,
                customerPhone: phoneNumber
            },
            select: {
                id: true,
                userId: true
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

        // First, update customer status in CustomerUser table
        const customerStatusUpdate = await prisma.customerUser.updateMany({
            where: {
                customerId: customer.id,
                userId: businessUserId
            },
            data: {
                status: messageType, // at_risk, lost, recovered, review_*
                updatedAt: new Date()
            }
        });



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

module.exports = {
    getAllWhatsappMessages,
    createWhatsappMessageRecord,
};
