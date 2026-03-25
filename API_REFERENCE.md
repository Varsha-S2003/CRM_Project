# Quick Reference: Products & Services API

## Endpoints

### Create
```bash
POST /api/items
Authorization: Bearer <token>
Content-Type: application/json

# Product
{
  "name": "Server Dell R750",
  "type": "product",
  "category": "Hardware",
  "price": 5000,
  "quantity": 2,
  "vendor": "Dell",
  "location": "Rack A1"
}

# Service (with linked product)
{
  "name": "Storage Service A",
  "type": "service",
  "category": "Cloud Services",
  "price": 500,
  "serviceType": "storage",
  "linkedProductId": "507f1f77bcf86cd799439011",
  "totalCapacity": 100,
  "usedCapacity": 45,
  "serverLocation": "DC-1"
}
```

### Read
```bash
GET /api/items?type=product              # Products only
GET /api/items?type=service              # Services only
GET /api/items?search=storage            # Search
GET /api/items/:id                       # Single item
```

### Update
```bash
PUT /api/items/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "price": 600,
  "usedCapacity": 50
  // Only include fields to update
}
```

### Delete
```bash
DELETE /api/items/:id
Authorization: Bearer <token>
```

---

## Response Format

### Item Object
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "Storage Service",
  "type": "service",
  "category": "Cloud Services",
  "price": 500,
  "serviceType": "storage",
  "totalCapacity": 100,
  "usedCapacity": 45,
  "availableCapacity": 55,
  "linkedProductId": {
    "_id": "507f1f77bcf86cd799439012",
    "name": "Server Cabinet",
    "category": "Hardware",
    "price": 5000,
    "stock": 2,
    "vendor": "Dell",
    "location": "Rack A1"
  },
  "createdAt": "2024-03-24T10:30:00Z",
  "updatedAt": "2024-03-24T10:35:00Z"
}
```

---

## Common Patterns

### Service with License
```json
{
  "name": "Microsoft Office 365",
  "type": "service",
  "serviceType": "license",
  "price": 12,
  "totalLicenses": 50,
  "usedLicenses": 35,
  "expiryDate": "2025-03-24"
}
```

### Service with Subscription
```json
{
  "name": "AWS Annual Plan",
  "type": "service",
  "serviceType": "subscription",
  "price": 5000,
  "billingCycle": "yearly",
  "startDate": "2024-03-24",
  "endDate": "2025-03-24",
  "autoRenew": true
}
```

---

## Validation Rules

| Field | Required | Type | Conditions |
|-------|----------|------|-----------|
| name | ✅ | String | Min 1 char |
| type | ✅ | Enum | product \| service |
| category | ✅ | String | Min 1 char |
| price | ✅ | Number | ≥ 0 |
| quantity | ✅ (product) | Number | ≥ 0 |
| serviceType | ✅ (service) | Enum | license \| storage \| subscription |
| linkedProductId | ❌ | ObjectId | Must reference product |
| totalLicenses | ✅ (license) | Number | ≥ usedLicenses |
| usedLicenses | ✅ (license) | Number | ≤ totalLicenses |
| totalCapacity | ✅ (storage) | Number | > 0 |
| usedCapacity | ✅ (storage) | Number | ≤ totalCapacity |
| billingCycle | ✅ (subscription) | Enum | monthly \| yearly |
| startDate | ✅ (subscription) | Date | < endDate |
| endDate | ✅ (subscription) | Date | > startDate |

---

## Status Badges

### Products
- **In Stock** (Green): quantity > threshold
- **Low Stock** (Yellow): 0 < quantity ≤ threshold
- **Out of Stock** (Red): quantity = 0

### Licenses
- **Available** (Green): available > 3
- **Low** (Yellow): available ≤ 3

### Storage
- **Available** (Green): available ≥ 20%
- **Low** (Yellow): available < 20%

### Subscriptions
- **Active** (Green): ends > 30 days
- **Near Expiry** (Yellow): ends ≤ 30 days

---

## Error Codes

| Code | Message | Solution |
|------|---------|----------|
| 400 | Validation failed | Check field types and required fields |
| 401 | Unauthorized | Include valid Bearer token |
| 403 | Forbidden | User role insufficient |
| 404 | Not found | Item doesn't exist |
| 500 | Server error | Check server logs |

