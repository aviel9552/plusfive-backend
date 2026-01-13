const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');

// Helper function to format Israeli phone numbers (same as webhookController)
const formatIsraeliPhone = (phoneNumber) => {
  if (!phoneNumber) return null;

  // Remove any existing country code or special characters
  let cleanPhone = phoneNumber.toString().replace(/[\s\-\(\)\+]/g, '');

  // If phone already starts with 972, just add +
  if (cleanPhone.startsWith('972')) {
    return `+${cleanPhone}`;
  }

  // If phone starts with 0, remove it and add +972
  if (cleanPhone.startsWith('0')) {
    cleanPhone = cleanPhone.substring(1);
  }

  // Add Israel country code +972
  return `+972${cleanPhone}`;
};

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
      // Customer fields (like webhook)
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
      address,
      customerFullName
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

    // If customer fields are provided, create new customer (like webhook)
    if (firstName && lastName && phoneNumber) {
      return await createAndAddNewCustomer(req, res, {
        email,
        password,
        firstName,
        lastName,
        phoneNumber,
        address,
        customerFullName,
        notes,
        rating,
        lastPayment,
        totalPaid,
        status
      });
    }

    return errorResponse(res, 'Either provide customerId for existing customer or complete customer details (firstName, lastName, phoneNumber) for new customer', 400);

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

    // Check if customer exists in Customers table
    const existingCustomer = await prisma.customers.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        customerPhone: true,
        customerFullName: true
      }
    });

    if (!existingCustomer) {
      return errorResponse(res, 'Customer not found', 404);
    }

    // Check if CustomerUser relation already exists
    const existingCustomerUser = await prisma.customerUser.findFirst({
      where: {
        customerId: customerId,
        userId: userId
      }
    });

    if (existingCustomerUser) {
      return errorResponse(res, 'Customer already exists in your customer list', 400);
    }

    // Create CustomerUser relation (like webhook does)
    const newCustomerUser = await prisma.customerUser.create({
      data: {
        customerId: customerId,
        userId: userId,
        status: status || 'active'
      }
    });

    // Create CustomerStatusLog for new customer status
    await prisma.customerStatusLog.create({
      data: {
        customerId: customerId,
        userId: userId,
        oldStatus: null,
        newStatus: status || 'active',
        reason: 'Customer added to business owner list'
      }
    });

    // Fetch customer with relation
    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    return successResponse(res, {
      ...customer,
      customerUserId: newCustomerUser.id,
      message: `Customer ${existingCustomer.firstName} ${existingCustomer.lastName} added successfully to your customer list`
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

// Helper function to create new customer (like webhook)
const createAndAddNewCustomer = async (req, res, customerData) => {
  try {
    const userId = req.user.userId;

    // Validate userId
    if (!userId) {
      return errorResponse(res, 'User ID not found. Please login again.', 400);
    }

    // Check if user exists in database
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, businessName: true }
    });

    if (!currentUser) {
      return errorResponse(res, 'User not found in database. Please login again.', 400);
    }

    // Format phone number (like webhook)
    const formattedPhone = formatIsraeliPhone(customerData.phoneNumber);

    if (!formattedPhone) {
      return errorResponse(res, 'Valid phone number is required', 400);
    }

    // Check if customer already exists by phone (like webhook)
    const existingCustomer = await prisma.customers.findFirst({
      where: {
        customerPhone: formattedPhone
      }
    });

    let customerId;

    if (existingCustomer) {
      // Customer exists, use existing customer
      customerId = existingCustomer.id;
    } else {
      // Create new customer in Customers table (like webhook)
      const fullName = customerData.customerFullName || `${customerData.firstName} ${customerData.lastName}`.trim();
      
      const newCustomer = await prisma.customers.create({
        data: {
          firstName: customerData.firstName,
          lastName: customerData.lastName,
          customerPhone: formattedPhone,
          email: customerData.email || null,
          customerFullName: fullName,
          appointmentCount: 0,
          userId: userId, // Reference to User table (business owner)
          businessName: currentUser.businessName || null
        }
      });
      customerId = newCustomer.id;
    }

    // Check if CustomerUser relation already exists
    const existingCustomerUser = await prisma.customerUser.findFirst({
      where: {
        customerId: customerId,
        userId: userId
      }
    });

    let customerUserId;

    if (existingCustomerUser) {
      customerUserId = existingCustomerUser.id;
    } else {
      // Create CustomerUser relation (like webhook)
      const newCustomerUser = await prisma.customerUser.create({
        data: {
          customerId: customerId,
          userId: userId,
          status: customerData.status || 'new'
        }
      });
      customerUserId = newCustomerUser.id;

      // Create CustomerStatusLog for new customer status
      await prisma.customerStatusLog.create({
        data: {
          customerId: customerId,
          userId: userId,
          oldStatus: null,
          newStatus: customerData.status || 'new',
          reason: 'New customer created'
        }
      });
    }

    // Fetch customer with relation
    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            businessName: true
          }
        }
      }
    });

    return successResponse(res, {
      ...customer,
      customerUserId: customerUserId,
      message: `New customer ${customerData.firstName} ${customerData.lastName} created and added successfully to your customer list`
    }, 'New customer created and added successfully', 201);

  } catch (error) {
    console.error('Create and add new customer error:', error);
    
    if (error.code === 'P2002') {
      return errorResponse(res, 'Customer with this phone number already exists', 400);
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
      customers = await prisma.customers.findMany({
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              businessName: true
            }
          },
          customerUsers: {
            where: {
              isDeleted: false
            },
            select: {
              id: true,
              status: true,
              userId: true,
              createdAt: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } else {
      // For non-admin users, show only their own customers through CustomerUser relation
      const customerUsers = await prisma.customerUser.findMany({
        where: {
          userId: userId,
          isDeleted: false
        },
        include: {
          customer: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  businessName: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Transform to match expected format
      customers = customerUsers.map(cu => ({
        ...cu.customer,
        customerUser: {
          id: cu.id,
          status: cu.status,
          userId: cu.userId,
          createdAt: cu.createdAt
        }
      }));
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
      // Customer table fields
      firstName,
      lastName,
      email,
      phoneNumber,
      customerFullName,
      address,
      // CustomerUser status
      status
    } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Check if user is authenticated
    if (!userId) {
      return errorResponse(res, 'User not authenticated. Please login again.', 401);
    }

    // Check if customer exists and belongs to user
    let customer;
    let customerUser;

    if (userRole === 'admin') {
      customer = await prisma.customers.findUnique({
        where: { id }
      });
      if (customer) {
        customerUser = await prisma.customerUser.findFirst({
          where: {
            customerId: id,
            userId: customer.userId || userId
          }
        });
      }
    } else {
      // For non-admin users, check if customer belongs to them through CustomerUser
      customerUser = await prisma.customerUser.findFirst({
        where: {
          customerId: id,
          userId: userId,
          isDeleted: false
        }
      });

      if (customerUser) {
        customer = await prisma.customers.findUnique({
          where: { id }
        });
      }
    }

    if (!customer) {
      return errorResponse(res, 'Customer not found', 404);
    }

    // Start a transaction to update both tables
    const result = await prisma.$transaction(async (tx) => {
      // Update Customers table
      const updateData = {};
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (email !== undefined) updateData.email = email;
      if (phoneNumber !== undefined) updateData.customerPhone = formatIsraeliPhone(phoneNumber);
      if (customerFullName !== undefined) updateData.customerFullName = customerFullName;

      const updatedCustomer = await tx.customers.update({
        where: { id },
        data: updateData
      });

      // Update CustomerUser status if provided
      let updatedCustomerUser = null;
      if (status && customerUser) {
        const oldStatus = customerUser.status;
        updatedCustomerUser = await tx.customerUser.update({
          where: { id: customerUser.id },
          data: { status }
        });

        // Create CustomerStatusLog for status change
        await tx.customerStatusLog.create({
          data: {
            customerId: id,
            userId: userId,
            oldStatus: oldStatus,
            newStatus: status,
            reason: 'Customer status updated'
          }
        });
      }

      return { updatedCustomer, updatedCustomerUser };
    });

    // Fetch updated data with includes
    const finalResult = await prisma.customers.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            businessName: true
          }
        },
        customerUsers: {
          where: {
            userId: userId,
            isDeleted: false
          },
          select: {
            id: true,
            status: true,
            userId: true
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

    // Check if customer exists and belongs to user
    let customer;
    let customerUser;

    if (userRole === 'admin') {
      customer = await prisma.customers.findUnique({
        where: { id }
      });
      if (customer) {
        customerUser = await prisma.customerUser.findFirst({
          where: {
            customerId: id,
            userId: customer.userId || userId
          }
        });
      }
    } else {
      // For non-admin users, check if customer belongs to them through CustomerUser
      customerUser = await prisma.customerUser.findFirst({
        where: {
          customerId: id,
          userId: userId,
          isDeleted: false
        }
      });

      if (customerUser) {
        customer = await prisma.customers.findUnique({
          where: { id }
        });
      }
    }

    if (!customer || !customerUser) {
      return errorResponse(res, 'Customer not found', 404);
    }

    // Store customer info for response
    const customerInfo = {
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email
    };

    // Soft delete CustomerUser relation (don't delete customer itself)
    await prisma.customerUser.update({
      where: { id: customerUser.id },
      data: {
        isDeleted: true,
        status: 'inactive'
      }
    });

    // Create CustomerStatusLog for deletion
    await prisma.customerStatusLog.create({
      data: {
        customerId: id,
        userId: userId,
        oldStatus: customerUser.status,
        newStatus: 'inactive',
        reason: 'Customer removed from business owner list'
      }
    });

    return successResponse(res, {
      message: `Customer ${customerInfo.firstName} ${customerInfo.lastName} removed from your customer list`,
      customerInfo: customerInfo,
      note: "Customer relation has been soft deleted. Customer data remains in the system."
    }, 'Customer removed successfully');
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
      customer = await prisma.customers.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              businessName: true
            }
          },
          customerUsers: {
            where: {
              isDeleted: false
            },
            select: {
              id: true,
              status: true,
              userId: true,
              createdAt: true
            }
          }
        }
      });
    } else {
      // For non-admin users, only their own customers through CustomerUser
      const customerUser = await prisma.customerUser.findFirst({
        where: {
          customerId: id,
          userId: userId,
          isDeleted: false
        }
      });

      if (customerUser) {
        customer = await prisma.customers.findUnique({
          where: { id },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                businessName: true
              }
            },
            customerUsers: {
              where: {
                userId: userId,
                isDeleted: false
              },
              select: {
                id: true,
                status: true,
                userId: true,
                createdAt: true
              }
            }
          }
        });
      }
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

    // Check if customer exists and belongs to user
    let customer;
    let customerUser;

    if (userRole === 'admin') {
      customer = await prisma.customers.findUnique({
        where: { id }
      });
    } else {
      // For non-admin users, check if customer belongs to them through CustomerUser
      customerUser = await prisma.customerUser.findFirst({
        where: {
          customerId: id,
          userId: userId,
          isDeleted: false
        }
      });

      if (customerUser) {
        customer = await prisma.customers.findUnique({
          where: { id }
        });
      }
    }

    if (!customer) {
      return errorResponse(res, 'Customer not found', 404);
    }

    // Update customer visit information (increment appointmentCount)
    const updatedCustomer = await prisma.customers.update({
      where: { id },
      data: {
        appointmentCount: {
          increment: 1
        }
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            businessName: true
          }
        },
        customerUsers: {
          where: {
            userId: userId,
            isDeleted: false
          },
          select: {
            id: true,
            status: true,
            userId: true
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

module.exports = {
  addCustomer,
  getMyCustomers,
  updateCustomer,
  removeCustomer,
  getCustomerById,
  recordCustomerVisit
};
