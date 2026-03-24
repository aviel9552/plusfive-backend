/**
 * OpenAPI 3.0 spec for Plusfive API.
 * Aligns with USER_API_ENDPOINTS.md (business owner) and ADMIN_API_ENDPOINTS.md (admin).
 * Serve at /api-docs via swagger-ui-express.
 */

module.exports = {
  openapi: '3.0.0',
  info: {
    title: 'Plusfive API',
    description: 'API for Plusfive – business owner (user) and admin endpoints. Base URL: /api. Auth: Bearer token from POST /auth/login.',
    version: '1.0.0',
  },
  servers: [
    { url: '/api', description: 'Current host (relative)' },
    { url: 'http://localhost:3000/api', description: 'Local (development)' },
    { url: 'https://plusfive-backend.vercel.app/api', description: 'Live (production)' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT from POST /auth/login or /auth/register',
      },
    },
    schemas: {
      LoginBody: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', example: 'admin@plusfive.com' },
          password: { type: 'string', example: 'Admin123#' },
        },
      },
      RegisterBody: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string' },
          password: { type: 'string' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          phoneNumber: { type: 'string' },
          businessName: { type: 'string' },
          businessType: { type: 'string' },
        },
      },
      ForgotPasswordBody: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string' } },
      },
      ResetPasswordBody: {
        type: 'object',
        required: ['newPassword'],
        properties: { newPassword: { type: 'string' } },
      },
      ChangePasswordBody: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword: { type: 'string' },
        },
      },
      UpdateUserBody: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          email: { type: 'string' },
          phoneNumber: { type: 'string' },
          businessName: { type: 'string' },
          businessType: { type: 'string' },
          address: { type: 'string' },
          whatsappNumber: { type: 'string' },
          directChatMessage: { type: 'string' },
        },
      },
      AddCustomerByIdBody: {
        type: 'object',
        required: ['customerId'],
        properties: {
          customerId: { type: 'string', description: 'Existing customer UUID' },
          notes: { type: 'string' },
          rating: { type: 'number', minimum: 0, maximum: 5 },
          lastPayment: { type: 'number' },
          totalPaid: { type: 'number' },
          status: { type: 'string', example: 'active' },
        },
      },
      AddCustomerNewBody: {
        type: 'object',
        required: ['firstName', 'lastName', 'phoneNumber'],
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          phoneNumber: { type: 'string' },
          email: { type: 'string' },
          address: { type: 'string' },
          city: { type: 'string' },
          customerFullName: { type: 'string' },
          birthdate: { type: 'string', format: 'date' },
          notes: { type: 'string' },
          rating: { type: 'number' },
          lastPayment: { type: 'number' },
          totalPaid: { type: 'number' },
          status: { type: 'string' },
          isActive: { type: 'boolean' },
        },
      },
    },
  },
  tags: [
    { name: 'Auth', description: 'Public auth – login, register, forgot/reset password' },
    { name: 'User Profile', description: 'Own account – change password, soft delete, update profile' },
    { name: 'Admin Dashboard', description: 'Dashboard metrics (admin + business owner)' },
    { name: 'Customers', description: 'Customer CRUD' },
    { name: 'Staff', description: 'Staff and operating hours' },
    { name: 'Staff Services', description: 'Staff–service linking' },
    { name: 'Business Hours', description: 'Business operating hours' },
    { name: 'Services', description: 'Services CRUD' },
    { name: 'Categories', description: 'Categories CRUD' },
    { name: 'Catalog Categories', description: 'Catalog categories CRUD' },
    { name: 'Suppliers', description: 'Suppliers CRUD' },
    { name: 'Products', description: 'Products CRUD' },
    { name: 'Waitlist', description: 'Waitlist CRUD' },
    { name: 'QR', description: 'QR codes' },
    { name: 'Webhooks', description: 'Payments & appointments' },
    { name: 'Support', description: 'Support tickets' },
    { name: 'Stripe', description: 'Billing & subscription' },
    { name: 'Payments', description: 'Alternative payment routes' },
    { name: 'WhatsApp', description: 'WhatsApp messages' },
    { name: 'Reviews', description: 'Review messaging and rating flows' },
    { name: 'Business Gallery', description: 'Business gallery image management' },
    { name: 'Client Permissions', description: 'Client permission preferences' },
    { name: 'Automations', description: 'Automation preferences' },
    { name: 'Cron', description: 'Cron manual trigger and testing' },
    { name: 'N8N Test', description: 'n8n webhook trigger test endpoints' },
    { name: 'Public', description: 'Public business profile and appointments' },
    { name: 'Customer Status', description: 'Customer status dashboard' },
    { name: 'Admin Only', description: 'Admin role only – users CRUD' },
  ],
  paths: {
    // ---------- Auth ----------
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register new business owner',
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterBody' },
            },
          },
        },
        responses: { 200: { description: 'Success – returns user and accessToken' } },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login (returns JWT)',
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginBody' },
            },
          },
        },
        responses: { 200: { description: 'Success – returns user and accessToken' } },
      },
    },
    '/auth/verify-email/{token}': {
      get: {
        tags: ['Auth'],
        summary: 'Verify email',
        parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Email verified' } },
      },
    },
    '/auth/resend-verification': {
      post: {
        tags: ['Auth'],
        summary: 'Resend verification email',
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', properties: { email: { type: 'string' } } },
            },
          },
        },
        responses: { 200: { description: 'Email sent' } },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Forgot password',
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ForgotPasswordBody' },
            },
          },
        },
        responses: { 200: { description: 'Reset email sent' } },
      },
    },
    '/auth/reset-password/{token}': {
      post: {
        tags: ['Auth'],
        summary: 'Reset password',
        parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ResetPasswordBody' },
            },
          },
        },
        responses: { 200: { description: 'Password reset' } },
      },
    },

    // ---------- User Profile ----------
    '/users/change-password': {
      put: {
        tags: ['User Profile'],
        summary: 'Change password',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ChangePasswordBody' },
            },
          },
        },
        responses: { 200: { description: 'Password changed' } },
      },
    },
    '/users/soft-delete': {
      patch: {
        tags: ['User Profile'],
        summary: 'Soft delete own account',
        security: [{ BearerAuth: [] }],
        description: 'No body. Use PATCH only.',
        responses: { 200: { description: 'Account deactivated' }, 405: { description: 'Wrong method – use PATCH' } },
      },
    },
    '/users/{id}': {
      get: {
        tags: ['Admin Only'],
        summary: 'Get user by ID (admin only)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'User details' } },
      },
      put: {
        tags: ['User Profile'],
        summary: 'Update profile or user by ID',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateUserBody' },
            },
          },
        },
        responses: { 200: { description: 'User updated' } },
      },
      delete: {
        tags: ['Admin Only'],
        summary: 'Delete user by ID (admin only)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'User deleted' } },
      },
    },

    // ---------- Admin Dashboard ----------
    '/admin-dashboard/monthly-performance': {
      get: {
        tags: ['Admin Dashboard'],
        summary: 'Monthly performance',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Current month/year metrics' } },
      },
    },
    '/admin-dashboard/customer-status': {
      get: {
        tags: ['Admin Dashboard'],
        summary: 'Customer status breakdown',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Status breakdown' } },
      },
    },
    '/admin-dashboard/qr-analytics': {
      get: {
        tags: ['Admin Dashboard'],
        summary: 'QR analytics (current month)',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'QR scan/share stats' } },
      },
    },
    '/admin-dashboard/revenue-impacts': {
      get: {
        tags: ['Admin Dashboard'],
        summary: 'Revenue by period (monthly, weekly, lastMonth, yearly)',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Bar chart data' } },
      },
    },
    '/admin-dashboard/monthly-ltv-count': {
      get: {
        tags: ['Admin Dashboard'],
        summary: 'Monthly LTV count',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'LTV data' } },
      },
    },
    '/admin-dashboard/revenue-counts': {
      get: {
        tags: ['Admin Dashboard'],
        summary: 'Revenue counts',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Revenue counts' } },
      },
    },
    '/admin-dashboard/average-rating-counts': {
      get: {
        tags: ['Admin Dashboard'],
        summary: 'Average rating counts',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Rating data' } },
      },
    },

    // ---------- Customers ----------
    '/customers': {
      get: {
        tags: ['Customers'],
        summary: 'Get all customers',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Paginated list' } },
      },
      post: {
        tags: ['Customers'],
        summary: 'Add customer',
        security: [{ BearerAuth: [] }],
        description: 'Option A: body with customerId (add existing). Option B: body with firstName, lastName, phoneNumber (create new).',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  { $ref: '#/components/schemas/AddCustomerByIdBody' },
                  { $ref: '#/components/schemas/AddCustomerNewBody' },
                ],
              },
            },
          },
        },
        responses: { 200: { description: 'Customer added' } },
      },
    },
    '/customers/ten': {
      get: {
        tags: ['Customers'],
        summary: 'Get ten customers',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Latest 10' } },
      },
    },
    '/customers/status-count': {
      get: {
        tags: ['Customers'],
        summary: 'Customer status count',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Counts by status' } },
      },
    },
    '/customers/bulk-import': {
      post: {
        tags: ['Customers'],
        summary: 'Bulk import customers (CSV)',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Import result' } },
      },
    },
    '/customers/bulk': {
      delete: {
        tags: ['Customers'],
        summary: 'Remove multiple customers',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } } },
            },
          },
        },
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/customers/{id}': {
      get: {
        tags: ['Customers'],
        summary: 'Get customer by ID',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Customer details' } },
      },
      put: {
        tags: ['Customers'],
        summary: 'Update customer',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Updated' } },
      },
      delete: {
        tags: ['Customers'],
        summary: 'Remove customer',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Removed' } },
      },
    },

    // ---------- Staff ----------
    '/staff': {
      get: {
        tags: ['Staff'],
        summary: 'Get all staff',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'List' } },
      },
      post: {
        tags: ['Staff'],
        summary: 'Create staff',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Created' } },
      },
    },
    '/staff/{id}': {
      get: {
        tags: ['Staff'],
        summary: 'Get staff by ID',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Staff details' } },
      },
      put: {
        tags: ['Staff'],
        summary: 'Update staff',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Updated' } },
      },
      delete: {
        tags: ['Staff'],
        summary: 'Delete staff',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/staff/{staffId}/operating-hours': {
      get: {
        tags: ['Staff'],
        summary: 'Get staff operating hours',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'staffId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Hours' } },
      },
      post: {
        tags: ['Staff'],
        summary: 'Upsert staff operating hours',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'staffId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Upserted' } },
      },
      delete: {
        tags: ['Staff'],
        summary: 'Delete all staff operating hours',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'staffId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/staff/operating-hours/{id}': {
      put: {
        tags: ['Staff'],
        summary: 'Update one operating hour',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Updated' } },
      },
      delete: {
        tags: ['Staff'],
        summary: 'Delete one operating hour',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/staff/bulk/delete': {
      delete: {
        tags: ['Staff'],
        summary: 'Delete multiple staff',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Deleted' } },
      },
    },

    // ---------- Staff Services ----------
    '/staff/{staffId}/services': {
      get: {
        tags: ['Staff Services'],
        summary: 'Get staff services',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'staffId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'List' } },
      },
      post: {
        tags: ['Staff Services'],
        summary: 'Add/update staff service',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'staffId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Done' } },
      },
    },
    '/staff/{staffId}/services/available': {
      get: {
        tags: ['Staff Services'],
        summary: 'Get available services for staff',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'staffId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'List' } },
      },
    },
    '/staff/{staffId}/services/{serviceId}': {
      delete: {
        tags: ['Staff Services'],
        summary: 'Remove service from staff',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'staffId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'serviceId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Removed' } },
      },
    },

    // ---------- Business operating hours ----------
    '/business-operating-hours': {
      get: {
        tags: ['Business Hours'],
        summary: 'Get business operating hours',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Hours' } },
      },
      post: {
        tags: ['Business Hours'],
        summary: 'Upsert business operating hours',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Upserted' } },
      },
      delete: {
        tags: ['Business Hours'],
        summary: 'Delete all',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/business-operating-hours/{id}': {
      put: {
        tags: ['Business Hours'],
        summary: 'Update one',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Updated' } },
      },
      delete: {
        tags: ['Business Hours'],
        summary: 'Delete one',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },

    // ---------- Services ----------
    '/services': {
      get: { tags: ['Services'], summary: 'Get all services', security: [{ BearerAuth: [] }], responses: { 200: {} } },
      post: { tags: ['Services'], summary: 'Create service', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/services/{id}': {
      get: { tags: ['Services'], summary: 'Get by ID', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
      put: { tags: ['Services'], summary: 'Update', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
      delete: { tags: ['Services'], summary: 'Delete', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
    },
    '/services/bulk/delete': {
      delete: { tags: ['Services'], summary: 'Delete multiple', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },

    // ---------- Categories ----------
    '/categories': {
      get: { tags: ['Categories'], summary: 'Get all', security: [{ BearerAuth: [] }], responses: { 200: {} } },
      post: { tags: ['Categories'], summary: 'Create', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/categories/{id}': {
      get: { tags: ['Categories'], summary: 'Get by ID', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
      put: { tags: ['Categories'], summary: 'Update', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
      delete: { tags: ['Categories'], summary: 'Delete', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
    },
    '/categories/bulk/delete': {
      delete: { tags: ['Categories'], summary: 'Delete multiple', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },

    // ---------- Catalog categories ----------
    '/catalog-categories': {
      get: { tags: ['Catalog Categories'], summary: 'Get all', security: [{ BearerAuth: [] }], responses: { 200: {} } },
      post: { tags: ['Catalog Categories'], summary: 'Create', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/catalog-categories/{id}': {
      get: { tags: ['Catalog Categories'], summary: 'Get by ID', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
      put: { tags: ['Catalog Categories'], summary: 'Update', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
      delete: { tags: ['Catalog Categories'], summary: 'Delete', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
    },
    '/catalog-categories/bulk/delete': {
      delete: { tags: ['Catalog Categories'], summary: 'Delete multiple', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },

    // ---------- Suppliers ----------
    '/suppliers': {
      get: { tags: ['Suppliers'], summary: 'Get all', security: [{ BearerAuth: [] }], responses: { 200: {} } },
      post: { tags: ['Suppliers'], summary: 'Create', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/suppliers/{id}': {
      get: { tags: ['Suppliers'], summary: 'Get by ID', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
      put: { tags: ['Suppliers'], summary: 'Update', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
      delete: { tags: ['Suppliers'], summary: 'Delete', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
    },
    '/suppliers/bulk/delete': {
      delete: { tags: ['Suppliers'], summary: 'Delete multiple', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },

    // ---------- Products ----------
    '/products': {
      get: { tags: ['Products'], summary: 'Get all', security: [{ BearerAuth: [] }], responses: { 200: {} } },
      post: { tags: ['Products'], summary: 'Create', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/products/{id}': {
      get: { tags: ['Products'], summary: 'Get by ID', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
      put: { tags: ['Products'], summary: 'Update', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
      delete: { tags: ['Products'], summary: 'Delete', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
    },
    '/products/bulk/delete': {
      delete: { tags: ['Products'], summary: 'Delete multiple', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },

    // ---------- Waitlist ----------
    '/waitlist': {
      get: { tags: ['Waitlist'], summary: 'Get all', security: [{ BearerAuth: [] }], responses: { 200: {} } },
      post: { tags: ['Waitlist'], summary: 'Create', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/waitlist/{id}': {
      get: { tags: ['Waitlist'], summary: 'Get by ID', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
      put: { tags: ['Waitlist'], summary: 'Update', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
      delete: { tags: ['Waitlist'], summary: 'Delete', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
    },

    // ---------- QR ----------
    '/qr': {
      get: { tags: ['QR'], summary: 'Get QR codes', security: [{ BearerAuth: [] }], responses: { 200: {} } },
      post: { tags: ['QR'], summary: 'Create QR', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/qr/my-qr-codes': {
      get: { tags: ['QR'], summary: 'My QR codes', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/qr/analytics': {
      get: { tags: ['QR'], summary: 'QR analytics', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/qr/performance': {
      get: { tags: ['QR'], summary: 'QR performance', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/qr/{id}': {
      get: { tags: ['QR'], summary: 'Get by ID', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
      delete: { tags: ['QR'], summary: 'Delete', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
    },
    '/qr/qr/{shortCode}': {
      get: {
        tags: ['QR'],
        summary: 'Get QR by short code (public)',
        parameters: [{ name: 'shortCode', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: {} },
      },
    },
    '/qr/scan/{shortCode}': {
      post: {
        tags: ['QR'],
        summary: 'Increment scan by short code',
        parameters: [{ name: 'shortCode', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: {} },
      },
    },
    '/qr/share/{shortCode}': {
      post: {
        tags: ['QR'],
        summary: 'Increment share by short code',
        parameters: [{ name: 'shortCode', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: {} },
      },
    },
    '/qr/redirect/{id}': {
      get: {
        tags: ['QR'],
        summary: 'Redirect by QR id',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 302: { description: 'Redirect response' } },
      },
    },
    '/qr/generate-with-user-info': {
      post: { tags: ['QR'], summary: 'Generate QR with user info', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/qr/generate-whatsapp': {
      post: { tags: ['QR'], summary: 'Generate WhatsApp QR', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/qr/qr-code/{code}': {
      get: {
        tags: ['QR'],
        summary: 'Get QR by code',
        parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: {} },
      },
    },
    '/qr/{id}/analytics': {
      get: {
        tags: ['QR'],
        summary: 'Get QR analytics by id',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: {} },
      },
    },
    '/qr/{id}/share': {
      post: {
        tags: ['QR'],
        summary: 'Increment QR share count by id',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: {} },
      },
    },
    '/qr/{id}/scan': {
      post: {
        tags: ['QR'],
        summary: 'Increment QR scan count by id',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: {} },
      },
    },
    '/qr/{id}/image': {
      get: {
        tags: ['QR'],
        summary: 'Get QR image by id',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: {} },
      },
    },

    // ---------- Webhooks ----------
    '/webhooks/appointment': {
      post: { tags: ['Webhooks'], summary: 'Inbound appointment webhook (public)', responses: { 200: {} } },
    },
    '/webhooks/rating': {
      post: { tags: ['Webhooks'], summary: 'Inbound rating webhook (public)', responses: { 200: {} } },
    },
    '/webhooks/payment-checkout': {
      post: { tags: ['Webhooks'], summary: 'Inbound payment checkout webhook (public)', responses: { 200: {} } },
    },
    '/webhooks/whatsapp': {
      get: { tags: ['Webhooks'], summary: 'Verify WhatsApp webhook', responses: { 200: {} } },
      post: { tags: ['Webhooks'], summary: 'Inbound WhatsApp webhook (public)', responses: { 200: {} } },
    },
    '/webhooks/payments': {
      post: { tags: ['Webhooks'], summary: 'Create payment record', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/webhooks/payment-webhooks': {
      get: { tags: ['Webhooks'], summary: 'Get payment webhooks', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/webhooks/payment-webhooks/{id}': {
      get: { tags: ['Webhooks'], summary: 'Get by ID', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
    },
    '/webhooks/payment-webhooks/customer/{customerId}': {
      get: {
        tags: ['Webhooks'],
        summary: 'Get payment webhooks by customer ID',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'customerId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: {} },
      },
    },
    '/webhooks/appointments': {
      get: { tags: ['Webhooks'], summary: 'Get appointments', security: [{ BearerAuth: [] }], responses: { 200: {} } },
      post: { tags: ['Webhooks'], summary: 'Create appointment', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/webhooks/appointments/{id}': {
      get: { tags: ['Webhooks'], summary: 'Get appointment by ID', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
      put: { tags: ['Webhooks'], summary: 'Update appointment', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
      patch: { tags: ['Webhooks'], summary: 'Update appointment status', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
      delete: { tags: ['Webhooks'], summary: 'Delete appointment', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
    },
    '/webhooks/appointments/{id}/status': {
      patch: { tags: ['Webhooks'], summary: 'Update appointment status', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
    },
    '/webhooks/appointments/customer/{customerId}': {
      get: {
        tags: ['Webhooks'],
        summary: 'Get appointments by customer ID',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'customerId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: {} },
      },
    },
    '/webhooks/whatsapp-message': {
      post: {
        tags: ['Webhooks'],
        summary: 'Store WhatsApp message manually',
        security: [{ BearerAuth: [] }],
        responses: { 200: {} },
      },
    },

    // ---------- Support ----------
    '/support': {
      get: { tags: ['Support'], summary: 'Get support tickets', security: [{ BearerAuth: [] }], responses: { 200: {} } },
      post: { tags: ['Support'], summary: 'Create ticket', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/support/{id}': {
      get: { tags: ['Support'], summary: 'Get by ID', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
      put: { tags: ['Support'], summary: 'Update', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
      delete: { tags: ['Support'], summary: 'Delete', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } },
    },

    // ---------- Stripe ----------
    '/stripe/prices': {
      get: { tags: ['Stripe'], summary: 'Get prices', responses: { 200: {} } },
    },
    '/stripe/subscription': {
      get: { tags: ['Stripe'], summary: 'Get subscription', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/stripe/payment-methods': {
      get: { tags: ['Stripe'], summary: 'Get payment methods', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/stripe/checkout': {
      post: { tags: ['Stripe'], summary: 'Create checkout session', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/stripe/customer-portal': {
      post: { tags: ['Stripe'], summary: 'Customer portal session', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },

    // ---------- Payments (alternative) ----------
    '/payments/prices': {
      get: { tags: ['Payments'], summary: 'Get prices', responses: { 200: {} } },
    },
    '/payments/subscription': {
      get: { tags: ['Payments'], summary: 'Get subscription', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/payments/payment-methods': {
      get: { tags: ['Payments'], summary: 'Get payment methods', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },

    // ---------- WhatsApp ----------
    '/whatsapp/debug/clear-all-conversations': {
      delete: {
        tags: ['WhatsApp'],
        summary: 'Clear all WhatsApp conversation states (debug)',
        description: 'Debug-only endpoint; clears conversation state records.',
        responses: { 200: { description: 'Conversation states cleared' } },
      },
    },
    '/whatsapp/debug/conversations': {
      get: {
        tags: ['WhatsApp'],
        summary: 'Get WhatsApp conversation debug summary',
        responses: { 200: { description: 'Debug conversation summary' } },
      },
    },
    '/whatsapp/test': {
      post: {
        tags: ['WhatsApp'],
        summary: 'Send basic WhatsApp test message',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Test message sent' } },
      },
    },
    '/whatsapp/check-number': {
      post: {
        tags: ['WhatsApp'],
        summary: 'Check WhatsApp number status',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Number status returned' } },
      },
    },
    '/whatsapp/send-custom': {
      post: {
        tags: ['WhatsApp'],
        summary: 'Send custom WhatsApp message',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Custom message sent' } },
      },
    },
    '/whatsapp-messages': {
      get: { tags: ['WhatsApp'], summary: 'Get WhatsApp messages', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/whatsapp-messages/add': {
      post: { tags: ['WhatsApp'], summary: 'Report WhatsApp usage to Stripe', responses: { 200: {} } },
    },

    // ---------- Reviews ----------
    '/reviews/send-text': {
      post: { tags: ['Reviews'], summary: 'Send simple WhatsApp text to customer', responses: { 200: {} } },
    },
    '/reviews/send-rating-request': {
      post: { tags: ['Reviews'], summary: 'Send rating request to customer', responses: { 200: {} } },
    },
    '/reviews/process-rating': {
      post: { tags: ['Reviews'], summary: 'Process customer rating response', responses: { 200: {} } },
    },
    '/reviews/whatsapp-webhook': {
      post: { tags: ['Reviews'], summary: 'Handle WhatsApp review button webhook', responses: { 200: {} } },
    },
    '/reviews/add': {
      post: { tags: ['Reviews'], summary: 'Add review manually', responses: { 200: {} } },
    },

    // ---------- Business gallery ----------
    '/business-gallery': {
      get: {
        tags: ['Business Gallery'],
        summary: 'Get gallery images for logged-in user',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Gallery images list' } },
      },
    },
    '/business-gallery/upload': {
      post: {
        tags: ['Business Gallery'],
        summary: 'Upload up to 10 gallery images',
        security: [{ BearerAuth: [] }],
        description: 'Multipart form-data with images[] files.',
        responses: { 200: { description: 'Images uploaded' } },
      },
    },
    '/business-gallery/delete-multiple': {
      post: {
        tags: ['Business Gallery'],
        summary: 'Delete multiple gallery images',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Selected images deleted' } },
      },
    },
    '/business-gallery/{id}': {
      delete: {
        tags: ['Business Gallery'],
        summary: 'Delete single gallery image',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Image deleted' } },
      },
    },

    // ---------- Client permissions ----------
    '/client-permissions': {
      get: {
        tags: ['Client Permissions'],
        summary: 'Get client permissions',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Client permission settings' } },
      },
      put: {
        tags: ['Client Permissions'],
        summary: 'Create or update client permissions',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Client permissions upserted' } },
      },
    },

    // ---------- Automations ----------
    '/automations': {
      get: {
        tags: ['Automations'],
        summary: 'Get automation preferences',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Automation settings' } },
      },
      put: {
        tags: ['Automations'],
        summary: 'Create or update automation preferences',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Automation settings upserted' } },
      },
    },

    // ---------- Cron ----------
    '/cron-jobs/trigger': {
      post: {
        tags: ['Cron'],
        summary: 'Trigger customer status cron job',
        description: 'Protected by CRON_SECRET using Authorization: Bearer <secret>.',
        responses: { 200: { description: 'Cron trigger executed' }, 401: { description: 'Unauthorized cron request' } },
      },
      get: {
        tags: ['Cron'],
        summary: 'Trigger customer status cron job (GET)',
        description: 'Same trigger endpoint; accepts any HTTP method via router.all.',
        responses: { 200: { description: 'Cron trigger executed' }, 401: { description: 'Unauthorized cron request' } },
      },
    },
    '/cron-test/run-cron': {
      get: { tags: ['Cron'], summary: 'Run at-risk customer processing (test)', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/cron-test/process-lost': {
      get: { tags: ['Cron'], summary: 'Run lost customer processing (test)', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/cron-test/status-stats': {
      get: { tags: ['Cron'], summary: 'Get customer status statistics (test)', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/cron-test/recent-changes': {
      get: { tags: ['Cron'], summary: 'Get recent customer status changes (test)', security: [{ BearerAuth: [] }], responses: { 200: {} } },
    },
    '/cron-test/check-customer/{customerId}': {
      get: {
        tags: ['Cron'],
        summary: 'Check computed status for a specific customer (test)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'customerId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: {} },
      },
    },
    '/cron-test/customers/{status}': {
      get: {
        tags: ['Cron'],
        summary: 'Get customers by status (test)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'status', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: {} },
      },
    },

    // ---------- N8N test ----------
    '/n8n-test/at-risk': { post: { tags: ['N8N Test'], summary: 'Trigger n8n at-risk webhook test', responses: { 200: {} } } },
    '/n8n-test/lost': { post: { tags: ['N8N Test'], summary: 'Trigger n8n lost webhook test', responses: { 200: {} } } },
    '/n8n-test/review': { post: { tags: ['N8N Test'], summary: 'Trigger n8n review webhook test', responses: { 200: {} } } },
    '/n8n-test/recovered': { post: { tags: ['N8N Test'], summary: 'Trigger n8n recovered webhook test', responses: { 200: {} } } },
    '/n8n-test/custom': { post: { tags: ['N8N Test'], summary: 'Trigger n8n custom webhook test', responses: { 200: {} } } },

    // ---------- Public ----------
    '/public/business/{slug}': {
      get: {
        tags: ['Public'],
        summary: 'Get public business page by slug',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Public business details' } },
      },
    },
    '/public/business/{slug}/appointments': {
      get: {
        tags: ['Public'],
        summary: 'Get public appointments by business slug',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Public appointment slots/list' } },
      },
      post: {
        tags: ['Public'],
        summary: 'Create public appointment by business slug',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Appointment created' } },
      },
    },

    // ---------- Customer status ----------
    '/customer-status/statistics': {
      get: { tags: ['Customer Status'], summary: 'Get statistics', responses: { 200: {} } },
    },
    '/customer-status/status/{status}': {
      get: {
        tags: ['Customer Status'],
        summary: 'Get customers by status',
        parameters: [{ name: 'status', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: {} },
      },
    },
    '/customer-status/customer/{customerId}/update': {
      put: {
        tags: ['Customer Status'],
        summary: 'Update one customer status manually',
        parameters: [{ name: 'customerId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: {} },
      },
    },

    // ---------- Admin only (users CRUD) ----------
    '/users': {
      get: {
        tags: ['Admin Only'],
        summary: 'Get all users (admin only)',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'List of users' } },
      },
      post: {
        tags: ['Admin Only'],
        summary: 'Create user (admin only)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  role: { type: 'string', enum: ['admin', 'user'] },
                },
              },
            },
          },
        },
        responses: { 200: {} },
      },
    },
    // NOTE: '/users/{id}' is already defined above for update profile.
    // Keep a single key in object literal to avoid silent override in JavaScript.
  },
};
