from pymongo import ASCENDING, MongoClient

from config import Config


class MongoConnection:
    def __init__(self):
        self.client = MongoClient(Config.MONGO_URI)
        self.db = self.client[Config.MONGO_DB]
        self.customers = self.db.customers
        self.deals = self.db.deals
        self.activities = self.db.activities

    def ensure_indexes(self):
        self.customers.create_index(
            [("email", ASCENDING)],
            unique=True,
            sparse=True,
            name="uniq_customer_email",
        )
        self.customers.create_index(
            [("phone", ASCENDING)],
            unique=True,
            sparse=True,
            name="uniq_customer_phone",
        )
        self.deals.create_index([("customer_id", ASCENDING)], name="idx_deal_customer")
        self.activities.create_index(
            [("customer_id", ASCENDING)], name="idx_activity_customer"
        )
