const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');

// Add new customer to business owner's list
const addCustomer = async (req, res) => {
  try {
    const { 
      customerId, 
      notes, 
      rating, 
      lastPayment, 
      totalPaid, 
      status,
      // Auth registration fields
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
      businessName,
      businessType,
      address,
      whatsappNumber,
      directChatMessage
    } = req.body;
    
    const userId = req.user.userId;

    // Check if user is authenticated (any role can add customers)
    if (!userId) {
      return errorResponse(res, 'User not authenticated. Please login again.', 401);
    }

    // If customerId is provided, add existing customer
    if (customerId) {
      return await addExistingCustomer(req, res, customerId, notes, rating, lastPayment, totalPaid, status);
    }

    // If auth fields are provided, create new customer user first
    if (email && password && firstName && lastName) {
      return await createAndAddNewCustomer(req, res, {
        email,
        password,
        firstName,
        lastName,
        phoneNumber,
        businessName,
        businessType,
        address,
        whatsappNumber,
        directChatMessage,
        notes,
        rating,
        lastPayment,
        totalPaid,
        status
      });
    }

    return errorResponse(res, 'Either provide customerId for existing customer or complete customer details for new customer', 400);

  } catch (error) {
    console.error('Add customer error:', error);
    return errorResponse(res, 'Failed to add customer. Please try again.', 500);
  }
};

// Helper function to add existing customer
const addExistingCustomer = async (req, res, customerId, notes, rating, lastPayment, totalPaid, status) => {
  try {
    const userId = req.user.userId;

    // Validate required fields
    if (!customerId) {
      return errorResponse(res, 'Customer ID is required', 400);
    }

    // Validate rating range
    if (rating && (rating < 0 || rating > 5)) {
      return errorResponse(res, 'Rating must be between 0 and 5', 400);
    }

    // Validate payment amounts
    if (lastPayment && lastPayment < 0) {
      return errorResponse(res, 'Last payment amount cannot be negative', 400);
    }

    if (totalPaid && totalPaid < 0) {
      return errorResponse(res, 'Total paid amount cannot be negative', 400);
    }

    // Check if customer exists and has role 'customer'
    const customer = await prisma.user.findFirst({
      where: {
        id: customerId,
        role: 'customer'
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        businessName: true
      }
    });

    if (!customer) {
      return errorResponse(res, 'Customer not found or invalid role. User must have role "customer"', 404);
    }

    // Check if customer is already added to this user
    const existingCustomer = await prisma.customerMaster.findFirst({
      where: {
        userId,
        customerId
      }
    });

    if (existingCustomer) {
      return errorResponse(res, 'Customer already exists in your customer list', 400);
    }

    // Check if user is trying to add themselves
    if (userId === customerId) {
      return errorResponse(res, 'You cannot add yourself as a customer', 400);
    }

    // Prepare customer data with defaults
    const customerData = {
      userId,
      customerId,
      notes: notes || null,
      status: status || 'active',
      rating: rating ? parseFloat(rating) : null,
      lastPayment: lastPayment ? parseFloat(lastPayment) : null,
      totalPaid: totalPaid ? parseFloat(totalPaid) : null,
      totalVisits: 0,
      totalSpent: 0.00
    };

    // Add customer to user's list
    const newCustomer = await prisma.customerMaster.create({
      data: customerData,
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
            businessName: true
          }
        }
      }
    });


    return successResponse(res, {
      ...newCustomer,
      message: `Customer ${customer.firstName} ${customer.lastName} added successfully to your customer list`
    }, 'Customer added successfully', 201);

  } catch (error) {
    console.error('Add existing customer error:', error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2002') {
      return errorResponse(res, 'Customer already exists in your list', 400);
    }
    
    if (error.code === 'P2003') {
      return errorResponse(res, 'Invalid customer ID provided', 400);
    }

    return errorResponse(res, 'Failed to add customer. Please try again.', 500);
  }
};

// Helper function to create new customer user and add to business owner
const createAndAddNewCustomer = async (req, res, customerData) => {
  try {
    const userId = req.user.userId;
    const bcrypt = require('bcryptjs');

    // Validate userId
    if (!userId) {
      return errorResponse(res, 'User ID not found. Please login again.', 400);
    }

    // Check if user exists in database
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true }
    });

    if (!currentUser) {
      return errorResponse(res, 'User not found in database. Please login again.', 400);
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: customerData.email }
    });

    if (existingUser) {
      return errorResponse(res, 'User with this email already exists', 400);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(customerData.password, 12);

    // Create new customer user
    const newCustomerUser = await prisma.user.create({
      data: {
        email: customerData.email,
        password: hashedPassword,
        firstName: customerData.firstName,
        lastName: customerData.lastName,
        phoneNumber: customerData.phoneNumber || null,
        businessName: customerData.businessName || null,
        businessType: customerData.businessType || null,
        address: customerData.address || null,
        whatsappNumber: customerData.whatsappNumber || null,
        directChatMessage: customerData.directChatMessage || null,
        role: 'customer',
        emailVerified: new Date() // Auto-verify for business-added customers
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phoneNumber: true,
        businessName: true
      }
    });

    // Now add to current user's customer list
    const customerMasterData = {
      userId: userId,
      customerId: newCustomerUser.id,
      notes: customerData.notes || null,
      status: customerData.status || 'active',
      rating: customerData.rating ? parseFloat(customerData.rating) : null,
      lastPayment: customerData.lastPayment ? parseFloat(customerData.lastPayment) : null,
      totalPaid: customerData.totalPaid ? parseFloat(customerData.totalPaid) : null,
      totalVisits: 0,
      totalSpent: 0.00
    };

    const newCustomerMaster = await prisma.customerMaster.create({
      data: customerMasterData,
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
            businessName: true
          }
        }
      }
    });

    return successResponse(res, {
      ...newCustomerMaster,
      message: `New customer ${newCustomerUser.firstName} ${newCustomerUser.lastName} created and added successfully to your customer list`
    }, 'New customer created and added successfully', 201);

  } catch (error) {
    console.error('Create and add new customer error:', error);
    
    if (error.code === 'P2002') {
      return errorResponse(res, 'User with this email already exists', 400);
    }

    if (error.code === 'P2003') {
      console.error('Foreign key constraint details:', error.meta);
      return errorResponse(res, 'Foreign key constraint failed. Please check if user exists.', 400);
    }

    return errorResponse(res, 'Failed to create and add customer. Please try again.', 500);
  }
};

// Get all customers of current business owner
const getMyCustomers = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Check if user is authenticated
    if (!userId) {
      return errorResponse(res, 'User not authenticated. Please login again.', 401);
    }

    let customers;

    // If admin, show all customers from all users
    if (userRole === 'admin') {
      customers = await prisma.customerMaster.findMany({
        include: {
          customer: {
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
              directChatMessage: true,
              role: true,
              createdAt: true,
              updatedAt: true
            }
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } else {
      // For non-admin users, show only their own customers with complete details
      customers = await prisma.customerMaster.findMany({
        where: { userId },
        include: {
          customer: {
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
              directChatMessage: true,
              role: true,
              createdAt: true,
              updatedAt: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    return successResponse(res, customers, 'Customers retrieved successfully');
  } catch (error) {
    console.error('Get customers error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Update customer information
const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      notes, 
      status, 
      rating, 
      lastPayment, 
      totalPaid,
      // User table fields
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
      businessName,
      businessType,
      address,
      whatsappNumber,
      directChatMessage
    } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Check if user is authenticated
    if (!userId) {
      return errorResponse(res, 'User not authenticated. Please login again.', 401);
    }

    let existingCustomer;

    // If admin, can update any customer
    if (userRole === 'admin') {
      existingCustomer = await prisma.customerMaster.findUnique({
        where: { id },
        include: {
          customer: true
        }
      });
    } else {
      // For non-admin users, check if customer belongs to them
      existingCustomer = await prisma.customerMaster.findFirst({
        where: {
          id,
          userId
        },
        include: {
          customer: true
        }
      });
    }

    if (!existingCustomer) {
      return errorResponse(res, 'Customer not found', 404);
    }

    // Start a transaction to update both tables
    const result = await prisma.$transaction(async (tx) => {
      // Update CustomerMaster table
      const updatedCustomerMaster = await tx.customerMaster.update({
        where: { id },
        data: {
          notes,
          status,
          rating: rating ? parseFloat(rating) : rating,
          lastPayment: lastPayment ? parseFloat(lastPayment) : lastPayment,
          totalPaid: totalPaid ? parseFloat(totalPaid) : totalPaid
        }
      });

      // Update User table if user fields are provided
      let updatedUser = null;
      if (email || password || firstName || lastName || phoneNumber || businessName || businessType || address || whatsappNumber || directChatMessage) {
        const userUpdateData = {};
        
        if (email) userUpdateData.email = email;
        if (firstName) userUpdateData.firstName = firstName;
        if (lastName) userUpdateData.lastName = lastName;
        if (phoneNumber !== undefined) userUpdateData.phoneNumber = formatPhoneNumber(phoneNumber);
        if (businessName !== undefined) userUpdateData.businessName = businessName;
        if (businessType !== undefined) userUpdateData.businessType = businessType;
        if (address !== undefined) userUpdateData.address = address;
        if (whatsappNumber !== undefined) userUpdateData.whatsappNumber = whatsappNumber;
        if (directChatMessage !== undefined) userUpdateData.directChatMessage = directChatMessage;

        // Hash password if provided
        if (password) {
          const bcrypt = require('bcryptjs');
          userUpdateData.password = await bcrypt.hash(password, 12);
        }

        updatedUser = await tx.user.update({
          where: { id: existingCustomer.customerId },
          data: userUpdateData
        });
      }

      return { updatedCustomerMaster, updatedUser };
    });

    // Fetch updated data with includes
    const finalResult = await prisma.customerMaster.findUnique({
      where: { id },
      include: {
        customer: {
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
            directChatMessage: true
          }
        }
      }
    });

    return successResponse(res, finalResult, 'Customer updated successfully');
  } catch (error) {
    console.error('Update customer error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Remove customer from business owner's list
const removeCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Check if user is authenticated
    if (!userId) {
      return errorResponse(res, 'User not authenticated. Please login again.', 401);
    }

    let existingCustomer;

    // If admin, can remove any customer
    if (userRole === 'admin') {
      existingCustomer = await prisma.customerMaster.findUnique({
        where: { id },
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });
    } else {
      // For non-admin users, check if customer belongs to them
      existingCustomer = await prisma.customerMaster.findFirst({
        where: {
          id,
          userId
        },
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });
    }

    if (!existingCustomer) {
      return errorResponse(res, 'Customer not found', 404);
    }

    // Store customer info for response
    const customerInfo = {
      firstName: existingCustomer.customer.firstName,
      lastName: existingCustomer.customer.lastName,
      email: existingCustomer.customer.email
    };

    // Start transaction to delete from both tables
    await prisma.$transaction(async (tx) => {
      // First, delete from CustomerMaster table
      await tx.customerMaster.delete({
        where: { id }
      });

      // Then, delete the customer user from User table
      await tx.user.delete({
        where: { id: existingCustomer.customerId }
      });
    });

    return successResponse(res, {
      message: `Customer ${customerInfo.firstName} ${customerInfo.lastName} completely removed from the system`,
      customerInfo: customerInfo,
      note: "Customer user account has been permanently deleted from both CustomerMaster and User tables"
    }, 'Customer completely removed successfully');
  } catch (error) {
    console.error('Remove customer error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Get customer by ID
const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Check if user is authenticated
    if (!userId) {
      return errorResponse(res, 'User not authenticated. Please login again.', 401);
    }

    let customer;

    // If admin, can view any customer
    if (userRole === 'admin') {
      customer = await prisma.customerMaster.findUnique({
        where: { id },
        include: {
          customer: {
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
              directChatMessage: true,
              role: true,
              createdAt: true,
              updatedAt: true
            }
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true
            }
          }
        }
      });
    } else {
      // For non-admin users, only their own customers
      customer = await prisma.customerMaster.findFirst({
        where: {
          id,
          userId
        },
        include: {
          customer: {
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
              directChatMessage: true,
              role: true,
              createdAt: true,
              updatedAt: true
            }
          }
        }
      });
    }

    if (!customer) {
      return errorResponse(res, 'Customer not found', 404);
    }

    return successResponse(res, customer, 'Customer details retrieved successfully');
  } catch (error) {
    console.error('Get customer by ID error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Record customer visit
const recordCustomerVisit = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, notes } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Check if user is authenticated
    if (!userId) {
      return errorResponse(res, 'User not authenticated. Please login again.', 401);
    }

    let existingCustomer;

    // If admin, can record visit for any customer
    if (userRole === 'admin') {
      existingCustomer = await prisma.customerMaster.findUnique({
        where: { id }
      });
    } else {
      // For non-admin users, check if customer belongs to them
      existingCustomer = await prisma.customerMaster.findFirst({
        where: {
          id,
          userId
        }
      });
    }

    if (!existingCustomer) {
      return errorResponse(res, 'Customer not found', 404);
    }

    // Update customer visit information
    const updatedCustomer = await prisma.customerMaster.update({
      where: { id },
      data: {
        totalVisits: {
          increment: 1
        },
        lastVisit: new Date(),
        totalSpent: {
          increment: amount || 0
        },
        notes: notes ? `${existingCustomer.notes || ''}\n${new Date().toLocaleDateString()}: ${notes}`.trim() : existingCustomer.notes
      },
      include: {
        customer: {
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
            directChatMessage: true,
            role: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });

    return successResponse(res, updatedCustomer, 'Customer visit recorded successfully');
  } catch (error) {
    console.error('Record customer visit error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Helper function to format phone number
const formatPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return phoneNumber;
  
  // Remove all non-digit characters
  let cleanNumber = phoneNumber.replace(/\D/g, '');
  
  // If number starts with 0, remove it
  if (cleanNumber.startsWith('0')) {
    cleanNumber = cleanNumber.substring(1);
  }
  
  // Add +972 prefix
  return `+972${cleanNumber}`;
};

module.exports = {
  addCustomer,
  getMyCustomers,
  updateCustomer,
  removeCustomer,
  getCustomerById,
  recordCustomerVisit
};
