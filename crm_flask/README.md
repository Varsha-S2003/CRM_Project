# Flask CRM Module (Zoho-like behavior)

This module implements duplicate-safe customer management, multi-deal support per customer, and activity tracking using Flask + MongoDB.

## Features

- No duplicate customers by `email` or `phone`
- Automatic customer upsert flow when creating a new service/deal
- Multiple deals per customer, each with independent status
- Customer profile endpoint includes deals and activities
- Minimal frontend pages for customer list and customer detail

## Setup

1. Create and activate virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Configure environment:

```bash
copy .env.example .env
```

4. Start server:

```bash
python app.py
```

Server runs at `http://localhost:5000` by default.

## API Endpoints

- `POST /customer-or-deal`
  - Input: `name`, `email`, `phone`, `service_type`, optional `status`
  - Logic: find existing customer by email/phone, upsert customer, create deal
- `GET /customers`
  - Returns basic customer info list
- `GET /customers/:id`
  - Returns customer details + all deals + all activities
- `POST /activities`
  - Adds activity for a customer

## Frontend Pages

- `GET /ui/customers` customer list page
- `GET /ui/customer?id=<customer_id>` customer detail page
