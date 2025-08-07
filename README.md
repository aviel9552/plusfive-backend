# PlusFive Backend API

A complete backend API solution built with Express.js, PostgreSQL, and Prisma ORM.

## Features

- 🔐 **Authentication** - JWT-based authentication
- 💳 **Payment Processing** - Order and payment management
- 📱 **QR Code Management** - Create and manage QR codes
- 🎫 **Support System** - Ticket-based support system
- 🗄️ **Database** - PostgreSQL with Prisma ORM
- ✅ **Validation** - Zod schema validation
- 🔒 **Security** - Password hashing, CORS, rate limiting

## Tech Stack

- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT
- **Validation**: Zod
- **Language**: JavaScript

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

Copy the environment file and configure your variables:

```bash
cp env.example .env
```

Update the `.env` file with your configuration:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/plusfive_db"

# JWT
JWT_SECRET="your-jwt-secret-here"

# Server
PORT=3000
NODE_ENV="development"
```

### 3. Database Setup

Generate Prisma client:

```bash
npm run db:generate
```

Run database migrations:

```bash
npm run db:migrate
```

Seed the database with sample data:

```bash
npm run db:seed
```

### 4. Start Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:3000`

## API Endpoints

### Authentication

#### Register User
```
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+1234567890",
  "businessName": "My Business",
  "businessType": "Technology",
  "address": "123 Business St",
  "whatsappNumber": "+1234567890",
  "directChatMessage": "Hello! How can I help you?"
}
```

#### Login User
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### Users

#### Get User Profile
```
GET /api/users/profile
Authorization: Bearer <token>
```

#### Update User Profile
```
PUT /api/users/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+1234567890"
}
```

### Orders

#### Get Orders
```
GET /api/orders?page=1&limit=10&status=completed
Authorization: Bearer <token>
```

#### Create Order
```
POST /api/orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 99.99,
  "currency": "USD",
  "description": "Premium Plan",
  "metadata": {}
}
```

#### Get Order by ID
```
GET /api/orders/{id}
Authorization: Bearer <token>
```

#### Update Order
```
PUT /api/orders/{id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "completed",
  "description": "Updated description"
}
```

#### Delete Order
```
DELETE /api/orders/{id}
Authorization: Bearer <token>
```

### Payments

#### Get Payments
```
GET /api/payments?page=1&limit=10&status=completed
Authorization: Bearer <token>
```

#### Create Payment
```
POST /api/payments
Authorization: Bearer <token>
Content-Type: application/json

{
  "orderId": "order_id",
  "amount": 99.99,
  "currency": "USD",
  "paymentMethod": "stripe",
  "transactionId": "txn_123456"
}
```

### QR Codes

#### Get QR Codes
```
GET /api/qr?page=1&limit=10&isActive=true
Authorization: Bearer <token>
```

#### Create QR Code
```
POST /api/qr
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Business Card QR",
  "url": "https://example.com/business-card",
  "qrData": "https://example.com/business-card"
}
```

#### Get QR Code by ID
```
GET /api/qr/{id}
Authorization: Bearer <token>
```

#### Update QR Code
```
PUT /api/qr/{id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated QR Name",
  "isActive": false
}
```

#### Delete QR Code
```
DELETE /api/qr/{id}
Authorization: Bearer <token>
```

### Support Tickets

#### Get Support Tickets
```
GET /api/support?page=1&limit=10&status=open&priority=high
Authorization: Bearer <token>
```

#### Create Support Ticket
```
POST /api/support
Authorization: Bearer <token>
Content-Type: application/json

{
  "subject": "Payment Issue",
  "description": "I am having trouble with my payment.",
  "priority": "high",
  "category": "billing"
}
```

#### Get Support Ticket by ID
```
GET /api/support/{id}
Authorization: Bearer <token>
```

#### Update Support Ticket
```
PUT /api/support/{id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "in_progress",
  "priority": "high"
}
```

#### Delete Support Ticket
```
DELETE /api/support/{id}
Authorization: Bearer <token>
```

## Database Schema

### Users
- Basic user information
- Business details
- Authentication data

### Orders
- Order management
- Payment tracking
- Status management

### Payments
- Payment processing
- Transaction tracking
- Multiple payment methods

### QR Codes
- QR code generation
- URL management
- Usage tracking

### Support Tickets
- Ticket management
- Priority levels
- Status tracking

## Development Commands

```bash
# Development
npm run dev

# Production
npm start

# Database commands
npm run db:generate    # Generate Prisma client
npm run db:migrate     # Run migrations
npm run db:push        # Push schema to database
npm run db:studio      # Open Prisma Studio
npm run db:seed        # Seed database
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `PORT` | Server port | No (default: 3000) |
| `NODE_ENV` | Environment | No (default: development) |

## Testing

The database seed creates a test user with the following credentials:

- **Email**: test@example.com
- **Password**: password123

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- Input validation with Zod
- CORS configuration
- Rate limiting
- Helmet security headers

## Project Structure

```
├── server.js              # Main Express server
├── package.json           # Dependencies and scripts
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── seed.js          # Database seeding
├── lib/
│   ├── prisma.js        # Prisma client
│   ├── utils.js         # Utility functions
│   └── validations.js   # Zod validation schemas
├── middleware/
│   ├── auth.js          # JWT authentication
│   └── validation.js    # Request validation
├── routes/
│   ├── auth.js          # Authentication routes
│   ├── users.js         # User routes
│   ├── orders.js        # Order routes
│   ├── payments.js      # Payment routes
│   ├── qr.js           # QR code routes
│   └── support.js      # Support ticket routes
└── README.md           # Documentation
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License 