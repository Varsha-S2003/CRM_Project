# Architecture & Data Flow Diagrams

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     REACT FRONTEND                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐              ┌──────────────────┐         │
│  │  Products.js     │              │  ItemForm.js     │         │
│  │  (List View)     │◄────────────►│  (Modal Form)    │         │
│  └──────────────────┘              └──────────────────┘         │
│         ▲                                    ▲                    │
│         │                                    │                    │
│         │ GET /api/items                    │ GET /api/items?type=product
│         │ PUT /api/items/:id                │ POST /api/items
│         │ DELETE /api/items/:id             │ PUT /api/items/:id
│         │ GET /api/items?type=...           │                    │
│         │                                    │                    │
├─────────────│──────────────────────────────│────────────────────┤
│             │   AXIOS HTTP CLIENT          │                    │
├─────────────┼──────────────────────────────┼────────────────────┤
│             ▼                              ▼                    │
│  ┌──────────────────────────────────────────────┐              │
│  │  Authentication & Request Headers            │              │
│  │  - Bearer Token Validation                   │              │
│  │  - Content-Type: application/json            │              │
│  └──────────────────────────────────────────────┘              │
│                                                                   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                    HTTP/HTTPS │ REST API
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   EXPRESS.JS BACKEND                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              itemRoutes.js (5 endpoints)                  │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │  POST   /api/items                                         │ │
│  │  GET    /api/items (with filters)                         │ │
│  │  GET    /api/items/:id                                    │ │
│  │  PUT    /api/items/:id                                    │ │
│  │  DELETE /api/items/:id                                    │ │
│  └─────────────────────────┬────────────────────────────────┘ │
│                            │                                    │
│                            ▼                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │         itemController.js (Business Logic)                │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │  ├─ buildItemPayload()     [Validation]                  │ │
│  │  ├─ parseObjectId()        [LinkedProduct Resolution]   │ │
│  │  ├─ createItem()           [Create with validation]     │ │
│  │  ├─ getItems()             [Populate linkedProduct]    │ │
│  │  ├─ getItemById()          [Populate linkedProduct]    │ │
│  │  ├─ updateItem()           [Update with validation]     │ │
│  │  └─ deleteItem()           [Delete item]               │ │
│  └─────────────────────────┬────────────────────────────────┘ │
│                            │                                    │
│                            ▼                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │      Middleware                                           │ │
│  │  - authMiddleware (verifyToken)                          │ │
│  │  - authorize (permit ADMIN/MANAGER/EMPLOYEE)            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                            │                                    │
└────────────────────────────┼────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   MONGOOSE MODELS                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────┐ │
│  │         Item Schema (item.js)                            │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │  Core Fields:        Virtual Fields:                      │ │
│  │  - name              - quantity (getter/setter)          │ │
│  │  - type ◄────        - availableLicenses (calc)          │ │
│  │  - category          - availableCapacity (calc)          │ │
│  │  - price                                                  │ │
│  │  - stock             Pre-Validation Hook:                │ │
│  │  - vendor            - Clear service fields for products │ │
│  │  - location          - Clear product fields for services │ │
│  │  - linkedProductId ◄─ - Clear linkedProductId for products
│  │                      - Clear unused service fields       │ │
│  │  Service Fields:                                          │ │
│  │  - serviceType                                           │ │
│  │  - totalLicenses                                         │ │
│  │  - usedLicenses                                          │ │
│  │  - expiryDate                                            │ │
│  │  - totalCapacity                                         │ │
│  │  - usedCapacity                                          │ │
│  │  - serverLocation                                        │ │
│  │  - billingCycle                                          │ │
│  │  - startDate                                             │ │
│  │  - endDate                                               │ │
│  │  - autoRenew                                             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                            │                                    │
│                            ▼                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │      Validation & Population                             │ │
│  │  - Type-Specific Field Clearing (pre-validate hook)    │ │
│  │  - LinkedProductId Reference Validation                 │ │
│  │  - License Validation (used ≤ total)                   │ │
│  │  - Storage Validation (used ≤ total)                   │ │
│  │  - Date Validation (start ≤ end)                       │ │
│  │  - Automatic populate() of linkedProductId             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                            │                                    │
└────────────────────────────┼────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   MONGODB DATABASE                              │
├─────────────────────────────────────────────────────────────────┤
│  Database: crm_db                                               │
│  Collection: products (items)                                   │
│                                                                   │
│  ┌──────────────────────┐    ┌──────────────────────┐           │
│  │ Product Document     │    │ Service Document     │           │
│  ├──────────────────────┤    ├──────────────────────┤           │
│  │ _id: ObjectId        │    │ _id: ObjectId        │           │
│  │ name: "Server"       │    │ name: "Storage"      │           │
│  │ type: "product"      │    │ type: "service"      │           │
│  │ category             │    │ category             │           │
│  │ price: 5000          │    │ price: 500           │           │
│  │ stock: 2             │    │ serviceType: "stor.."│           │
│  │ vendor: "Dell"       │    │ linkedProductId: ──┐ │           │
│  │ location: "Rack A1"  │    │    (refs Product)   │ │           │
│  │ lowStockThreshold    │────────────────────────►│ │           │
│  │ createdAt            │    │ totalCapacity: 100   │ │           │
│  │ updatedAt            │    │ usedCapacity: 45     │ │           │
│  └──────────────────────┘    │ createdAt            │ │           │
│                              │ updatedAt            │ │           │
│                              └──────────────────────┘ │           │
│                                                                   │
│  Indexes:     {type: 1}, {_id: 1}                              │
│  Collection:  "products"                                        │
│  Documents:   Multiple items (products + services)              │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Flow: Create Service with Linked Product

```
┌─────────┐
│  User   │
└────┬────┘
     │
     │ (1) Fills form:
     │     - Name: "Storage Service"
     │     - Type: "Service"
     │     - ServiceType: "Storage"
     │     - LinkedProduct: Select "Server A" from dropdown
     │     - TotalCapacity: 100
     │     - UsedCapacity: 45
     │
     ▼
┌────────────────────────┐
│    ItemForm.js         │
├────────────────────────┤
│ (2) toPayload()        │
│     Converts form to:  │
│     {                  │
│       name: "Storage..",
│       type: "service", │
│       serviceType: "st",
│       linkedProductId: │
│         "ObjectId(...)"│
│       totalCapacity,   │
│       usedCapacity     │
│     }                  │
└────┬───────────────────┘
     │
     │ (3) POST /api/items
     │
     ▼
┌────────────────────────┐
│   itemController.js    │
├────────────────────────┤
│ (4) buildItemPayload() │
│     └─ Parse values    │
│     └─ Validate fields │
│     └─ Parse ObjectId  │
│     └─ Return: {       │
│        payload: {...}, │
│        errors: [ ]     │
│     }                  │
│                        │
│ (5) Item.create()      │
│     └─ Save to DB      │
│                        │
└────┬───────────────────┘
     │
     ▼
┌────────────────────────┐
│  Mongoose Schema       │
├────────────────────────┤
│ (6) pre("validate")    │
│     hook executes:     │
│     └─ Checks type     │
│     └─ Clears product  │
│        fields          │
│     └─ Validates       │
│        linkedProductId │
│                        │
│ (7) Save validated     │
│     document           │
└────┬───────────────────┘
     │
     ▼
┌────────────────────────┐
│  MongoDB Insert        │
├────────────────────────┤
│ (8) Document stored    │
│     with all fields    │
└────┬───────────────────┘
     │
     ▼
┌────────────────────────┐
│  API Response          │
├────────────────────────┤
│ (9) populate(          │
│     "linkedProductId"  │
│     )                  │
│     └─ Fetch linked    │
│        product data    │
│                        │
│ {                      │
│   _id: "...",          │
│   name: "Storage..",   │
│   linkedProductId: {   │
│     _id: "...",        │
│     name: "Server A",  │
│     stock: 5,          │
│     price: 5000,       │
│     ...                │
│   }                    │
│ }                      │
└────┬───────────────────┘
     │
     ▼
┌────────────────────────┐
│  Frontend receives     │
├────────────────────────┤
│ (10) Update UI with    │
│      created item      │
│                        │
│  Refresh table ✓       │
│  Show success msg ✓    │
└────────────────────────┘
```

---

## 3. Data Flow: Query Products Only (for Dropdown)

```
┌──────────────────────┐
│ ItemForm mounts      │
│ or LinkedProd field  │
│ becomes visible      │
└──────────┬───────────┘
           │
           │ useEffect(() => { fetchProducts() })
           │
           ▼
┌──────────────────────┐
│ axios.get()          │
│ /api/items?type=     │
│  product             │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ itemController.js    │
│ getItems()           │
├──────────────────────┤
│ (1) Parse query:     │
│     type = "product" │
│                      │
│ (2) Build filter:    │
│     { type:          │
│     "product" }      │
│                      │
│ (3) Query DB:        │
│     Item.find(       │
│     filter)          │
│     .populate(       │
│     "linkedProd.Idt")│
│     .sort()          │
│                      │
│ (4) Return array     │
│     [Products]       │
│                      │
│ Status: 200 OK       │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Frontend receives    │
│ products array       │
│                      │
│ setProducts(res.data)│
│ loadingProducts=false│
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Render dropdown:     │
│ <select>             │
│  <option>-- No --</op│
│  {products.map(...)}│
│    name (category)   │
│ </select>            │
│                      │
│ Dropdown ready ✓     │
└──────────────────────┘
```

---

## 4. Validation Flow

```
┌─────────────┐
│ Form Submit │
└──────┬──────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Frontend Validation (HTML5)          │
├──────────────────────────────────────┤
│ ☑ required="true"                   │
│ ☑ type="number"                     │
│ ☑ min="0"                           │
│ ☑ Date validation                   │
│                                      │
│ If fails: Show browser tooltip      │
│ If passes: Send to API              │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Backend Validation (buildItemPayload)│
├──────────────────────────────────────┤
│ Layer 1: Basic Validation           │
│   ✓ name, category required         │
│   ✓ price is number ≥ 0             │
│                                      │
│ Layer 2: Type-Specific              │
│   if type="product":                │
│     ✓ quantity required & ≥ 0       │
│   if type="service":                │
│     ✓ serviceType required          │
│     ✓ linkedProductId valid ObjectId│
│                                      │
│ Layer 3: Service-Specific           │
│   if serviceType="license":         │
│     ✓ totalLicenses & >= usedLic.   │
│     ✓ expiryDate is valid Date      │
│   if serviceType="storage":         │
│     ✓ totalCapacity > 0             │
│     ✓ usedCapacity <= totalCapacity │
│   if serviceType="subscription":    │
│     ✓ billingCycle is "monthly|yr" │
│     ✓ startDate < endDate           │
│                                      │
│ Result:                             │
│   errors = []  → Continue to DB     │
│   errors = [..] → Return 400 error  │
└──────┬───────────────────────────────┘
       │
       │ (if no errors)
       ▼
       ┌──────────────────────────────────────┐
       │ Mongoose Pre-Validation Hook         │
       ├──────────────────────────────────────┤
       │ For Product:                         │
       │   ✓ Clear serviceType                │
       │   ✓ Clear totalLicenses              │
       │   ✓ Clear totalCapacity              │
       │   ✓ Clear billingCycle               │
       │   ✓ Clear linkedProductId            │
       │                                      │
       │ For Service:                         │
       │   ✓ Set stock = 0                    │
       │   ✓ Clear unused fields by serviceType
       │   ✓ Validate linkedProductId ref    │
       │                                      │
       │ After: Document is "clean"          │
       └──────┬───────────────────────────────┘
              │
              ▼
       ┌──────────────────────────────────────┐
       │ Save to MongoDB                      │
       │ & Return Success                     │
       └──────────────────────────────────────┘
```

---

## 5. Field Clearing Logic

```
Pre-Validation Hook Execution:

┌──────────────────────────────────────────────┐
│ Incoming Document: type="product"            │
├──────────────────────────────────────────────┤
│ BEFORE:                                      │
│ ├─ name: "Server"         ✓                 │
│ ├─ type: "product"        ✓                 │
│ ├─ stock: 5               ✓                 │
│ ├─ serviceType: "license"     (should clear)
│ ├─ totalLicenses: 100         (should clear)
│ ├─ totalCapacity: 500         (should clear)
│ ├─ billingCycle: "yearly"     (should clear)
│ ├─ linkedProductId: "ID"      (should clear)
│ └─ ...other fields kept        ✓            │
│                                              │
│ Hook Logic:                                  │
│ if (type === "product") {                   │
│   this.serviceType = undefined;    ✓       │
│   this.totalLicenses = undefined;  ✓       │
│   this.usedLicenses = undefined;   ✓       │
│   this.totalCapacity = undefined;  ✓       │
│   this.usedCapacity = undefined;   ✓       │
│   this.serverLocation = undefined; ✓       │
│   this.billingCycle = undefined;   ✓       │
│   this.startDate = undefined;      ✓       │
│   this.endDate = undefined;        ✓       │
│   this.autoRenew = false;          ✓       │
│   this.linkedProductId = null;     ✓       │
│ }                                           │
│                                              │
│ AFTER:                                       │
│ ├─ name: "Server"          ✓                │
│ ├─ type: "product"         ✓                │
│ ├─ stock: 5                ✓                │
│ ├─ serviceType: undefined       (cleared) ✓│
│ ├─ totalLicenses: undefined     (cleared) ✓│
│ ├─ totalCapacity: undefined     (cleared) ✓│
│ ├─ billingCycle: undefined      (cleared) ✓│
│ ├─ linkedProductId: null        (cleared) ✓│
│ └─ ...other fields intact       (kept)      │
│                                              │
│ Result: Clean product document ✓            │
└──────────────────────────────────────────────┘


┌──────────────────────────────────────────────┐
│ Incoming Document: type="service"            │
├──────────────────────────────────────────────┤
│ BEFORE:                                      │
│ ├─ name: "Storage"          ✓               │
│ ├─ type: "service"          ✓               │
│ ├─ serviceType: "storage"   ✓               │
│ ├─ stock: 10                    (should clear)
│ ├─ totalCapacity: 500        ✓              │
│ ├─ usedCapacity: 200         ✓              │
│ ├─ linkedProductId: "ID"     ✓              │
│ ├─ totalLicenses: 100            (should clear)
│ ├─ startDate: "2024-01-01"       (should clear)
│ └─ ...                                       │
│                                              │
│ Hook Logic:                                  │
│ if (type === "service") {                   │
│   this.stock = 0;  (always)                 │
│                                              │
│   // Clear fields for other serviceTypes    │
│   if (serviceType !== "license") {          │
│     this.totalLicenses = undefined; ✓      │
│     this.usedLicenses = undefined;  ✓      │
│   }                                         │
│   if (serviceType !== "storage") {          │
│     this.totalCapacity = undefined; ✓      │
│     this.usedCapacity = undefined;  ✓      │
│   }                                         │
│   if (serviceType !== "subscription") {     │
│     this.billingCycle = undefined;  ✓      │
│     this.startDate = undefined;     ✓      │
│     this.endDate = undefined;       ✓      │
│   }                                         │
│ }                                           │
│                                              │
│ AFTER:                                       │
│ ├─ name: "Storage"            ✓             │
│ ├─ type: "service"            ✓             │
│ ├─ serviceType: "storage"     ✓             │
│ ├─ stock: 0                       (cleared) ✓
│ ├─ totalCapacity: 500         ✓             │
│ ├─ usedCapacity: 200          ✓             │
│ ├─ linkedProductId: "ID"      ✓             │
│ ├─ totalLicenses: undefined       (cleared) ✓
│ ├─ startDate: undefined           (cleared) ✓
│ └─ ...only needed fields intact              │
│                                              │
│ Result: Clean storage service doc ✓         │
└──────────────────────────────────────────────┘
```

---

## 6. Request/Response Example

```
REQUEST:
┌────────────────────────────────────────┐
│ POST /api/items                        │
│ Authorization: Bearer <token>          │
│ Content-Type: application/json         │
├────────────────────────────────────────┤
│ {                                      │
│   "name": "Storage Service",           │
│   "type": "service",                   │
│   "category": "Cloud Services",        │
│   "price": 500,                        │
│   "serviceType": "storage",            │
│   "linkedProductId": "507f1f77bcf86", │
│   "totalCapacity": 100,                │
│   "usedCapacity": 45,                  │
│   "serverLocation": "DC-1"             │
│ }                                      │
└────────────────────────────────────────┘


              ▼ Processing ▼


RESPONSE:
┌────────────────────────────────────────┐
│ 201 Created                            │
│ Content-Type: application/json         │
├────────────────────────────────────────┤
│ {                                      │
│   "_id": "507f1f77bcf86cd799439011",  │
│   "name": "Storage Service",           │
│   "type": "service",                   │
│   "category": "Cloud Services",        │
│   "price": 500,                        │
│   "serviceType": "storage",            │
│   "linkedProductId": {                 │
│     "_id": "507f1f77bcf86cd799439010",│
│     "name": "Server Cabinet A",        │
│     "category": "Hardware",            │
│     "price": 5000,                     │
│     "stock": 3,                        │
│     "vendor": "Dell",                  │
│     "location": "Rack A1"              │
│   },                                   │
│   "totalCapacity": 100,                │
│   "usedCapacity": 45,                  │
│   "availableCapacity": 55,             │ ← Virtual field
│   "serverLocation": "DC-1",            │
│   "stock": 0,                          │ ← Auto-set for service
│   "createdAt": "2024-03-24T10:30:00Z",│
│   "updatedAt": "2024-03-24T10:30:00Z" │
│ }                                      │
└────────────────────────────────────────┘
```

---

## 7. Role-Based Access Control

```
┌────────────────────────────────────────┐
│  User requests: POST /api/items        │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│  authMiddleware: verifyToken()         │
├────────────────────────────────────────┤
│  Validate JWT token:                   │
│  ✓ Token present                       │
│  ✓ Token not expired                   │
│  ✓ Token signature valid               │
│  ✗ Token missing → 401 Unauthorized   │
│  ✗ Token invalid → 401 Unauthorized   │
│                                        │
│  Extract user role from token:         │
│  role = decoded.role                   │
└────────────┬───────────────────────────┘
             │
             ▼ (token valid)
┌────────────────────────────────────────┐
│  authorize({ permit(...roles) })      │
├────────────────────────────────────────┤
│  Check route requirements:             │
│  router.post("/",                      │
│    permit("ADMIN", "MANAGER"),         │
│    createItem                          │
│  )                                     │
│                                        │
│  Allow router requires:                │
│    - "ADMIN" OR "MANAGER"              │
│                                        │
│  User Scenarios:                       │
│  1. role = "ADMIN"      ✅ ALLOWED    │
│     (ADMIN is in list)                 │
│                                        │
│  2. role = "MANAGER"    ✅ ALLOWED    │
│     (MANAGER is in list)               │
│                                        │
│  3. role = "EMPLOYEE"   ❌ FORBIDDEN  │
│     (EMPLOYEE not in list)             │
│     → 403 Forbidden                    │
│                                        │
│  4. role = undefined    ❌ FORBIDDEN  │
│     → 403 Forbidden                    │
└────────────┬───────────────────────────┘
             │
             ▼ (authorized)
┌────────────────────────────────────────┐
│  Call route handler:                   │
│  createItem(req, res)                  │
│                                        │
│  Process continues...                  │
└────────────────────────────────────────┘


All Routes & Required Roles:
┌────────────────────────────────────────────┐
│ Endpoint          │ GET | POST | PUT | DEL │
├───────────────────┼──────────────────────┤
│ /api/items        │  ✓   │  ✓  │    │     │
│ Roles Required    │ EAM* │ AM* │ -  │  -  │
├───────────────────┼──────────────────────┤
│ /api/items?       │  ✓   │  -  │    │     │
│ type=product      │ EAM* │  -  │ -  │  -  │
├───────────────────┼──────────────────────┤
│ /api/items/:id    │  ✓   │  -  │ ✓  │ ✓   │
│ Roles Required    │ EAM* │  -  │ AM*│ A*  │
└────────────────────────────────────────────┘

Legend:
  E = EMPLOYEE (view only)
  A = ADMIN (all permissions)
  M = MANAGER (create, edit)
  * = Required minimum role

Access Rules:
  GET    /items:  EMPLOYEE, MANAGER, ADMIN
  POST   /items:  MANAGER, ADMIN only
  PUT    /items:  MANAGER, ADMIN only
  DELETE /items:  ADMIN only
```

---

This completes the comprehensive architecture and data flow documentation for your Products & Services module!
