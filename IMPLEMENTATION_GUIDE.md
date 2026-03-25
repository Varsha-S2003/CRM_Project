# Products & Services Module - Complete Implementation Guide

## Overview
This document outlines the complete, production-ready implementation of a scalable Products & Services module for your MERN stack CRM system. The module handles both physical infrastructure products and non-inventory services with optional product linking.

---

## 1. ARCHITECTURE & DESIGN PRINCIPLES

### Data Model
- **Single Collection**: Uses a unified `Item` collection with a `type` field (`product` | `service`)
- **Smart Field Management**: Automatically clears type-specific fields during validation to prevent data pollution
- **Virtual Fields**: Uses Mongoose virtuals for calculated values (quantity, availableLicenses, availableCapacity)
- **Referential Integrity**: Services can optionally reference Products via `linkedProductId`

### Key Features
✅ Products with inventory tracking  
✅ Services: License, Storage, Subscription types  
✅ Optional product-to-service linking  
✅ Dynamic form rendering based on type  
✅ Automatic capacity/license calculations  
✅ Role-based access control (ADMIN, MANAGER, EMPLOYEE)  
✅ Alert system for low stock, expiring licenses, near-capacity storage  

---

## 2. BACKEND IMPLEMENTATION

### MongoDB Schema (Item Model)
**Location**: `backend/models/item.js`

#### Core Fields
```javascript
{
  // Type Management
  type: "product" | "service",
  
  // Common Fields
  name: String (required),
  category: String (required),
  price: Number (required, min: 0),
  vendor: String,
  location: String,
  description: String,
  lowStockThreshold: Number (default: 5),
  
  // Product-Specific
  stock: Number (quantity for products),
  
  // Service-Specific
  serviceType: "license" | "storage" | "subscription",
  linkedProductId: ObjectId (reference to Product),
  
  // License Service
  totalLicenses: Number,
  usedLicenses: Number,
  expiryDate: Date,
  
  // Storage Service
  totalCapacity: Number,
  usedCapacity: Number,
  serverLocation: String,
  
  // Subscription Service
  billingCycle: "monthly" | "yearly",
  startDate: Date,
  endDate: Date,
  autoRenew: Boolean,
  
  // Timestamps & SKU
  sku: String,
  timestamps: true
}
```

#### Virtual Fields
- `quantity`: Exposes `stock` without storing separately
- `availableLicenses`: Calculates `totalLicenses - usedLicenses`
- `availableCapacity`: Calculates `totalCapacity - usedCapacity`

#### Pre-Validation Hook
The schema includes a `pre("validate")` hook that:
- Clears service-only fields for products
- Clears product-only fields for services
- Ensures `linkedProductId` is only used for services
- Validates field consistency based on type

### Express API Endpoints
**Location**: `backend/routes/itemRoutes.js` & `backend/controllers/itemController.js`

#### Routes
```javascript
POST   /api/items                    // Create item (ADMIN, MANAGER)
GET    /api/items                    // List items with filters (ADMIN, MANAGER, EMPLOYEE)
GET    /api/items?type=product       // Get only products (for dropdowns)
GET    /api/items/:id                // Get single item (ADMIN, MANAGER, EMPLOYEE)
PUT    /api/items/:id                // Update item (ADMIN, MANAGER)
DELETE /api/items/:id                // Delete item (ADMIN)
```

#### Query Parameters
- `type`: Filter by type (`product` | `service`)
- `search`: Full-text search on name, category, vendor, serviceType, sku

#### Response Enhancement
- All endpoints populate `linkedProductId` with product details (name, category, price, stock, vendor, location)
- Automatic calculation of virtual fields in responses

#### Validation Logic
The controller implements comprehensive validation:

**Product-Specific**:
- Quantity is required and must be ≥ 0

**License Service**:
- `totalLicenses` required and ≥ 0
- `usedLicenses` must be ≤ `totalLicenses`
- `expiryDate` must be valid

**Storage Service**:
- `totalCapacity` required and > 0
- `usedCapacity` must be ≤ `totalCapacity`

**Subscription Service**:
- `billingCycle` must be "monthly" or "yearly"
- `startDate` and `endDate` must be valid
- `startDate` cannot be after `endDate`

**Linked Product**:
- Must reference a valid Item with `type: "product"`
- Validation ensures referential integrity

---

## 3. FRONTEND IMPLEMENTATION

### Form Component
**Location**: `frontend/src/components/ItemForm.js`

#### Features
- **Dynamic Rendering**: Shows/hides fields based on type and serviceType
- **Products Fetching**: Automatically loads available products for linking
- **Linked Product Display**: Shows selected linked product details (name, category, price, stock, location)
- **Real-time Calculations**: Shows available licenses and capacity automatically
- **State Normalization**: Handles both create and edit modes with proper form state

#### Form Structure

```
┌─ Common Section
│  └─ Type Selector (Product | Service)
│
├─ If TYPE = PRODUCT
│  ├─ Product Basic Info
│  │  ├─ Product Name
│  │  ├─ Category (dropdown)
│  │  ├─ Price
│  │  └─ Vendor
│  ├─ Additional Details
│  │  ├─ Location
│  │  └─ Description
│  └─ Inventory
│     ├─ Quantity (required)
│     └─ Low Stock Threshold
│
└─ If TYPE = SERVICE
   ├─ Service Basic Info
   │  ├─ Service Name
   │  ├─ Category (dropdown)
   │  ├─ Price
   │  └─ Description
   ├─ Service Type Selector
   │  └─ License | Storage | Subscription
   ├─ Linked Product (Optional)
   │  ├─ Product Dropdown
   │  └─ Product Details Display
   │
   ├─ If SERVICE TYPE = LICENSE
   │  ├─ Total Licenses (required)
   │  ├─ Used Licenses (required)
   │  ├─ Available Licenses (calculated, disabled)
   │  └─ Expiry Date
   │
   ├─ If SERVICE TYPE = STORAGE
   │  ├─ Total Capacity (required)
   │  ├─ Used Capacity (required)
   │  ├─ Available Capacity (calculated, disabled)
   │  └─ Server Location
   │
   └─ If SERVICE TYPE = SUBSCRIPTION
      ├─ Billing Cycle (Monthly | Yearly)
      ├─ Auto Renew (Yes | No)
      ├─ Start Date (required)
      └─ End Date (required)
```

#### Key Functions
- `normalizeForForm()`: Converts API response to form state
- `toPayload()`: Converts form state to API request format
- `useEffect()`: Fetches products on component mount
- `useMemo()`: Calculates available licenses/capacity
- Handlers for type/serviceType changes trigger field re-validation

### Products List Component
**Location**: `frontend/src/Products.js`

#### Features
- **Unified List**: Shows both products and services in one table
- **Type Filtering**: Filter by type (All, Product, Service)
- **Category Filtering**: Filter by category
- **Search**: Full-text search across name, category, type
- **Alert System**: Shows status badges with:
  - Products: In Stock, Low Stock, Out of Stock
  - Licenses: Available Licenses count, Low Licenses alert
  - Storage: Available Capacity %, Low Capacity alert
  - Subscriptions: Days left, Near Expiry alert

#### Table Columns
| Column | Display | Notes |
|--------|---------|-------|
| Name | Item name | Linked product name shown for services |
| Type | "Product" \| "Service" | Visual distinction |
| Category | Category name | Hardware, Cloud Services, etc. |
| Price | Formatted currency | Standard USD format |
| Status | Badge with alert | Color-coded (green/yellow/red) |
| Created | Formatted date | MM/DD/YYYY |
| Actions | Edit / Delete | Based on user role |

#### Role-Based Access
- **ADMIN**: View, Create, Edit, Delete
- **MANAGER**: View, Create, Edit
- **EMPLOYEE**: View Only

### Product Linking Feature
**Location**: `frontend/src/components/ItemForm.js` (lines 274-295)

#### How It Works
1. When form type is "service", displays optional "Link to Product" dropdown
2. Dropdown populates with GET `/api/items?type=product`
3. When a product is selected, displays:
   - Product name
   - Category
   - Price
   - Available stock
   - Location (if available)
4. Linked product details update in real-time
5. On save, `linkedProductId` is included in payload

#### Benefits
- Services can reference products (e.g., storage service on specific server)
- Automatic product details display
- Improves data consistency and relationship tracking

---

## 4. STYLING & UI

### CSS Classes
**Location**: `frontend/src/Products.css`

#### New Classes
```css
.linked-product-cell {
  /* Table cell for linked product name */
  font-size: 13px;
  color: #6366f1;
  font-weight: 500;
}

.linked-product-info {
  /* Container for linked product details display */
  margin-top: 8px;
  padding: 12px;
  background: #f0f4ff;
  border-left: 3px solid #6366f1;
  border-radius: 4px;
}

.linked-product-details {
  /* Details list wrapper */
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-row {
  /* Individual detail row */
  font-size: 13px;
  color: #334155;
}

.detail-row strong {
  /* Label in detail row */
  font-weight: 600;
  color: #1a1a2e;
  margin-right: 6px;
}
```

#### Existing Classes (Reused)
- `.form-section`: Section headers and containers
- `.form-row-zoho`: Grid layout for form fields
- `.form-group`: Individual form field wrapper
- `.disabled-input`: Read-only calculated fields
- `.modal-form-zoho`: Modal form styling
- `.stock-badge`: Status indicators (in-stock, low-stock, out-of-stock)

#### Theme Integration
- Uses Elogixa palette variables (`--theme-*`)
- Maintains brand consistency with existing UI
- Responsive design for mobile/tablet

---

## 5. VALIDATION & ERROR HANDLING

### Frontend Validation
1. **Required Fields**: HTML5 required attribute
2. **Type Validation**: Number inputs with min/max
3. **Conditional Validation**: Fields shown/hidden based on type
4. **Business Logic**: 
   - Used ≤ Total (licenses/capacity)
   - Start Date ≤ End Date (subscriptions)
   - Quantity required for products

### Backend Validation
```javascript
// Runs on create and update
buildItemPayload(req.body)
  ├─ Common validation
  │  ├─ name and category required
  │  ├─ price is valid number ≥ 0
  │  └─ lowStockThreshold ≥ 0
  ├─ Product validation
  │  └─ quantity required and ≥ 0
  └─ Service validation
     ├─ serviceType required
     ├─ linkedProductId validation (if provided)
     └─ Type-specific validation (license/storage/subscription)
```

### Error Responses
All validation errors return HTTP 400 with message array:
```json
{
  "message": "name and category are required. price must be a non-negative number."
}
```

---

## 6. WORKFLOW EXAMPLES

### Create Product
```
User → Add Item → Select "Product" → Fill Product Form → Submit
         → API POST /api/items
            → Validate: name, category, price, quantity required
            → Clear service fields (setServiceType=undefined, etc.)
            → Create in MongoDB
         → Success → Refresh list
```

### Create Service with Linked Product
```
User → Add Item → Select "Service" → Fill Service Form
         → Select Service Type (e.g., "Storage")
         → Select Linked Product from dropdown
         → Product details appear (stock, price, capacity, etc.)
         → Fill storage-specific fields
         → Submit
         → API POST /api/items
            → Validate: serviceType, totalCapacity required
            → Validate: linkedProductId references a product
            → Clear product/unused service fields
            → Create in MongoDB
         → Success → Table shows linked product name
```

### Update Service
```
User → Edit Service → Form loads with current data
         → linkedProductId auto-populated with product details
         → Can change: name, price, serviceType, linked product
         → Submit
         → API PUT /api/items/:id
            → Merge existing + new data
            → Re-validate complete payload
            → Update in MongoDB (pre-validate runs)
         → Success → Refresh list
```

### Query Only Products (for Dropdown)
```
Frontend → GET /api/items?type=product
           → API filters: {type: "product"}
           → Returns product array only
           → Populate select dropdown in ItemForm
```

---

## 7. KEY IMPROVEMENTS & BEST PRACTICES

### ✅ Separation of Concerns
- Products and services separate at data, logic, and UI levels
- Pre-validation hooks ensure field cleanliness
- Controllers handle validation before DB operations

### ✅ User Experience
- Dynamic form adapts to selection (type/serviceType)
- Real-time calculations for available resources
- Linked product details visible without extra clicks
- Clear status indicators (badges with color coding)
- Responsive design for all screen sizes

### ✅ Data Integrity
- Mongoose validation prevents invalid state in DB
- Referential integrity via ObjectId references
- Pre-validation hook ensures consistency
- Custom validators check business rules

### ✅ Performance
- Virtual fields avoid duplicate data
- Query population fetches linked products in one request
- Indexed timestamps for sorting
- Efficient filtering and search

### ✅ Security
- Role-based access control (ADMIN, MANAGER, EMPLOYEE)
- Token-based authentication on all routes
- Input validation prevents injection attacks
- ObjectId validation for references

### ✅ Scalability
- Single collection scales better than separate collections
- Schema design allows future service types without migration
- Query filters support complex reporting
- Virtuals provide computed fields without storage overhead

---

## 8. DATABASE QUERIES

### Get All Items with Products Populated
```javascript
GET /api/items
Response: [{
  _id: "...",
  name: "Premium Storage",
  type: "service",
  serviceType: "storage",
  linkedProductId: {
    _id: "...",
    name: "Server Cabinet A",
    category: "Hardware",
    price: 5000,
    stock: 2
  }
}]
```

### Get Only Products
```javascript
GET /api/items?type=product
Response: [{
  _id: "...",
  name: "Server Cabinet A",
  type: "product",
  category: "Hardware",
  price: 5000,
  stock: 2
}]
```

### Search and Filter
```javascript
GET /api/items?search=storage&type=service
// Searches in: name, category, vendor, serviceType, sku
// Filters by: type="service"
```

---

## 9. FUTURE ENHANCEMENTS

Potential additions to consider:
- [ ] Bulk upload (CSV import)
- [ ] Export to Excel/PDF
- [ ] Advanced reporting (usage trends, ROI)
- [ ] Audit trail (who modified what/when)
- [ ] Service dependency tracking
- [ ] Capacity forecasting for storage services
- [ ] License compliance reporting
- [ ] Automatic renewal reminders
- [ ] Cost analysis by category
- [ ] Depreciation tracking for products

---

## 10. TROUBLESHOOTING

### Issue: Form doesn't show linked product dropdown
- Check: `GET /api/items?type=product` returns products
- Check: localStorage token is valid
- Check: User role has permission to view items

### Issue: Linked product validation fails
- Check: LinkedProductId is valid ObjectId format
- Check: Referenced item exists and has `type: "product"`
- Check: No circular references

### Issue: Calculated fields show wrong values
- Check: Total value is greater than used value (licenses/capacity)
- Check: Form is properly normalized on initial load
- Reload page if virtuals not calculated

### Issue: Pre-validation clears unexpected fields
- Check: Item type is correctly set before save
- Check: Service type is valid before save
- This is intentional behavior to prevent data pollution

---

## 11. FILE STRUCTURE

```
CRM_Project/
├── backend/
│  ├── models/
│  │  └── item.js (UPDATED - added linkedProductId)
│  ├── controllers/
│  │  └── itemController.js (UPDATED - added linked product handling)
│  ├── routes/
│  │  └── itemRoutes.js (existing - no changes)
│  └── server.js (existing - routes registered)
│
└── frontend/
   ├── src/
   │  ├── components/
   │  │  └── ItemForm.js (UPDATED - added linked product selector)
   │  ├── Products.js (UPDATED - added linked product column)
   │  └── Products.css (UPDATED - added linked product styles)
```

---

## 12. VERSION HISTORY

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Mar 24, 2026 | Initial implementation with linked products feature |

---

**Last Updated**: March 24, 2026  
**Status**: Production Ready  
**License**: Proprietary
