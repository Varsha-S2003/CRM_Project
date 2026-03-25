# Products & Services Module - Test Scenarios & Validation

## Test Data Setup

### Scenario 1: Create a Hardware Product
```
Create Product:
├─ Name: Dell PowerEdge R750
├─ Type: Product
├─ Category: Hardware
├─ Price: $5,000
├─ Quantity: 3
├─ Vendor: Dell Inc.
├─ Location: Rack A1
└─ Low Stock Threshold: 1

Expected:
✅ Item created in DB
✅ Can query by type=product
✅ Stock field = 3
✅ Service fields undefined
✅ No linkedProductId
```

### Scenario 2: Create License Service with Linked Product
```
Prerequisites:
└─ Product from Scenario 1 exists

Create Service:
├─ Name: Microsoft Office 365 Licenses
├─ Type: Service
├─ Category: Cloud Services
├─ Price: $12/month
├─ Service Type: License
├─ Linked Product: Dell PowerEdge R750
├─ Total Licenses: 100
├─ Used Licenses: 75
├─ Expiry Date: 2025-12-31
└─ Available Licenses (calc): 25

Expected:
✅ Item created with linkedProductId
✅ Product details populated in response
✅ availableLicenses = 100 - 75 = 25
✅ Can query by type=service
✅ Stock field = 0 (cleared)
✅ Storage/Subscription fields undefined
```

### Scenario 3: Create Storage Service with Linked Product
```
Prerequisites:
└─ Product from Scenario 1 exists

Create Service:
├─ Name: Storage Service - R750 Cluster
├─ Type: Service
├─ Category: Cloud Services
├─ Price: $500/month
├─ Service Type: Storage
├─ Linked Product: Dell PowerEdge R750
├─ Total Capacity: 1000 GB
├─ Used Capacity: 650 GB
├─ Server Location: DC-1-B
└─ Available Capacity (calc): 350 GB

Expected:
✅ Item created with linkedProductId
✅ availableCapacity = 1000 - 650 = 350
✅ Response includes linked product (Dell PowerEdge R750)
✅ Pre-validation clears license/subscription fields
```

### Scenario 4: Create Subscription Service (No Linked Product)
```
Create Service:
├─ Name: AWS Enterprise Annual
├─ Type: Service
├─ Category: Cloud Services
├─ Price: $10,000/year
├─ Service Type: Subscription
├─ Linked Product: (None - optional)
├─ Billing Cycle: Yearly
├─ Start Date: 2024-03-24
├─ End Date: 2025-03-24
└─ Auto Renew: Yes

Expected:
✅ Creates successfully without linkedProductId
✅ linkedProductId = null (allowed)
✅ expiryDate = endDate = 2025-03-24
```

---

## Integration Test Cases

### Test 1: Form Rendering
```javascript
// Test: Dynamic field visibility

1. Load ItemForm with initialItem={empty}
   ✅ Type dropdown visible
   ✅ Default type = "product"
   
2. Select type = "service"
   ✅ Product fields (quantity, lowStockThreshold) hidden
   ✅ Service fields (serviceType, linkedProduct) shown
   ✅ Linked product dropdown populated with products
   
3. Select serviceType = "storage"
   ✅ Storage-specific fields visible (totalCapacity, usedCapacity)
   ✅ License/Subscription fields hidden
```

### Test 2: Linked Product Selection
```javascript
// Test: Loading and displaying linked product

1. Make request: GET /api/items?type=product
   ✅ Returns only items with type="product"
   ✅ No service items in response
   ✅ Products listed in dropdown

2. Select a product from dropdown
   ✅ Linked product details display:
      - Product name
      - Category
      - Price ($)
      - Available stock (X units)
      - Location (if available)

3. Change linked product
   ✅ Details update immediately
   ✅ Selected product ID in form state
```

### Test 3: Validation - License Service
```javascript
// Test: License field validation

1. Create service with:
   - totalLicenses: 50
   - usedLicenses: 60
   
   ❌ Error: "totalLicenses must be >= usedLicenses"

2. Fix to:
   - totalLicenses: 100
   - usedLicenses: 60
   - expiryDate: (invalid format)
   
   ❌ Error: "expiryDate must be a valid date"

3. Fix to valid date:
   
   ✅ Creation successful
   ✅ availableLicenses = 40 (calculated)
```

### Test 4: Validation - Storage Service
```javascript
// Test: Storage field validation

1. Create service with:
   - totalCapacity: 0
   
   ❌ Error: "totalCapacity must be > 0"

2. Fix to:
   - totalCapacity: 100
   - usedCapacity: 150
   
   ❌ Error: "totalCapacity must be >= usedCapacity"

3. Fix to valid:
   
   ✅ Creation successful
   ✅ availableCapacity = 50 (calculated)
```

### Test 5: Pre-Validation Field Clearing
```javascript
// Test: Type-specific field clearing

1. Create product with:
   {
     name: "Server",
     type: "product",
     quantity: 5,
     serviceType: "license",  // (should be cleared)
     totalLicenses: 100       // (should be cleared)
   }
   
   Database result:
   ✅ name: "Server"
   ✅ type: "product"
   ✅ quantity: 5
   ✅ serviceType: undefined
   ✅ totalLicenses: undefined
   ✅ linkedProductId: null

2. Create service with:
   {
     name: "Storage",
     type: "service",
     stock: 10,  // (should be cleared)
     serviceType: "storage",
     totalCapacity: 100
   }
   
   Database result:
   ✅ name: "Storage"
   ✅ type: "service"
   ✅ stock: 0 (cleared)
   ✅ serviceType: "storage"
   ✅ totalCapacity: 100
```

### Test 6: Products List Display
```javascript
// Test: Table rendering with linked products

1. Navigate to Products page
   ✅ Table headers include "Linked Product" column
   ✅ Column 6: Linked Product

2. Products show "-" in linked product column
   ✅ No linked product for products

3. Services show linked product name (if linked)
   ✅ License service shows: "Dell PowerEdge R750"
   ✅ Unlinked subscription shows: "-"

4. Click Edit on service with linked product
   ✅ Form loads with linked product selected
   ✅ Product details display in form
```

### Test 7: Linked Product Reference Integrity
```javascript
// Test: Referential integrity

1. Create service with linkedProductId="INVALID_ID"
   ❌ Error: "linkedProductId must be a valid product ID"

2. Create service with linkedProductId pointing to another service
   ❌ Error: "linkedProductId must reference a Product item"

3. Create service with valid linkedProductId
   ✅ Success
   ✅ Linked product hydrated in response

4. Edit service and change linkedProductId
   ✅ Pre-validation validates new reference
   ✅ Updates successfully
```

### Test 8: Role-Based Access
```javascript
// Test: Permission enforcement

1. EMPLOYEE user:
   - GET /api/items → ✅ Allowed
   - GET /api/items/:id → ✅ Allowed
   - POST /api/items → ❌ Forbidden (lacks MANAGER/ADMIN)
   - PUT /api/items/:id → ❌ Forbidden
   - DELETE /api/items/:id → ❌ Forbidden

2. MANAGER user:
   - GET /api/items → ✅ Allowed
   - POST /api/items → ✅ Allowed
   - PUT /api/items/:id → ✅ Allowed
   - DELETE /api/items/:id → ❌ Forbidden (only ADMIN)

3. ADMIN user:
   - All endpoints → ✅ Allowed
```

### Test 9: Search & Filter
```javascript
// Test: Query parameters

1. GET /api/items?search=storage
   ✅ Returns items with "storage" in name/category/serviceType
   ✅ Both products and services returned

2. GET /api/items?search=storage&type=service
   ✅ Returns only services matching "storage"

3. GET /api/items?type=product
   ✅ Returns only products
   ✅ No services in response
   ✅ Can be used for dropdown population

4. GET /api/items?search=nonexistent
   ✅ Returns empty array
```

### Test 10: Calculations (Virtual Fields)
```javascript
// Test: Virtual field calculations

Scenario: Create license service
- totalLicenses: 100
- usedLicenses: 65

Response in GET request:
✅ availableLicenses: 35 (calculated, not stored)

Scenario: Create storage service
- totalCapacity: 500
- usedCapacity: 200

Response in GET request:
✅ availableCapacity: 300 (calculated, not stored)

Scenario: Create product
- stock: 25

Response in GET request:
✅ quantity: 25 (virtual getter for stock)
```

---

## Load Testing Checklist

- [ ] Create 1000+ items and verify performance
- [ ] Search with complex queries across items
- [ ] Verify linkedProductId population under load
- [ ] Check database connection pooling
- [ ] Monitor memory usage with large result sets
- [ ] Test pagination (if implemented)
- [ ] Verify index usage on type, category fields

---

## Security Testing Checklist

- [ ] Verify token validation on all protected routes
- [ ] Test SQL/NoSQL injection attempts
- [ ] Verify ObjectId validation prevents invalid references
- [ ] Test role-based access on all endpoints
- [ ] Verify linkedProductId cannot create circular references
- [ ] Test rate limiting (if implemented)
- [ ] Verify sensitive fields not exposed in responses

---

## Browser Compatibility Testing

- [ ] Chrome/Edge (Latest)
- [ ] Firefox (Latest)
- [ ] Safari (Latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)
- [ ] Form responsiveness on < 768px width
- [ ] Table scrolling on small screens

---

## Regression Testing Points

When making future changes, verify:
1. Type-specific fields still get cleared properly
2. Virtual fields (availableLicenses, availableCapacity) calculate correctly
3. LinkedProductId validation still works
4. Products-only query (`?type=product`) still works
5. Pre-validation hook executes before save
6. Linked product details populate in responses
7. Form dynamically shows/hides fields
8. Role-based access still enforced

