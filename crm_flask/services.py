from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from pymongo.errors import DuplicateKeyError


VALID_DEAL_STATUSES = {"Active", "Inactive", "Closed Won", "Closed Lost"}
VALID_ACTIVITY_TYPES = {"Call", "Meeting", "Follow-up"}


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def normalize_email(email: str | None) -> str | None:
    if not email:
        return None
    normalized = email.strip().lower()
    return normalized or None


def normalize_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    normalized = "".join(ch for ch in phone.strip() if ch.isdigit() or ch == "+")
    return normalized or None


def as_object_id(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise ValueError("Invalid ID format")
    return ObjectId(value)


def serialize_id(document: dict[str, Any]) -> dict[str, Any]:
    result = dict(document)
    result["id"] = str(result.pop("_id"))
    return result


def get_existing_customer(customers_collection, email: str | None, phone: str | None):
    matches = []
    if email:
        by_email = customers_collection.find_one({"email": email})
        if by_email:
            matches.append(by_email)

    if phone:
        by_phone = customers_collection.find_one({"phone": phone})
        if by_phone:
            if not matches or matches[0]["_id"] != by_phone["_id"]:
                matches.append(by_phone)

    if len(matches) > 1:
        raise ValueError("Email and phone belong to different customers")

    return matches[0] if matches else None


def upsert_customer(customers_collection, name: str, email: str | None, phone: str | None):
    existing = get_existing_customer(customers_collection, email, phone)
    if existing:
        update_data = {"name": name}
        if email and not existing.get("email"):
            update_data["email"] = email
        if phone and not existing.get("phone"):
            update_data["phone"] = phone

        if update_data:
            customers_collection.update_one({"_id": existing["_id"]}, {"$set": update_data})
            existing = customers_collection.find_one({"_id": existing["_id"]})
        return existing, False

    payload = {
        "name": name,
        "email": email,
        "phone": phone,
        "created_at": now_iso(),
    }
    try:
        inserted = customers_collection.insert_one(payload)
    except DuplicateKeyError as exc:
        raise ValueError("Customer with this email/phone already exists") from exc
    return customers_collection.find_one({"_id": inserted.inserted_id}), True
