# CRM Database Schema (MongoDB)

## customers collection

```json
{
  "_id": "ObjectId",
  "name": "string",
  "email": "string (unique, sparse)",
  "phone": "string (unique, sparse)",
  "created_at": "ISO8601 string"
}
```

Indexes:
- `uniq_customer_email` unique sparse on `email`
- `uniq_customer_phone` unique sparse on `phone`

## deals collection

```json
{
  "_id": "ObjectId",
  "customer_id": "ObjectId (FK -> customers._id)",
  "service_type": "string",
  "status": "Active | Inactive | Closed Won | Closed Lost",
  "created_at": "ISO8601 string"
}
```

Indexes:
- `idx_deal_customer` on `customer_id`

## activities collection

```json
{
  "_id": "ObjectId",
  "customer_id": "ObjectId (FK -> customers._id)",
  "type": "Call | Meeting | Follow-up",
  "notes": "string",
  "date": "ISO8601 string"
}
```

Indexes:
- `idx_activity_customer` on `customer_id`
