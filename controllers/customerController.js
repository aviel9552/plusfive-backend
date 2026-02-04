const prisma = require('../lib/prisma');
const { successResponse, errorResponse } = require('../lib/utils');
const { constants } = require('../config');
const { uploadImage, deleteImage, extractPublicId } = require('../lib/cloudinary');

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
      city,
      isActive,
      customerFullName,
      birthdate
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
        city,
        isActive,
        customerFullName,
        birthdate,
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
        status: status || constants.CUSTOMER_STATUS.ACTIVE,
        isActive: true // Default to active when adding customer
      }
    });

    // Create CustomerStatusLog for new customer status
    await prisma.customerStatusLog.create({
      data: {
        customerId: customerId,
        userId: userId,
        oldStatus: null,
        newStatus: status || constants.CUSTOMER_STATUS.ACTIVE,
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
      
      // Parse birthdate if provided
      let birthdateValue = null;
      if (customerData.birthdate) {
        birthdateValue = customerData.birthdate instanceof Date 
          ? customerData.birthdate 
          : new Date(customerData.birthdate);
        // Validate date
        if (isNaN(birthdateValue.getTime())) {
          birthdateValue = null;
        }
      }
      
      const newCustomer = await prisma.customers.create({
        data: {
          firstName: customerData.firstName,
          lastName: customerData.lastName,
          customerPhone: formattedPhone,
          email: customerData.email || null,
          customerFullName: fullName,
          address: customerData.address || null,
          city: customerData.city || null,
          birthdate: birthdateValue,
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
      // Map isActive: if customerData.isActive is provided, use it; otherwise default to true
      const isActiveValue = customerData.isActive !== undefined ? customerData.isActive : true;
      const newCustomerUser = await prisma.customerUser.create({
        data: {
          customerId: customerId,
          userId: userId,
          status: customerData.status || 'new',
          isActive: isActiveValue
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
    if (userRole === constants.ROLES.ADMIN) {
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
      city,
      isActive,
      profileImage,
      coverImage,
      documentImage,
      birthdate,
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

    if (userRole === constants.ROLES.ADMIN) {
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

    // Handle profileImage upload if file is present
    let profileImageUrl = customer.profileImage; // Keep existing image by default
    let shouldUpdateProfileImage = false;
    
    console.log('Update customer - req.file:', req.file ? 'File present' : 'No file');
    console.log('Update customer - profileImage from body:', profileImage);
    
    if (req.file) {
      try {
        // Delete old image from Cloudinary if it exists
        if (customer.profileImage) {
          const oldPublicId = extractPublicId(customer.profileImage);
          if (oldPublicId) {
            try {
              await deleteImage(oldPublicId);
              console.log('Old profile image deleted from Cloudinary');
            } catch (deleteError) {
              console.error('Error deleting old profile image:', deleteError);
              // Continue even if deletion fails
            }
          }
        }

        // Upload new image to Cloudinary
        const uploadResult = await uploadImage(req.file.buffer, constants.CLOUDINARY_FOLDERS.CUSTOMER);
        profileImageUrl = uploadResult.secure_url;
        shouldUpdateProfileImage = true;
        console.log('Profile image uploaded successfully to Cloudinary:', profileImageUrl);
      } catch (uploadError) {
        console.error('Profile image upload error:', uploadError);
        return errorResponse(res, 'Failed to upload profile image', 500);
      }
    } else if (profileImage !== undefined && profileImage !== null && profileImage !== '') {
      // Check if profileImage is a base64 string
      if (typeof profileImage === 'string' && profileImage.startsWith('data:image/')) {
        try {
          // Extract base64 data
          const base64Data = profileImage.split(',')[1];
          const imageBuffer = Buffer.from(base64Data, 'base64');
          
          // Delete old image from Cloudinary if it exists
          if (customer.profileImage) {
            const oldPublicId = extractPublicId(customer.profileImage);
            if (oldPublicId) {
              try {
                await deleteImage(oldPublicId);
                console.log('Old profile image deleted from Cloudinary');
              } catch (deleteError) {
                console.error('Error deleting old profile image:', deleteError);
              }
            }
          }
          
          // Upload base64 image to Cloudinary
          const uploadResult = await uploadImage(imageBuffer, constants.CLOUDINARY_FOLDERS.CUSTOMER);
          profileImageUrl = uploadResult.secure_url;
          shouldUpdateProfileImage = true;
          console.log('Base64 profile image uploaded successfully to Cloudinary:', profileImageUrl);
        } catch (uploadError) {
          console.error('Base64 profile image upload error:', uploadError);
          return errorResponse(res, 'Failed to upload profile image from base64', 500);
        }
      } else {
        // If profileImage is provided as a URL string (not a file), use it
        profileImageUrl = profileImage;
        shouldUpdateProfileImage = true;
        console.log('Using profileImage URL from request:', profileImageUrl);
      }
    } else if (profileImage === null || profileImage === '') {
      // Explicitly set to null/empty if provided
      profileImageUrl = null;
      shouldUpdateProfileImage = true;
      console.log('Profile image set to null');
    }

    // Start a transaction to update both tables
    const result = await prisma.$transaction(async (tx) => {
      // Update Customers table
      const updateData = {};
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (email !== undefined) updateData.email = email;
      if (phoneNumber !== undefined) updateData.customerPhone = formatIsraeliPhone(phoneNumber);
      
      // Automatically update customerFullName if firstName or lastName is being updated
      // Use the new values if provided, otherwise use existing values from database
      const finalFirstName = firstName !== undefined ? firstName : customer.firstName;
      const finalLastName = lastName !== undefined ? lastName : customer.lastName;
      
      // If firstName or lastName is being updated, automatically construct customerFullName
      if (firstName !== undefined || lastName !== undefined) {
        const constructedFullName = `${finalFirstName || ''} ${finalLastName || ''}`.trim();
        updateData.customerFullName = constructedFullName || null;
      } else if (customerFullName !== undefined) {
        // Only use customerFullName from request if firstName/lastName are not being updated
        updateData.customerFullName = customerFullName;
      }
      
      if (address !== undefined) updateData.address = address;
      if (city !== undefined) updateData.city = city;
      
      // Handle birthdate update
      if (birthdate !== undefined) {
        if (birthdate === null || birthdate === '') {
          updateData.birthdate = null;
        } else {
          // Parse birthdate - handle both Date objects and ISO strings
          const birthdateValue = birthdate instanceof Date 
            ? birthdate 
            : new Date(birthdate);
          // Validate date
          if (!isNaN(birthdateValue.getTime())) {
            updateData.birthdate = birthdateValue;
          }
        }
      }
      
      // Only update profileImage if a file was uploaded or explicitly provided
      if (shouldUpdateProfileImage) {
        updateData.profileImage = profileImageUrl;
      }
      if (coverImage !== undefined) updateData.coverImage = coverImage;
      if (documentImage !== undefined) updateData.documentImage = documentImage;

      const updatedCustomer = await tx.customers.update({
        where: { id },
        data: updateData
      });

      // Update CustomerUser isActive field (moved from Customers table)
      let updatedCustomerUser = null;
      if (customerUser) {
        const customerUserUpdateData = {};
        
        // Handle isActive: if provided directly, use it; otherwise map from status
        // Convert string booleans to actual booleans (FormData sends everything as strings)
        if (isActive !== undefined) {
          // Handle string booleans from FormData
          if (typeof isActive === 'string') {
            customerUserUpdateData.isActive = isActive === 'true' || isActive === '1';
          } else {
            customerUserUpdateData.isActive = Boolean(isActive);
          }
        } else if (status !== undefined) {
          // Map status to isActive: "active" or "פעיל" = true, "חסום" or "לא פעיל" or "inactive" = false
          const statusLower = typeof status === 'string' ? status.toLowerCase() : String(status).toLowerCase();
          if (statusLower === constants.STATUS.ACTIVE || statusLower === 'פעיל') {
            customerUserUpdateData.isActive = true;
          } else if (statusLower === 'חסום' || statusLower === 'לא פעיל' || statusLower === constants.STATUS.INACTIVE || statusLower === 'blocked') {
            customerUserUpdateData.isActive = false;
          }
        }
        
        // Only update if there's data to update
        if (Object.keys(customerUserUpdateData).length > 0) {
          updatedCustomerUser = await tx.customerUser.update({
            where: { id: customerUser.id },
            data: customerUserUpdateData
          });
        } else {
          updatedCustomerUser = customerUser;
        }
      } else if (isActive !== undefined || status !== undefined) {
        // If customerUser doesn't exist but isActive/status is provided, create it
        // This handles edge cases where CustomerUser relation might be missing
        const isActiveValue = isActive !== undefined 
          ? (typeof isActive === 'string' ? isActive === 'true' || isActive === '1' : Boolean(isActive))
          : (status !== undefined 
            ? (() => {
                const statusLower = typeof status === 'string' ? status.toLowerCase() : String(status).toLowerCase();
                return statusLower === constants.STATUS.ACTIVE || statusLower === 'פעיל';
              })()
            : true);
        
        updatedCustomerUser = await tx.customerUser.create({
          data: {
            customerId: id,
            userId: userId,
            status: status || constants.CUSTOMER_STATUS.ACTIVE,
            isActive: isActiveValue
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
            isActive: true,
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

    // First, check if customer exists
    customer = await prisma.customers.findUnique({
      where: { id }
    });

    if (!customer) {
      return errorResponse(res, 'Customer not found', 404);
    }

    if (userRole === constants.ROLES.ADMIN) {
      // Admin can delete any customer
      // Try to find customerUser relation, but it's optional for admin
      customerUser = await prisma.customerUser.findFirst({
        where: {
          customerId: id,
          userId: customer.userId || userId
        }
      });
    } else {
      // For non-admin users, check if customer belongs to them
      // First check if customer is directly owned by user (userId matches)
      if (customer.userId === userId) {
        // Customer is directly owned, try to find customerUser relation (optional)
        customerUser = await prisma.customerUser.findFirst({
          where: {
            customerId: id,
            userId: userId,
            isDeleted: false
          }
        });
        // If no customerUser relation exists, that's okay - customer is directly owned
      } else {
        // Customer is not directly owned, check if there's a customerUser relation
        customerUser = await prisma.customerUser.findFirst({
          where: {
            customerId: id,
            userId: userId,
            isDeleted: false
          }
        });

        if (!customerUser) {
          return errorResponse(res, 'Customer not found', 404);
        }
      }
    }

    // Store customer info for response
    const customerInfo = {
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email
    };

    // Record deletion in log first (before deleting)
    const oldStatus = customerUser ? customerUser.status : constants.CUSTOMER_STATUS.ACTIVE;
    
    // Create CustomerStatusLog for deletion (record the deletion)
    await prisma.customerStatusLog.create({
      data: {
        customerId: id,
        userId: userId,
        oldStatus: oldStatus,
        newStatus: constants.STATUS.INACTIVE,
        reason: customerUser 
          ? 'Customer removed from business owner list' 
          : 'Customer removed from business owner list (direct ownership)'
      }
    });

    // Hard delete CustomerUser relation if it exists
    if (customerUser) {
      await prisma.customerUser.delete({
        where: { id: customerUser.id }
      });
    }

    // If customer is directly owned by this user, delete the customer record itself
    if (customer.userId === userId) {
      await prisma.customers.delete({
        where: { id: id }
      });
    }

    return successResponse(res, {
      message: `Customer ${customerInfo.firstName} ${customerInfo.lastName} removed from your customer list`,
      customerInfo: customerInfo,
      note: "Customer relation has been deleted. Customer data remains in the system."
    }, 'Customer removed successfully');
  } catch (error) {
    console.error('Remove customer error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Get all customers with search (no pagination - frontend will handle) - OPTIMIZED
const getAllCustomers = async (req, res) => {
  try {
    const { search, businessId } = req.query;
    
    // Get user ID from authenticated token
    const authenticatedUserId = req.user.userId;

    // Build search conditions for the SQL query
    let searchConditions = '';
    let queryParams = [authenticatedUserId];
    let paramIndex = 2;

    if (search) {
      searchConditions = `
        AND (
          c."firstName" ILIKE $${paramIndex} OR 
          c."lastName" ILIKE $${paramIndex} OR 
          c."customerFullName" ILIKE $${paramIndex} OR 
          c."customerPhone" ILIKE $${paramIndex} OR 
          c."selectedServices" ILIKE $${paramIndex}
        )
      `;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (businessId) {
      searchConditions += ` AND c."businessId" = $${paramIndex}`;
      queryParams.push(parseInt(businessId));
      paramIndex++;
    }

    // Single optimized query to get all customer data with aggregations
    const customersQuery = `
      SELECT 
        c.*,
        u."businessName" as "userBusinessName",
        u."businessType" as "userBusinessType",
        COALESCE(cu.status, 'active') as "customerStatus",
        COALESCE(cu."isActive", true) as "isActive",
        COALESCE(appointment_counts.total, 0) as "totalAppointments",
        appointment_counts.last_appointment_date as "lastAppointmentDate",
        appointment_counts.first_appointment_date as "firstAppointmentDate",
        last_appointment_service.last_appointment_service as "lastAppointmentService",
        last_appointment_staff.last_appointment_staff_name as "lastAppointmentStaffName",
        COALESCE(appointment_intervals.avg_days_between_appointments, 0) as "avgDaysBetweenAppointments",
        COALESCE(payment_data.total_paid, 0) as "totalPaidAmount",
        COALESCE(payment_data.last_payment_amount, 0) as "lastPaymentAmount",
        payment_data.last_payment_date as "lastPaymentDate",
        COALESCE(payment_data.payment_count, 0) as "paymentCount",
        COALESCE(payment_data.min_payment, 0) as "minPayment",
        COALESCE(payment_data.max_payment, 0) as "maxPayment",
        COALESCE(payment_data.avg_payment, 0) as "avgPayment",
        COALESCE(payment_data.lost_revenue, 0) as "lostRevenue",
        COALESCE(payment_data.recovered_revenue, 0) as "recoveredRevenue",
        COALESCE(review_stats.total_reviews, 0) as "totalReviews",
        COALESCE(review_stats.avg_rating, 0) as "averageRating",
        COALESCE(review_stats.min_rating, 0) as "minRating",
        COALESCE(review_stats.max_rating, 0) as "maxRating",
        review_stats.last_rating as "lastRating"
      FROM "customers" c
      LEFT JOIN "users" u ON c."userId" = u.id
      LEFT JOIN "customer_users" cu ON c.id = cu."customerId" 
        AND cu."userId" = c."userId" 
        AND cu."isDeleted" = false
      LEFT JOIN (
        SELECT 
          "customerId", 
          COUNT(*) as total,
          MAX("updatedAt") as last_appointment_date,
          MIN("createdAt") as first_appointment_date
        FROM "appointments" 
        GROUP BY "customerId"
      ) appointment_counts ON c.id = appointment_counts."customerId"
      LEFT JOIN (
        SELECT DISTINCT ON ("customerId")
          "customerId",
          "selectedServices" as last_appointment_service
        FROM "appointments"
        ORDER BY "customerId", "updatedAt" DESC, "createdAt" DESC
      ) last_appointment_service ON c.id = last_appointment_service."customerId"
      LEFT JOIN (
        SELECT DISTINCT ON (a."customerId")
          a."customerId",
          s."fullName" as last_appointment_staff_name
        FROM "appointments" a
        LEFT JOIN "staff" s ON a."staffId" = s.id
        WHERE a."staffId" IS NOT NULL
        ORDER BY a."customerId", a."updatedAt" DESC, a."createdAt" DESC
      ) last_appointment_staff ON c.id = last_appointment_staff."customerId"
      LEFT JOIN (
        SELECT 
          "customerId",
          CASE 
            WHEN COUNT(*) > 1 THEN
              AVG(EXTRACT(EPOCH FROM (next_appt - "createdAt")) / 86400)
            ELSE NULL
          END as avg_days_between_appointments
        FROM (
          SELECT 
            "customerId",
            "createdAt",
            LEAD("createdAt") OVER (PARTITION BY "customerId" ORDER BY "createdAt") as next_appt
          FROM "appointments"
        ) appt_with_next
        WHERE next_appt IS NOT NULL
        GROUP BY "customerId"
      ) appointment_intervals ON c.id = appointment_intervals."customerId"
      LEFT JOIN (
        SELECT 
          pw."customerId",
          SUM(pw.total) as total_paid,
          (SELECT pw2.total 
           FROM "payment_webhooks" pw2 
           WHERE pw2."customerId" = pw."customerId" 
           AND pw2.status = 'success'
           ORDER BY pw2."paymentDate" DESC, pw2."createdAt" DESC
           LIMIT 1) as last_payment_amount,
          MAX(pw."paymentDate") as last_payment_date,
          COUNT(*) as payment_count,
          MIN(pw.total) as min_payment,
          MAX(pw.total) as max_payment,
          AVG(pw.total) as avg_payment,
          COALESCE(SUM(CASE WHEN pw."customerOldStatus" = '${constants.CUSTOMER_STATUS.LOST}' OR pw."customerOldStatus" = '${constants.CUSTOMER_STATUS.AT_RISK}' THEN pw.total ELSE 0 END), 0) as lost_revenue,
          COALESCE(SUM(CASE WHEN pw."revenuePaymentStatus" = '${constants.CUSTOMER_STATUS.RECOVERED}' THEN pw.total ELSE 0 END), 0) as recovered_revenue
        FROM "payment_webhooks" pw
        WHERE pw.status = 'success'
        GROUP BY pw."customerId"
      ) payment_data ON c.id = payment_data."customerId"
      LEFT JOIN (
        SELECT 
          "customerId",
          COUNT(*) as total_reviews,
          AVG(rating) as avg_rating,
          MIN(rating) as min_rating,
          MAX(rating) as max_rating,
          (SELECT rating FROM "reviews" r2 WHERE r2."customerId" = r."customerId" AND r2.status != 'sent' ORDER BY r2."createdAt" DESC LIMIT 1) as last_rating
        FROM "reviews" r
        WHERE status != 'sent'
        GROUP BY "customerId"
      ) review_stats ON c.id = review_stats."customerId"
      WHERE c."userId" = $1
      ${searchConditions}
      ORDER BY c."createdAt" DESC
    `;

    const customersData = await prisma.$queryRawUnsafe(customersQuery, ...queryParams);

    // Get all customer IDs
    const customerIds = customersData.map(c => c.id);

    // Fetch all appointments for these customers (all statuses: booked, cancelled, scheduled)
    let appointmentsByCustomer = {};
    if (customerIds.length > 0) {
      const appointments = await prisma.appointment.findMany({
        where: {
          customerId: { in: customerIds },
          userId: authenticatedUserId
          // No appointmentStatus filter - return booked, cancelled, and scheduled
        },
        select: {
          id: true,
          customerId: true,
          selectedServices: true,
          serviceId: true,
          appointmentStatus: true,
          startDate: true,
          endDate: true,
          duration: true,
          service: {
            select: { name: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Helper function to convert duration to minutes
      const convertDurationToMinutes = (duration) => {
        if (!duration) return null;
        
        // If already a number or numeric string, return as string
        if (typeof duration === 'number') {
          return String(duration);
        }
        
        if (typeof duration === 'string') {
          // If it's already a numeric string, return it
          if (/^\d+$/.test(duration.trim())) {
            return duration.trim();
          }
          
          // If it's in time format (HH:MM or HH:MM:SS), convert to minutes
          const timePattern = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
          const match = duration.trim().match(timePattern);
          
          if (match) {
            const hours = parseInt(match[1], 10) || 0;
            const minutes = parseInt(match[2], 10) || 0;
            const seconds = parseInt(match[3], 10) || 0;
            const totalMinutes = (hours * 60) + minutes + Math.round(seconds / 60);
            return String(totalMinutes);
          }
        }
        
        // Return as string if can't convert
        return String(duration);
      };

      // Group appointments by customerId and format to only include selectedServices as array
      appointments.forEach(appointment => {
        if (!appointmentsByCustomer[appointment.customerId]) {
          appointmentsByCustomer[appointment.customerId] = [];
        }
        
        // selectedServices: prefer service name from serviceId, fallback to appointment.selectedServices
        let selectedServicesString = '';
        if (appointment.service?.name) {
          selectedServicesString = appointment.service.name;
        } else if (appointment.selectedServices) {
          if (Array.isArray(appointment.selectedServices)) {
            selectedServicesString = appointment.selectedServices.join(', ');
          } else if (typeof appointment.selectedServices === 'string') {
            try {
              const parsed = JSON.parse(appointment.selectedServices);
              if (Array.isArray(parsed)) {
                selectedServicesString = parsed.join(', ');
              } else {
                selectedServicesString = appointment.selectedServices;
              }
            } catch {
              selectedServicesString = appointment.selectedServices;
            }
          } else {
            selectedServicesString = String(appointment.selectedServices);
          }
        }

        appointmentsByCustomer[appointment.customerId].push({
          selectedServices: selectedServicesString,
          appointmentStatus: appointment.appointmentStatus ?? null,
          startDate: appointment.startDate,
          endDate: appointment.endDate,
          duration: convertDurationToMinutes(appointment.duration)
        });
      });
    }

    // Process the results - all data already fetched in single query
    const customersWithTotalCount = customersData.map((customer) => {
      // Calculate days since last appointment
      let daysSinceLastAppointment = null;
      if (customer.lastAppointmentDate) {
        const lastApptDate = new Date(customer.lastAppointmentDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        lastApptDate.setHours(0, 0, 0, 0);
        const diffTime = today - lastApptDate;
        daysSinceLastAppointment = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      }

      // Calculate years since customer creation
      let yearsSinceCreation = null;
      if (customer.createdAt) {
        const customerCreatedDate = new Date(customer.createdAt);
        const today = new Date();
        const diffTime = today - customerCreatedDate;
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        const totalYears = diffDays / 365.25;
        
        if (diffDays >= 0) {
          yearsSinceCreation = parseFloat(totalYears.toFixed(2));
        }
      }

      // Calculate average number of visits per year
      // Formula: totalAppointments / totalYears (from customer creation date to today)
      // If yearsSinceCreation < 1, use 1 year as minimum for calculation
      let avgVisitsPerYear = null;
      let totalYear = null;
      const totalAppointments = Number(customer.totalAppointments) || 0;
      if (totalAppointments > 0 && customer.createdAt) {
        const customerCreatedDate = new Date(customer.createdAt);
        const today = new Date();
        
        // Calculate time difference from customer creation to today (in days)
        const diffTime = today - customerCreatedDate;
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        const totalYears = diffDays / 365.25;
        
        // Minimum threshold: at least 1 day to avoid unrealistic calculations
        const MIN_DAYS_THRESHOLD = 1;
        
        if (diffDays >= MIN_DAYS_THRESHOLD) {
          // Use at least 1 year for calculation (if less than 1 year, treat as 1 year)
          const yearsForCalculation = Math.max(1, totalYears);
          totalYear = yearsForCalculation;
          // Calculate average visits per year: total appointments / years (minimum 1 year)
          avgVisitsPerYear = parseFloat((totalAppointments / yearsForCalculation).toFixed(2));
        } else {
          // If less than 1 day has passed since customer creation, don't calculate (return null)
          // This prevents unrealistic projections for very recent customers
          avgVisitsPerYear = null;
          totalYear = null;
        }
      }

      // Average time between appointments (in days)
      const avgTimeBetweenAppointments = customer.avgDaysBetweenAppointments 
        ? Math.round(Number(customer.avgDaysBetweenAppointments))
        : null;

      return {
        // Basic customer data
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        customerPhone: customer.customerPhone,
        appointmentCount: customer.appointmentCount,
        customerFullName: customer.customerFullName,
        selectedServices: customer.selectedServices,
        endDate: customer.endDate,
        duration: customer.duration,
        startDate: customer.startDate,
        businessId: customer.businessId,
        employeeId: customer.employeeId,
        businessName: customer.businessName,
        address: customer.address,
        city: customer.city,
        birthdate: customer.birthdate || null,
        isActive: customer.isActive !== undefined ? customer.isActive : true,
        profileImage: customer.profileImage,
        coverImage: customer.coverImage,
        documentImage: customer.documentImage,
        userId: customer.userId,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
        
        // User data
        user: {
          id: customer.userId,
          businessName: customer.userBusinessName,
          businessType: customer.userBusinessType
        },
        
        // Aggregated data from joins
        totalAppointmentCount: totalAppointments,
        customerStatus: customer.customerStatus,
        lastRating: Number(customer.lastRating) || 0,
        lastVisit: customer.lastAppointmentDate || customer.lastPaymentDate,
        lastAppointmentDate: customer.lastAppointmentDate,
        firstAppointmentDate: customer.firstAppointmentDate || null,
        lastAppointmentService: customer.lastAppointmentService || null,
        lastAppointmentStaffName: customer.lastAppointmentStaffName || null,
        daysSinceLastAppointment: daysSinceLastAppointment,
        avgTimeBetweenAppointments: avgTimeBetweenAppointments,
        avgVisitsPerYear: avgVisitsPerYear,
        yearsSinceCreation: yearsSinceCreation,
        totalYear: totalYear,
        
        // Payment data
        totalPaidAmount: Number(customer.totalPaidAmount),
        lastPaymentAmount: Number(customer.lastPaymentAmount),
        lastPaymentDate: customer.lastPaymentDate,
        paymentCount: Number(customer.paymentCount),
        
        // Review statistics
        reviews: [], // Empty array since we have aggregated stats
        reviewStatistics: {
          totalReviews: Number(customer.totalReviews),
          averageRating: customer.averageRating ? parseFloat(Number(customer.averageRating).toFixed(2)) : 0,
          minRating: Number(customer.minRating),
          maxRating: Number(customer.maxRating),
          lastRating: Number(customer.lastRating) || 0
        },
        // Revenue statistics
        revenueStatistics: {
          totalRevenue: Number(customer.totalPaidAmount),
          averagePayment: customer.avgPayment ? parseFloat(Number(customer.avgPayment).toFixed(2)) : 0,
          minPayment: Number(customer.minPayment),
          maxPayment: Number(customer.maxPayment),
          lastPayment: Number(customer.lastPaymentAmount) || 0,
          totalPayments: Number(customer.paymentCount),
          lostRevenue: Number(customer.lostRevenue) || 0,
          recoveredRevenue: Number(customer.recoveredRevenue) || 0
        },
        // Appointments array with only selectedServices
        appointments: appointmentsByCustomer[customer.id] || []
      };
    });

    // Get total count for reference
    const total = customersData.length;

    return successResponse(res, {
      customers: customersWithTotalCount,  // ✅ customers with totalAppointmentCount and payment data
      total: total // Total count for frontend reference
    }, 'Customers retrieved successfully');

  } catch (error) {
    console.error('Get customers error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Get ten customers without pagination - OPTIMIZED
const getTenCustomers = async (req, res) => {
  try {
    const { businessId } = req.query;
    
    // Get user ID from authenticated token
    const authenticatedUserId = req.user.userId;

    // Build search conditions for the SQL query
    let searchConditions = '';
    let queryParams = [authenticatedUserId];
    let paramIndex = 2;

    if (businessId) {
      searchConditions += ` AND c."businessId" = $${paramIndex}`;
      queryParams.push(parseInt(businessId));
      paramIndex++;
    }

    // Single optimized query to get top 10 customers with all data
    const customersQuery = `
      SELECT 
        c.*,
        u."businessName" as "userBusinessName",
        u."businessType" as "userBusinessType",
        COALESCE(cu.status, 'active') as "customerStatus",
        COALESCE(cu."isActive", true) as "isActive",
        COALESCE(appointment_counts.total, 0) as "totalAppointments",
        appointment_counts.last_appointment_date as "lastAppointmentDate",
        appointment_counts.first_appointment_date as "firstAppointmentDate",
        last_appointment_service.last_appointment_service as "lastAppointmentService",
        last_appointment_staff.last_appointment_staff_name as "lastAppointmentStaffName",
        COALESCE(appointment_intervals.avg_days_between_appointments, 0) as "avgDaysBetweenAppointments",
        COALESCE(payment_data.total_paid, 0) as "totalPaidAmount",
        COALESCE(payment_data.last_payment_amount, 0) as "lastPaymentAmount",
        payment_data.last_payment_date as "lastPaymentDate",
        COALESCE(payment_data.payment_count, 0) as "paymentCount",
        COALESCE(payment_data.min_payment, 0) as "minPayment",
        COALESCE(payment_data.max_payment, 0) as "maxPayment",
        COALESCE(payment_data.avg_payment, 0) as "avgPayment",
        COALESCE(payment_data.lost_revenue, 0) as "lostRevenue",
        COALESCE(payment_data.recovered_revenue, 0) as "recoveredRevenue",
        COALESCE(review_stats.total_reviews, 0) as "totalReviews",
        COALESCE(review_stats.avg_rating, 0) as "averageRating",
        COALESCE(review_stats.min_rating, 0) as "minRating",
        COALESCE(review_stats.max_rating, 0) as "maxRating",
        review_stats.last_rating as "lastRating"
      FROM "customers" c
      LEFT JOIN "users" u ON c."userId" = u.id
      LEFT JOIN "customer_users" cu ON c.id = cu."customerId" 
        AND cu."userId" = c."userId" 
        AND cu."isDeleted" = false
      LEFT JOIN (
        SELECT 
          "customerId", 
          COUNT(*) as total,
          MAX("updatedAt") as last_appointment_date,
          MIN("createdAt") as first_appointment_date
        FROM "appointments" 
        GROUP BY "customerId"
      ) appointment_counts ON c.id = appointment_counts."customerId"
      LEFT JOIN (
        SELECT DISTINCT ON ("customerId")
          "customerId",
          "selectedServices" as last_appointment_service
        FROM "appointments"
        ORDER BY "customerId", "updatedAt" DESC, "createdAt" DESC
      ) last_appointment_service ON c.id = last_appointment_service."customerId"
      LEFT JOIN (
        SELECT DISTINCT ON (a."customerId")
          a."customerId",
          s."fullName" as last_appointment_staff_name
        FROM "appointments" a
        LEFT JOIN "staff" s ON a."staffId" = s.id
        WHERE a."staffId" IS NOT NULL
        ORDER BY a."customerId", a."updatedAt" DESC, a."createdAt" DESC
      ) last_appointment_staff ON c.id = last_appointment_staff."customerId"
      LEFT JOIN (
        SELECT 
          "customerId",
          CASE 
            WHEN COUNT(*) > 1 THEN
              AVG(EXTRACT(EPOCH FROM (next_appt - "createdAt")) / 86400)
            ELSE NULL
          END as avg_days_between_appointments
        FROM (
          SELECT 
            "customerId",
            "createdAt",
            LEAD("createdAt") OVER (PARTITION BY "customerId" ORDER BY "createdAt") as next_appt
          FROM "appointments"
        ) appt_with_next
        WHERE next_appt IS NOT NULL
        GROUP BY "customerId"
      ) appointment_intervals ON c.id = appointment_intervals."customerId"
      LEFT JOIN (
        SELECT 
          pw."customerId",
          SUM(pw.total) as total_paid,
          (SELECT pw2.total 
           FROM "payment_webhooks" pw2 
           WHERE pw2."customerId" = pw."customerId" 
           AND pw2.status = 'success'
           ORDER BY pw2."paymentDate" DESC, pw2."createdAt" DESC
           LIMIT 1) as last_payment_amount,
          MAX(pw."paymentDate") as last_payment_date,
          COUNT(*) as payment_count,
          MIN(pw.total) as min_payment,
          MAX(pw.total) as max_payment,
          AVG(pw.total) as avg_payment,
          COALESCE(SUM(CASE WHEN pw."customerOldStatus" = '${constants.CUSTOMER_STATUS.LOST}' OR pw."customerOldStatus" = '${constants.CUSTOMER_STATUS.AT_RISK}' THEN pw.total ELSE 0 END), 0) as lost_revenue,
          COALESCE(SUM(CASE WHEN pw."revenuePaymentStatus" = '${constants.CUSTOMER_STATUS.RECOVERED}' THEN pw.total ELSE 0 END), 0) as recovered_revenue
        FROM "payment_webhooks" pw
        WHERE pw.status = 'success'
        GROUP BY pw."customerId"
      ) payment_data ON c.id = payment_data."customerId"
      LEFT JOIN (
        SELECT 
          "customerId",
          COUNT(*) as total_reviews,
          AVG(rating) as avg_rating,
          MIN(rating) as min_rating,
          MAX(rating) as max_rating,
          (SELECT rating FROM "reviews" r2 WHERE r2."customerId" = r."customerId" AND r2.status != 'sent' ORDER BY r2."createdAt" DESC LIMIT 1) as last_rating
        FROM "reviews" r
        WHERE status != 'sent'
        GROUP BY "customerId"
      ) review_stats ON c.id = review_stats."customerId"
      WHERE c."userId" = $1
      ${searchConditions}
      ORDER BY c."createdAt" DESC
      LIMIT 10
    `;

    const customersData = await prisma.$queryRawUnsafe(customersQuery, ...queryParams);

    // Get total count for reference
    const totalCountQuery = `
      SELECT COUNT(*) as total
      FROM "customers" c
      WHERE c."userId" = $1
      ${searchConditions}
    `;

    const totalCountResult = await prisma.$queryRawUnsafe(totalCountQuery, ...queryParams);
    const totalCustomersCount = Number(totalCountResult[0]?.total) || 0;

    // Process the results - all data already fetched in single query
    const customersWithTotalCount = customersData.map((customer) => {
      // Calculate days since last appointment
      let daysSinceLastAppointment = null;
      if (customer.lastAppointmentDate) {
        const lastApptDate = new Date(customer.lastAppointmentDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        lastApptDate.setHours(0, 0, 0, 0);
        const diffTime = today - lastApptDate;
        daysSinceLastAppointment = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      }

      // Calculate years since customer creation
      let yearsSinceCreation = null;
      if (customer.createdAt) {
        const customerCreatedDate = new Date(customer.createdAt);
        const today = new Date();
        const diffTime = today - customerCreatedDate;
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        const totalYears = diffDays / 365.25;
        
        if (diffDays >= 0) {
          yearsSinceCreation = parseFloat(totalYears.toFixed(2));
        }
      }

      // Calculate average number of visits per year
      // Formula: totalAppointments / totalYears (from customer creation date to today)
      // If yearsSinceCreation < 1, use 1 year as minimum for calculation
      let avgVisitsPerYear = null;
      let totalYear = null;
      const totalAppointments = Number(customer.totalAppointments) || 0;
      if (totalAppointments > 0 && customer.createdAt) {
        const customerCreatedDate = new Date(customer.createdAt);
        const today = new Date();
        
        // Calculate time difference from customer creation to today (in days)
        const diffTime = today - customerCreatedDate;
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        const totalYears = diffDays / 365.25;
        
        // Minimum threshold: at least 1 day to avoid unrealistic calculations
        const MIN_DAYS_THRESHOLD = 1;
        
        if (diffDays >= MIN_DAYS_THRESHOLD) {
          // Use at least 1 year for calculation (if less than 1 year, treat as 1 year)
          const yearsForCalculation = Math.max(1, totalYears);
          totalYear = yearsForCalculation;
          // Calculate average visits per year: total appointments / years (minimum 1 year)
          avgVisitsPerYear = parseFloat((totalAppointments / yearsForCalculation).toFixed(2));
        } else {
          // If less than 1 day has passed since customer creation, don't calculate (return null)
          // This prevents unrealistic projections for very recent customers
          avgVisitsPerYear = null;
          totalYear = null;
        }
      }

      // Average time between appointments (in days)
      const avgTimeBetweenAppointments = customer.avgDaysBetweenAppointments 
        ? Math.round(Number(customer.avgDaysBetweenAppointments))
        : null;

      return {
        // Basic customer data
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        customerPhone: customer.customerPhone,
        appointmentCount: customer.appointmentCount,
        customerFullName: customer.customerFullName,
        selectedServices: customer.selectedServices,
        endDate: customer.endDate,
        duration: customer.duration,
        startDate: customer.startDate,
        businessId: customer.businessId,
        employeeId: customer.employeeId,
        businessName: customer.businessName,
        address: customer.address,
        city: customer.city,
        birthdate: customer.birthdate || null,
        isActive: customer.isActive !== undefined ? customer.isActive : true,
        profileImage: customer.profileImage,
        coverImage: customer.coverImage,
        documentImage: customer.documentImage,
        userId: customer.userId,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
        
        // User data
        user: {
          id: customer.userId,
          businessName: customer.userBusinessName,
          businessType: customer.userBusinessType
        },
        
        // Aggregated data from joins
        totalAppointmentCount: totalAppointments,
        customerStatus: customer.customerStatus,
        lastRating: Number(customer.lastRating) || 0,
        lastVisit: customer.lastAppointmentDate || customer.lastPaymentDate,
        lastAppointmentDate: customer.lastAppointmentDate,
        firstAppointmentDate: customer.firstAppointmentDate || null,
        lastAppointmentService: customer.lastAppointmentService || null,
        lastAppointmentStaffName: customer.lastAppointmentStaffName || null,
        daysSinceLastAppointment: daysSinceLastAppointment,
        avgTimeBetweenAppointments: avgTimeBetweenAppointments,
        avgVisitsPerYear: avgVisitsPerYear,
        yearsSinceCreation: yearsSinceCreation,
        totalYear: totalYear,
        
        // Payment data
        totalPaidAmount: Number(customer.totalPaidAmount),
        lastPaymentAmount: Number(customer.lastPaymentAmount),
        lastPaymentDate: customer.lastPaymentDate,
        paymentCount: Number(customer.paymentCount),
        
        // Review statistics
        reviews: [], // Empty array since we have aggregated stats
        reviewStatistics: {
          totalReviews: Number(customer.totalReviews),
          averageRating: customer.averageRating ? parseFloat(Number(customer.averageRating).toFixed(2)) : 0,
          minRating: Number(customer.minRating),
          maxRating: Number(customer.maxRating),
          lastRating: Number(customer.lastRating) || 0
        },
        // Revenue statistics
        revenueStatistics: {
          totalRevenue: Number(customer.totalPaidAmount),
          averagePayment: customer.avgPayment ? parseFloat(Number(customer.avgPayment).toFixed(2)) : 0,
          minPayment: Number(customer.minPayment),
          maxPayment: Number(customer.maxPayment),
          lastPayment: Number(customer.lastPaymentAmount) || 0,
          totalPayments: Number(customer.paymentCount),
          lostRevenue: Number(customer.lostRevenue) || 0,
          recoveredRevenue: Number(customer.recoveredRevenue) || 0
        }
      };
    });

    return successResponse(res, {
      customers: customersWithTotalCount,
      total: customersWithTotalCount.length,
      totalAvailable: totalCustomersCount,
      remaining: Math.max(0, totalCustomersCount - customersWithTotalCount.length),
      message: totalCustomersCount >= 10 
        ? 'Latest 10 customers retrieved successfully' 
        : `Only ${totalCustomersCount} customers found (less than 10)`
    }, totalCustomersCount >= 10 ? 'Latest 10 customers retrieved successfully' : `Only ${totalCustomersCount} customers found`);

  } catch (error) {
    console.error('Get ten customers error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Get customer status counts for dashboard - OPTIMIZED
const getCustomersStatusCount = async (req, res) => {
  try {
    // Get user ID from authenticated token
    const authenticatedUserId = req.user.userId;

    // Single optimized query to get status counts
    const statusCountsQuery = `
      SELECT 
        COALESCE(cu.status, 'active') as status,
        COUNT(*) as count
      FROM "customers" c
      LEFT JOIN "customer_users" cu ON c.id = cu."customerId" 
        AND cu."userId" = $1 
        AND cu."isDeleted" = false
      WHERE c."userId" = $1
      GROUP BY COALESCE(cu.status, 'active')
      ORDER BY status
    `;

    const statusResults = await prisma.$queryRawUnsafe(statusCountsQuery, authenticatedUserId);

    // Initialize counters
    const statusCounts = {
      [constants.CUSTOMER_STATUS.ACTIVE]: 0,
      [constants.CUSTOMER_STATUS.AT_RISK]: 0,
      [constants.CUSTOMER_STATUS.LOST]: 0,
      [constants.CUSTOMER_STATUS.RECOVERED]: 0,
      [constants.CUSTOMER_STATUS.NEW]: 0
    };

    // Process results
    let total = 0;
    for (const result of statusResults) {
      const status = result.status;
      const count = Number(result.count);
      total += count;
      
      if (statusCounts.hasOwnProperty(status)) {
        statusCounts[status] = count;
      }
    }

    return successResponse(res, {
      statusCounts,
      total,
      breakdown: {
        [constants.CUSTOMER_STATUS.ACTIVE]: {
          count: statusCounts[constants.CUSTOMER_STATUS.ACTIVE],
          percentage: total > 0 ? ((statusCounts[constants.CUSTOMER_STATUS.ACTIVE] / total) * 100).toFixed(1) : 0
        },
        [constants.CUSTOMER_STATUS.AT_RISK]: {
          count: statusCounts[constants.CUSTOMER_STATUS.AT_RISK],
          percentage: total > 0 ? ((statusCounts[constants.CUSTOMER_STATUS.AT_RISK] / total) * 100).toFixed(1) : 0
        },
        [constants.CUSTOMER_STATUS.LOST]: {
          count: statusCounts[constants.CUSTOMER_STATUS.LOST],
          percentage: total > 0 ? ((statusCounts[constants.CUSTOMER_STATUS.LOST] / total) * 100).toFixed(1) : 0
        },
        [constants.CUSTOMER_STATUS.RECOVERED]: {
          count: statusCounts[constants.CUSTOMER_STATUS.RECOVERED],
          percentage: total > 0 ? ((statusCounts[constants.CUSTOMER_STATUS.RECOVERED] / total) * 100).toFixed(1) : 0
        },
        [constants.CUSTOMER_STATUS.NEW]: {
          count: statusCounts[constants.CUSTOMER_STATUS.NEW],
          percentage: total > 0 ? ((statusCounts[constants.CUSTOMER_STATUS.NEW] / total) * 100).toFixed(1) : 0
        }
      }
    }, 'Customer status counts retrieved successfully');

  } catch (error) {
    console.error('Get customer status counts error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Get customer by ID with detailed information
const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user ID from authenticated token
    const authenticatedUserId = req.user.userId;

    if (!id) {
      return errorResponse(res, 'Customer ID is required', 400);
    }

    // Build where clause - Always filter by authenticated user's ID
    const where = { 
      id,
      userId: authenticatedUserId // Filter by authenticated user only
    };

    // Get customer by ID with user data
    const customer = await prisma.customers.findFirst({
      where,
      include: {
        user: {
          select: {
            id: true,
            businessName: true,
            businessType: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true
          }
        }
      }
    });
    
    if (!customer) {
      return errorResponse(res, 'Customer not found', 404);
    }

    // Get total appointments count
    const totalAppointments = await prisma.appointment.count({
      where: {
        customerId: customer.id
      }
    });

    // Get ALL appointments for this customer
    const appointments = await prisma.appointment.findMany({
      where: {
        customerId: customer.id,
        userId: customer.userId // Match with business owner
      },
      orderBy: { createdAt: 'desc' }
      // Removed take: 10 to get all appointments
    });

    // Get CustomerUser status (latest active status)
    const customerUserStatus = await prisma.customerUser.findFirst({
      where: {
        customerId: customer.id
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });

    // Get all reviews for this customer that match with the business owner (userId)
    const customerReviews = await prisma.review.findMany({
      where: {
        customerId: customer.id,
        userId: customer.userId // Match with business owner
      },
      include: {
        user: {
          select: {
            id: true,
            businessName: true,
            firstName: true,
            lastName: true
          }
        },
        appointment: {
          select: {
            id: true,
            startDate: true,
            endDate: true,
            customerFullName: true,
            businessName: true,
            employeeName: true
          }
        },
        paymentWebhook: {
          select: {
            id: true,
            total: true,
            paymentDate: true,
            status: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate review statistics for this customer with specific userId
    const reviewStats = await prisma.review.aggregate({
      where: { 
        customerId: customer.id,
        userId: customer.userId // Match with business owner
      },
      _avg: { rating: true },
      _count: { rating: true },
      _min: { rating: true },
      _max: { rating: true },
      _sum: { rating: true }
    });

    // Get latest review rating (most recent one) for "Last" star display
    const latestReview = customerReviews.length > 0 ? customerReviews[0] : null;
    const lastRating = latestReview ? latestReview.rating : 0;

    // Get latest appointment updatedAt only
    const lastVisit = await prisma.appointment.findFirst({
      where: {
        customerId: customer.id,
        // userId: customer.userId // Match with business owner
      },
      orderBy: { updatedAt: 'desc' }, // Latest updated appointment
      select: {
        updatedAt: true,
        startDate: true,
        endDate: true,
        selectedServices: true
      }
    });

    // Get ALL payment webhooks for this customer
    const paymentHistory = await prisma.paymentWebhook.findMany({
      where: {
        customerId: customer.id,
        // userId: customer.userId
      },
      orderBy: { createdAt: 'desc' }
      // Removed take: 10 to get all records
    });

    // Calculate total spent
    const totalSpentResult = await prisma.paymentWebhook.aggregate({
      where: {
        customerId: customer.id,
        userId: customer.userId,
        status: 'success'
      },
      _sum: { total: true }
    });

    const customerWithDetails = {
      ...customer,
      totalAppointmentCount: totalAppointments,
      customerStatus: customerUserStatus?.status || constants.CUSTOMER_STATUS.ACTIVE,
      customerStatusDetails: customerUserStatus,
      reviews: customerReviews,
      lastRating: lastRating,
      lastVisit: lastVisit?.updatedAt || null,
      lastAppointmentService: lastVisit?.selectedServices || null,
      lastAppointmentDetails: lastVisit,
      appointments: appointments,
      paymentHistory: paymentHistory,
      totalSpent: totalSpentResult._sum.total || 0,
      reviewStatistics: {
        totalReviews: reviewStats._count.rating || 0,
        averageRating: reviewStats._avg.rating ? parseFloat(reviewStats._avg.rating.toFixed(2)) : 0,
        minRating: reviewStats._min.rating || 0,
        maxRating: reviewStats._max.rating || 0,
        totalRatingSum: reviewStats._sum.rating || 0,
        lastRating: lastRating
      }
    };

    return successResponse(res, {
      customer: customerWithDetails
    }, 'Customer details retrieved successfully');

  } catch (error) {
    console.error('Get customer by ID error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Remove multiple customers from business owner's list (bulk delete)
const removeMultipleCustomers = async (req, res) => {
  try {
    const { ids } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Check if user is authenticated
    if (!userId) {
      return errorResponse(res, 'User not authenticated. Please login again.', 401);
    }

    // Validate input
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 'Customer IDs array is required', 400);
    }

    // Get all customer users that belong to this user
    let customerUsers = [];

    if (userRole === constants.ROLES.ADMIN) {
      // Admin can delete any customers
      customerUsers = await prisma.customerUser.findMany({
        where: {
          customerId: { in: ids },
          isDeleted: false
        },
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              userId: true
            }
          }
        }
      });
    } else {
      // Non-admin users can only delete their own customers
      customerUsers = await prisma.customerUser.findMany({
        where: {
          customerId: { in: ids },
          userId: userId,
          isDeleted: false
        },
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              userId: true
            }
          }
        }
      });
    }

    if (customerUsers.length === 0) {
      return errorResponse(res, 'No valid customers found to delete', 404);
    }

    // Use transaction to ensure all operations succeed or fail together
    const result = await prisma.$transaction(async (tx) => {
      const deletedCustomers = [];
      const statusLogs = [];

      // Hard delete each customer user relation
      for (const customerUser of customerUsers) {
        // Record deletion in log first (before deleting)
        const statusLog = await tx.customerStatusLog.create({
          data: {
            customerId: customerUser.customerId,
            userId: userId,
            oldStatus: customerUser.status,
            newStatus: constants.STATUS.INACTIVE,
            reason: 'Customer removed from business owner list (bulk delete)'
          }
        });

        // Hard delete CustomerUser relation
        await tx.customerUser.delete({
          where: { id: customerUser.id }
        });

        // If customer is directly owned by this user, delete the customer record itself
        // This is needed because getAllCustomers queries directly from customers table by userId
        if (customerUser.customer.userId === userId) {
          await tx.customers.delete({
            where: { id: customerUser.customerId }
          });
        }

        deletedCustomers.push({
          id: customerUser.customer.id,
          firstName: customerUser.customer.firstName,
          lastName: customerUser.customer.lastName,
          email: customerUser.customer.email
        });

        statusLogs.push(statusLog);
      }

      return { deletedCustomers, statusLogs };
    });

    return successResponse(res, {
      deletedCount: result.deletedCustomers.length,
      deletedCustomers: result.deletedCustomers,
      message: `${result.deletedCustomers.length} customer(s) removed successfully from your customer list`,
      note: "Customer relations have been deleted. Customer data remains in the system."
    }, 'Customers removed successfully');

  } catch (error) {
    console.error('Remove multiple customers error:', error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2002') {
      return errorResponse(res, 'One or more customers already deleted', 400);
    }
    
    if (error.code === 'P2003') {
      return errorResponse(res, 'Invalid customer ID(s) provided', 400);
    }

    return errorResponse(res, 'Failed to delete customers. Please try again.', 500);
  }
};

// Bulk import customers from CSV data
const bulkImportCustomers = async (req, res) => {
  try {
    const { customers } = req.body; // Array of customer objects
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Check if user is authenticated
    if (!userId) {
      return errorResponse(res, 'User not authenticated. Please login again.', 401);
    }

    // Validate input
    if (!customers || !Array.isArray(customers) || customers.length === 0) {
      return errorResponse(res, 'Customers array is required and must not be empty', 400);
    }

    // Check if user exists
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, businessName: true }
    });

    if (!currentUser) {
      return errorResponse(res, 'User not found in database. Please login again.', 400);
    }

    // Process customers in batches using transaction
    const results = await prisma.$transaction(async (tx) => {
      const importedCustomers = [];
      const errors = [];
      const skipped = [];

      for (let i = 0; i < customers.length; i++) {
        const customerData = customers[i];
        
        try {
          // Validate required fields
          if (!customerData.firstName || !customerData.lastName || !customerData.phoneNumber) {
            errors.push({
              index: i + 1,
              customer: customerData,
              error: 'Missing required fields: firstName, lastName, or phoneNumber'
            });
            continue;
          }

          // Format phone number
          const formattedPhone = formatIsraeliPhone(customerData.phoneNumber);
          
          if (!formattedPhone) {
            errors.push({
              index: i + 1,
              customer: customerData,
              error: 'Invalid phone number format'
            });
            continue;
          }

          // Check if customer already exists by phone
          const existingCustomer = await tx.customers.findFirst({
            where: {
              customerPhone: formattedPhone
            }
          });

          let customerId;
          let isNewCustomer = false;

          if (existingCustomer) {
            // Customer exists, use existing customer
            customerId = existingCustomer.id;
          } else {
            // Create new customer
            const fullName = customerData.customerFullName || `${customerData.firstName} ${customerData.lastName}`.trim();
            
            // Parse birthdate if provided
            let birthdateValue = null;
            if (customerData.birthdate) {
              birthdateValue = customerData.birthdate instanceof Date 
                ? customerData.birthdate 
                : new Date(customerData.birthdate);
              // Validate date
              if (isNaN(birthdateValue.getTime())) {
                birthdateValue = null;
              }
            }
            
            const newCustomer = await tx.customers.create({
              data: {
                firstName: customerData.firstName,
                lastName: customerData.lastName,
                customerPhone: formattedPhone,
                email: customerData.email || null,
                customerFullName: fullName,
                address: customerData.address || null,
                city: customerData.city || null,
                birthdate: birthdateValue,
                appointmentCount: 0,
                userId: userId,
                businessName: currentUser.businessName || null
              }
            });
            customerId = newCustomer.id;
            isNewCustomer = true;
          }

          // Check if CustomerUser relation already exists
          const existingCustomerUser = await tx.customerUser.findFirst({
            where: {
              customerId: customerId,
              userId: userId
            }
          });

          if (existingCustomerUser) {
            // Customer already in user's list, skip
            skipped.push({
              index: i + 1,
              customer: customerData,
              reason: 'Customer already exists in your customer list'
            });
            continue;
          }

          // Create CustomerUser relation
          // Map isActive: if customerData.isActive is provided, use it; otherwise default to true
          const isActiveValue = customerData.isActive !== undefined ? customerData.isActive : true;
          const newCustomerUser = await tx.customerUser.create({
            data: {
              customerId: customerId,
              userId: userId,
              status: customerData.status || 'new',
              isActive: isActiveValue
            }
          });

          // Create CustomerStatusLog
          await tx.customerStatusLog.create({
            data: {
              customerId: customerId,
              userId: userId,
              oldStatus: null,
              newStatus: customerData.status || 'new',
              reason: isNewCustomer ? 'New customer created via CSV import' : 'Customer added via CSV import'
            }
          });

          importedCustomers.push({
            index: i + 1,
            customerId: customerId,
            firstName: customerData.firstName,
            lastName: customerData.lastName,
            email: customerData.email || null,
            phone: formattedPhone,
            isNew: isNewCustomer
          });

        } catch (error) {
          console.error(`Error importing customer at index ${i + 1}:`, error);
          errors.push({
            index: i + 1,
            customer: customerData,
            error: error.message || 'Failed to import customer'
          });
        }
      }

      return { importedCustomers, errors, skipped };
    }, {
      timeout: 30000 // 30 second timeout for large imports
    });

    return successResponse(res, {
      total: customers.length,
      imported: results.importedCustomers.length,
      errors: results.errors.length,
      skipped: results.skipped.length,
      importedCustomers: results.importedCustomers,
      errors: results.errors,
      skipped: results.skipped,
      message: `Successfully imported ${results.importedCustomers.length} out of ${customers.length} customers`
    }, 'Bulk import completed');

  } catch (error) {
    console.error('Bulk import customers error:', error);
    
    if (error.code === 'P2002') {
      return errorResponse(res, 'Duplicate entry detected. Please check your data.', 400);
    }
    
    if (error.code === 'P2003') {
      return errorResponse(res, 'Foreign key constraint failed. Please check if user exists.', 400);
    }

    return errorResponse(res, 'Failed to import customers. Please try again.', 500);
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

    if (userRole === constants.ROLES.ADMIN) {
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

    // Use transaction to update customer count and create appointment record
    const result = await prisma.$transaction(async (tx) => {
      // Update customer visit information (increment appointmentCount)
      const updatedCustomer = await tx.customers.update({
        where: { id },
        data: {
          appointmentCount: {
            increment: 1
          }
        }
      });

      // Create appointment record for this visit
      const now = new Date();
      const appointment = await tx.appointment.create({
        data: {
          customerId: id,
          userId: customer.userId || userId,
          startDate: now,
          endDate: now,
          customerFullName: customer.customerFullName || `${customer.firstName} ${customer.lastName}`.trim(),
          customerPhone: customer.customerPhone,
          businessName: customer.businessName || null,
          selectedServices: notes || null, // Use notes as service description if provided
          createdAt: now,
          updatedAt: now
        }
      });

      // Fetch updated customer with relations
      const customerWithRelations = await tx.customers.findUnique({
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
            isActive: true,
            userId: true
          },
          take: 1 // Get only the first (most relevant) customerUser relation
        }
        }
      });

      return { customer: customerWithRelations, appointment };
    });

    return successResponse(res, {
      ...result.customer,
      appointmentId: result.appointment.id,
      message: 'Customer visit recorded successfully and appointment created'
    }, 'Customer visit recorded successfully');
  } catch (error) {
    console.error('Record customer visit error:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

module.exports = {
  addCustomer,
  getMyCustomers,
  getAllCustomers,
  getTenCustomers,
  getCustomersStatusCount,
  updateCustomer,
  removeCustomer,
  removeMultipleCustomers,
  getCustomerById,
  bulkImportCustomers,
  recordCustomerVisit
};
