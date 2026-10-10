"""Optional local browser verification API with an explicitly mocked Mongo store.

Run from backend: .venv/Scripts/python.exe -m uvicorn browser_api:app
                 --app-dir tests --host 127.0.0.1 --port 8100

This harness mounts production validation, routes, engines and Excel rendering.
Only the projects collection is replaced. It must never be used for deployment.
Data is held in process memory and disappears when the test server stops.
"""

from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace

from bson import ObjectId
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import exports, projects, quotes


class MemoryCursor(list):
    def sort(self, *args):
        return self

    def limit(self, count):
        return MemoryCursor(self[:count])


class MemoryCollection:
    def __init__(self):
        self.documents = {}

    def insert_one(self, document):
        project_id = ObjectId()
        self.documents[project_id] = deepcopy({**document, "_id": project_id})
        return SimpleNamespace(inserted_id=project_id)

    def find_one(self, query):
        return deepcopy(self.documents.get(query["_id"]))

    def find(self):
        return MemoryCursor(deepcopy(list(self.documents.values())))

    def update_one(self, query, update):
        document = self.documents.get(query["_id"])
        if document is None:
            return SimpleNamespace(matched_count=0)
        document.update(deepcopy(update["$set"]))
        return SimpleNamespace(matched_count=1)


collection = MemoryCollection()
collection.insert_one({
    "customer_name": "Cliente antiguo", "site_name": "Proyecto antiguo", "notes": "Proyecto previo a los nuevos requisitos",
    "requirements": {"camera_count": 2, "outdoor_camera_count": 1, "resolution_mp": 4,
                     "recording_hours_per_day": 6},
    "latest_estimate": {"storage_tb_raw": 99999}, "status": "draft",
    "created_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc),
})
projects.db = SimpleNamespace(projects=collection)
app = FastAPI(title="Test-only CCTV API — Mongo collection mocked")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"], allow_headers=["*"],
)
for router in (quotes.router, projects.router, exports.router):
    app.include_router(router, prefix="/api/v1")


@app.get("/test-health")
def test_health():
    return {"test_only": True, "datastore": "mocked Mongo collection in process memory",
            "project_count": len(collection.documents)}
