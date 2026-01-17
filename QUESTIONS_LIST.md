# Questions List - Feature Requirements & Role Permissions

**Date:** 16-01-2026  
**Project:** Plusfive Backend & Frontend

---

## 📋 Questions for Decision

### 1. Category Management - Role Permissions

**Question:**  
Category Management [CRUD operations set for Admin only]. (User can only GET categories)

**Detail:**  
- Current Implementation: Admin has full CRUD (Create, Read, Update, Delete)
- Current User Access: Users can only GET/view categories

**Decision Required:**  
- [ ] Should Users have CRUD operations for Categories?
  - If YES: I can implement Category CRUD operations for User role
  - If NO: Keep current implementation (Admin only for CRUD, Users can only view)

**Impact:**  
- If enabled for Users: Users can create, edit, and delete their own categories
- If disabled: Users can only view categories created by Admin

---

### 2. Suppliers Management - Importance & Role Permissions

**Question:**  
Are Suppliers important for Users? If yes, I can make API and integrate in frontend.

**Decision Required:**  
- [ ] Are Suppliers needed for Users?
  - [ ] If YES: 
    - [ ] Set API permissions for Admin Role only?
    - [ ] Set API permissions for User Role only?
    - [ ] Set API permissions for both Admin and User Roles?
  - [ ] If NO: Suppliers feature not needed

**Current Status:**  
- [ ] Suppliers API exists?
- [ ] Suppliers API integrated in frontend?
- [ ] Suppliers feature implemented?

**Impact:**  
- If enabled: Users/Admins can manage suppliers (create, view, edit, delete)
- If disabled: Suppliers feature will not be developed

---

### 3. Catalog Management - Importance & Role Permissions

**Question:**  
Are Catalogs important for Users? If yes, I can make API and integrate in frontend.

**Decision Required:**  
- [ ] Are Catalogs needed for Users?
  - [ ] If YES:
    - [ ] Set API permissions for Admin Role only?
    - [ ] Set API permissions for User Role only?
    - [ ] Set API permissions for both Admin and User Roles?
  - [ ] If NO: Catalog feature not needed

**Current Status:**  
- [ ] Catalog API exists?
- [ ] Catalog API integrated in frontend?
- [ ] Catalog feature implemented?

**Impact:**  
- If enabled: Users/Admins can manage catalogs (create, view, edit, delete)
- If disabled: Catalog feature will not be developed

---

### 4. Usage & Purpose of Suppliers and Catalog

**Question:**  
What are the usage scenarios for Suppliers and Catalog in the application?

**Decision Required:**  
Please provide detailed usage scenarios:

#### Suppliers Usage:
- [ ] What is the primary purpose of Suppliers?
  - Example: Managing vendor/supplier information for inventory?
  - Example: Tracking supplier details for ordering?
  - Example: Other purpose: _______________________

- [ ] How do Suppliers relate to other features?
  - [ ] Related to Services?
  - [ ] Related to Products/Inventory?
  - [ ] Related to Orders/Purchases?
  - [ ] Other: _______________________

- [ ] What operations are needed?
  - [ ] Create/Add suppliers
  - [ ] View/List suppliers
  - [ ] Edit/Update supplier details
  - [ ] Delete/Remove suppliers
  - [ ] Search/Filter suppliers
  - [ ] Import/Export suppliers
  - [ ] Other: _______________________

#### Catalog Usage:
- [ ] What is the primary purpose of Catalog?
  - Example: Product/service catalog for clients?
  - Example: Service menu catalog?
  - Example: Other purpose: _______________________

- [ ] How do Catalogs relate to other features?
  - [ ] Related to Services?
  - [ ] Related to Categories?
  - [ ] Related to Products/Items?
  - [ ] Related to Bookings/Appointments?
  - [ ] Other: _______________________

- [ ] What operations are needed?
  - [ ] Create/Add catalog items
  - [ ] View/List catalog items
  - [ ] Edit/Update catalog items
  - [ ] Delete/Remove catalog items
  - [ ] Search/Filter catalog items
  - [ ] Publish/Unpublish catalog
  - [ ] Import/Export catalog
  - [ ] Other: _______________________

---

## 📊 Summary Table

| Feature | Current Status | Admin Access | User Access | Decision Required | Priority |
|---------|---------------|--------------|-------------|-------------------|----------|
| **Categories** | ✅ Implemented | Full CRUD | GET only | Extend CRUD to Users? | - |
| **Suppliers** | ❓ TBD | ❓ TBD | ❓ TBD | Needed? What permissions? | ❓ |
| **Catalog** | ❓ TBD | ❓ TBD | ❓ TBD | Needed? What permissions? | ❓ |

---

## 🎯 Action Items

Once decisions are made, I will:

1. **If Category CRUD for Users approved:**
   - Implement User role permissions for Category CRUD operations
   - Update API routes with proper role checks
   - Integrate User category management UI in frontend

2. **If Suppliers approved:**
   - Design Suppliers data model/API structure
   - Create Suppliers API endpoints with role-based permissions
   - Build Suppliers management UI in frontend
   - Integrate Suppliers with related features (if applicable)

3. **If Catalog approved:**
   - Design Catalog data model/API structure
   - Create Catalog API endpoints with role-based permissions
   - Build Catalog management UI in frontend
   - Integrate Catalog with related features (if applicable)

---

## 📝 Notes

- All API endpoints will follow existing authentication and authorization patterns
- Role-based access control (RBAC) will be implemented using existing middleware
- Frontend integration will follow existing UI/UX patterns and component structure
- All features will support internationalization (English and Hebrew)

---

**Status:** ⏳ Waiting for decisions  
**Next Steps:** Review questions above and provide decisions/answers
