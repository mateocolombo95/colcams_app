from pymongo import MongoClient

from app.core.config import get_settings

settings = get_settings()

client = MongoClient(settings.mongodb_uri)
db = client[settings.mongodb_db]


def ping_database() -> bool:
    client.admin.command("ping")
    return True
