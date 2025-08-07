# QR Code Share Count API

## Overview
Share count functionality has been added to track how many times a QR code has been shared by users.

## Database Schema Changes
- Added `shareCount` field to `QRCode` model
- Default value: 0
- Type: Integer

## API Endpoints

### 1. Increment Share Count
**POST** `/api/qr/:id/share`

Increments the share count for a specific QR code.

**Headers:**
```
Authorization: Bearer <token>
```

**Parameters:**
- `id` (path parameter): QR code ID

**Response:**
```json
{
  "success": true,
  "data": {
    "qrCode": {
      "id": "qr_code_id",
      "userId": "user_id",
      "name": "QR Code Name",
      "url": "qr_url",
      "qrData": "qr_data",
      "qrCodeImage": "base64_image",
      "isActive": true,
      "scanCount": 0,
      "shareCount": 1,
      "createdAt": "2025-08-07T06:16:30.000Z",
      "updatedAt": "2025-08-07T06:16:30.000Z"
    },
    "message": "Share count incremented successfully"
  }
}
```

**Error Responses:**
- `404`: QR code not found
- `401`: Unauthorized
- `500`: Internal server error

## Usage Examples

### Frontend Integration
```javascript
// Increment share count when user shares QR code
const incrementShareCount = async (qrCodeId) => {
  try {
    const response = await fetch(`/api/qr/${qrCodeId}/share`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    if (data.success) {
      console.log('Share count incremented:', data.data.qrCode.shareCount);
    }
  } catch (error) {
    console.error('Error incrementing share count:', error);
  }
};
```

### Backend Integration
```javascript
// In your QR code sharing logic
const shareQRCode = async (req, res) => {
  try {
    const { qrCodeId } = req.body;
    
    // Increment share count
    await incrementShareCount(qrCodeId);
    
    // Your sharing logic here
    // ...
    
    return successResponse(res, { message: 'QR code shared successfully' });
  } catch (error) {
    return errorResponse(res, 'Error sharing QR code', 500);
  }
};
```

## Database Migration
The migration `20250807061630_add_share_count` has been applied to add the `shareCount` field to the `qr_codes` table.

## Notes
- Share count is automatically initialized to 0 for new QR codes
- Only QR code owners or admins can increment share count
- Share count is separate from scan count (which tracks QR code scans)
- The field is included in all QR code responses from existing endpoints 