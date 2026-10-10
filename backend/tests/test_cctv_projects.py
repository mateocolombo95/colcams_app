"""Mongo route roundtrips use a deterministic collection, never a live database."""

import asyncio
from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace

from bson import ObjectId
from fastapi import FastAPI

from app.api.routes import projects
from app.models.quote import CCTVRequirements, GlobalCameraDefaults
from test_cctv_requirements import api_request, camera


class MemoryCursor(list):
    def sort(self, *args):
        return self

    def limit(self, count):
        return MemoryCursor(self[:count])


class MemoryProjects:
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


def project_app(monkeypatch):
    collection = MemoryProjects()
    monkeypatch.setattr(projects, "db", SimpleNamespace(projects=collection))
    app = FastAPI()
    app.include_router(projects.router)
    return app, collection


def test_individual_requirements_and_survey_persist_through_create_read_update(monkeypatch):
    app, collection = project_app(monkeypatch)
    defaults = GlobalCameraDefaults(cameraCount=2, imageObjective="overview", nightObjectiveRequired="no")
    rows = [
        camera(imageObjective="identify", viewingRange="far", targetDistanceM=28.5,
               distanceM=61, nightObjectiveRequired="yes", nightLighting="permanent", nightColorRequired="yes",
               detectionEvent="line_crossing", detectionTarget="person", eventActions=["mobile_notification", "external_siren"],
               customized=True, notes="Portón con detalle nocturno"),
        camera("C2", imageObjective="overview", nightObjectiveRequired="no", detectionEvent="none"),
    ]
    req = CCTVRequirements(camera_count=2, recordingMode="continuous", cameras=rows, cameraDefaults=defaults)
    payload = {"customer_name": "Cliente", "site_name": "Depósito", "notes": "Borrador",
               "survey": {"client": "Cliente", "site": "Depósito", "notes": "Borrador", "technicalNotes": "Visita"},
               "requirements": req.model_dump(mode="json")}
    status, saved = asyncio.run(api_request(app, payload, "/projects"))
    assert status == 200
    project_id = saved["id"]
    stored = collection.documents[ObjectId(project_id)]
    assert stored["requirements"]["cameras"][0]["targetDistanceM"] == 28.5
    assert stored["requirements"]["cameras"][0]["distanceM"] == 61
    assert stored["survey"] == payload["survey"]
    status, loaded = asyncio.run(api_request(app, {}, f"/projects/{project_id}", "GET"))
    assert status == 200
    assert loaded["requirements"]["cameras"] == saved["requirements"]["cameras"]
    assert loaded["requirements"]["cameraDefaults"] == saved["requirements"]["cameraDefaults"]
    assert loaded["survey"] == payload["survey"]
    assert any("sirena externa" in item for item in loaded["latest_estimate"]["technical_pending"])
    payload["requirements"]["cameraDefaults"]["imageObjective"] = "recognize"
    payload["requirements"]["cameraDefaults"]["resolutionMp"] = 8
    payload["requirements"]["retention_days"] = 60
    payload["survey"]["technicalNotes"] = "Visita completa"
    status, updated = asyncio.run(api_request(app, payload, f"/projects/{project_id}", "PUT"))
    assert status == 200
    assert updated["created_at"] == saved["created_at"]
    assert len(collection.documents) == 1
    first = updated["requirements"]["cameras"][0]
    assert first["imageObjective"] == "identify"
    assert first["resolutionMp"] == 4
    assert first["nightColorRequired"] == "yes"
    assert first["detectionTarget"] == "person"
    assert first["eventActions"] == ["mobile_notification", "external_siren"]
    assert first["customized"] is True
    assert updated["latest_estimate"]["storage_tb_raw"] > saved["latest_estimate"]["storage_tb_raw"]
    assert updated["survey"]["technicalNotes"] == "Visita completa"
    status, listed = asyncio.run(api_request(app, {}, "/projects", "GET"))
    assert status == 200
    assert listed[0]["requirements"]["cameras"][0] == first


def test_draft_saves_missing_answers_and_invalid_values_are_rejected(monkeypatch):
    app, collection = project_app(monkeypatch)
    payload = {"customer_name": "Cliente", "site_name": "Sitio", "requirements": {
        "camera_count": 1, "recordingMode": "events",
        "cameras": [camera(imageObjective="recognize").model_dump(mode="json")],
    }}
    status, saved = asyncio.run(api_request(app, payload, "/projects"))
    assert status == 200
    assert saved["status"] == "draft"
    assert saved["latest_estimate"]["technical_pending"]
    payload["requirements"]["cameras"][0]["targetDistanceM"] = -3
    assert asyncio.run(api_request(app, payload, "/projects"))[0] == 422
    assert asyncio.run(api_request(app, payload, f"/projects/{saved['id']}", "PUT"))[0] == 422
    assert len(collection.documents) == 1


def test_legacy_saved_project_is_normalized_and_stale_estimate_is_refreshed(monkeypatch):
    app, collection = project_app(monkeypatch)
    document = {
        "customer_name": "Antiguo", "site_name": "Local", "notes": "Nota original", "status": "draft",
        "requirements": {"camera_count": 2, "outdoor_camera_count": 1, "resolution_mp": 5, "recording_hours_per_day": 8},
        "latest_estimate": {"storage_tb_raw": 99999}, "created_at": datetime.now(timezone.utc),
    }
    project_id = collection.insert_one(document).inserted_id
    status, loaded = asyncio.run(api_request(app, {}, f"/projects/{project_id}", "GET"))
    assert status == 200
    assert loaded["requirements"]["recordingMode"] == "undefined"
    assert loaded["survey"]["client"] == "Antiguo"
    assert loaded["survey"]["notes"] == "Nota original"
    assert len(loaded["requirements"]["cameras"]) == 2
    for row in loaded["requirements"]["cameras"]:
        assert row["imageObjective"] == row["nightObjectiveRequired"] == "undefined"
        assert row["detectionEvent"] == row["detectionTarget"] == "undefined"
        assert row["eventActions"] == []
        assert row["resolutionMp"] == 5
    assert loaded["latest_estimate"]["storage_tb_raw"] != 99999
    assert loaded["latest_estimate"]["storage_hours_per_day"] == 8
    # Read normalization is compatible without silently rewriting Mongo documents.
    assert "cameras" not in collection.documents[project_id]["requirements"]


def test_bad_and_missing_project_ids_have_consistent_route_errors(monkeypatch):
    app, _ = project_app(monkeypatch)
    payload = {"customer_name": "Cliente", "site_name": "Sitio", "requirements": {"camera_count": 1}}
    for method in ["GET", "PUT"]:
        assert asyncio.run(api_request(app, payload, "/projects/invalid", method))[0] == 400
        assert asyncio.run(api_request(app, payload, f"/projects/{ObjectId()}", method))[0] == 404


def test_legacy_zero_target_is_pending_on_read_but_new_requests_still_reject_zero(monkeypatch):
    app, collection = project_app(monkeypatch)
    old_camera = {"id": "C1", "name": "Acceso", "viewingRange": "far", "targetDistanceM": 0,
                  "distanceM": 31, "customized": True}
    document = {
        "customer_name": "Antiguo", "site_name": "Sitio", "notes": "", "status": "draft",
        "requirements": {"camera_count": 1, "cameras": [old_camera],
                         "cameraDefaults": {"cameraCount": 1, "targetDistanceM": 0, "viewingRange": "medium"}},
        "created_at": datetime.now(timezone.utc),
    }
    project_id = collection.insert_one(document).inserted_id
    status, loaded = asyncio.run(api_request(app, {}, f"/projects/{project_id}", "GET"))
    assert status == 200
    row = loaded["requirements"]["cameras"][0]
    assert row["targetDistanceM"] is None
    assert row["distanceM"] == 31
    assert row["viewingRange"] == "far"
    assert row["customized"] is True
    assert row["imageObjective"] == "undefined"
    assert loaded["requirements"]["cameraDefaults"]["targetDistanceM"] is None
    assert collection.documents[project_id]["requirements"]["cameras"][0]["targetDistanceM"] == 0
    status, listed = asyncio.run(api_request(app, {}, "/projects", "GET"))
    assert status == 200
    assert listed[0]["requirements"]["cameras"][0]["targetDistanceM"] is None
    payload = {"customer_name": "Cliente", "site_name": "Sitio", "requirements": {
        "camera_count": 1, "cameras": [old_camera],
    }}
    assert asyncio.run(api_request(app, payload, "/projects"))[0] == 422
