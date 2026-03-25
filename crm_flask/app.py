import os
from datetime import UTC, datetime

from flask import Flask, jsonify, render_template, request

from config import Config
from db import MongoConnection
from services import (
    VALID_ACTIVITY_TYPES,
    VALID_DEAL_STATUSES,
    as_object_id,
    normalize_email,
    normalize_phone,
    serialize_id,
    upsert_customer,
)

app = Flask(__name__, template_folder="templates", static_folder="static")
app.config.from_object(Config)

mongo = MongoConnection()
mongo.ensure_indexes()


def error_response(message: str, status: int = 400):
    return jsonify({"error": message}), status


@app.get("/")
def root():
    return jsonify({"message": "CRM Flask API is running"})


@app.post("/customer-or-deal")
def create_customer_or_deal():
    data = request.get_json(silent=True) or {}

    name = (data.get("name") or "").strip()
    email = normalize_email(data.get("email"))
    phone = normalize_phone(data.get("phone"))
    service_type = (data.get("service_type") or "").strip()
    status = (data.get("status") or "Active").strip()

    if not name:
        return error_response("name is required")
    if not service_type:
        return error_response("service_type is required")
    if not email and not phone:
        return error_response("Either email or phone is required to prevent duplicates")
    if status not in VALID_DEAL_STATUSES:
        return error_response(
            f"Invalid status. Allowed: {', '.join(sorted(VALID_DEAL_STATUSES))}"
        )

    try:
        customer, created = upsert_customer(mongo.customers, name, email, phone)
    except ValueError as exc:
        return error_response(str(exc), 409)

    deal_payload = {
        "customer_id": customer["_id"],
        "service_type": service_type,
        "status": status,
        "created_at": datetime.now(UTC).isoformat(),
    }
    inserted_deal = mongo.deals.insert_one(deal_payload)
    deal = mongo.deals.find_one({"_id": inserted_deal.inserted_id})

    response = {
        "customer": serialize_id(customer),
        "deal": {
            "id": str(deal["_id"]),
            "customer_id": str(deal["customer_id"]),
            "service_type": deal["service_type"],
            "status": deal["status"],
            "created_at": deal["created_at"],
        },
        "customer_created": created,
    }
    return jsonify(response), 201


@app.get("/customers")
def get_customers():
    customers = list(
        mongo.customers.find(
            {},
            {
                "name": 1,
                "email": 1,
                "phone": 1,
                "created_at": 1,
            },
        )
    )
    serialized = [serialize_id(customer) for customer in customers]
    return jsonify(serialized)


@app.get("/customers/<customer_id>")
def get_customer_details(customer_id: str):
    try:
        object_id = as_object_id(customer_id)
    except ValueError as exc:
        return error_response(str(exc), 400)

    customer = mongo.customers.find_one({"_id": object_id})
    if not customer:
        return error_response("Customer not found", 404)

    deals = list(mongo.deals.find({"customer_id": object_id}).sort("created_at", -1))
    activities = list(
        mongo.activities.find({"customer_id": object_id}).sort("date", -1)
    )

    deal_data = [
        {
            "id": str(deal["_id"]),
            "customer_id": str(deal["customer_id"]),
            "service_type": deal["service_type"],
            "status": deal["status"],
            "created_at": deal["created_at"],
        }
        for deal in deals
    ]

    activity_data = [
        {
            "id": str(activity["_id"]),
            "customer_id": str(activity["customer_id"]),
            "type": activity["type"],
            "notes": activity["notes"],
            "date": activity["date"],
        }
        for activity in activities
    ]

    return jsonify(
        {
            "customer": serialize_id(customer),
            "deals": deal_data,
            "activities": activity_data,
        }
    )


@app.post("/activities")
def create_activity():
    data = request.get_json(silent=True) or {}
    customer_id = (data.get("customer_id") or "").strip()
    activity_type = (data.get("type") or "").strip()
    notes = (data.get("notes") or "").strip()
    activity_date = (data.get("date") or datetime.now(UTC).isoformat()).strip()

    if not customer_id:
        return error_response("customer_id is required")
    if activity_type not in VALID_ACTIVITY_TYPES:
        return error_response(
            f"Invalid type. Allowed: {', '.join(sorted(VALID_ACTIVITY_TYPES))}"
        )

    try:
        object_id = as_object_id(customer_id)
    except ValueError as exc:
        return error_response(str(exc), 400)

    if not mongo.customers.find_one({"_id": object_id}):
        return error_response("Customer not found", 404)

    payload = {
        "customer_id": object_id,
        "type": activity_type,
        "notes": notes,
        "date": activity_date,
    }
    inserted = mongo.activities.insert_one(payload)
    created_activity = mongo.activities.find_one({"_id": inserted.inserted_id})

    return (
        jsonify(
            {
                "id": str(created_activity["_id"]),
                "customer_id": str(created_activity["customer_id"]),
                "type": created_activity["type"],
                "notes": created_activity["notes"],
                "date": created_activity["date"],
            }
        ),
        201,
    )


@app.get("/ui/customers")
def customers_page():
    return render_template("customer_list.html")


@app.get("/ui/customer")
def customer_detail_page():
    return render_template("customer_detail.html")


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_ENV") == "development")
