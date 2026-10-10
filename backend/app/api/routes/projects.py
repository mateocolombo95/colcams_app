from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.db.mongo import db
from app.models.quote import CCTVRequirements
from app.services.cctv_requirements import aggregate_camera_requirements, load_saved_cctv_requirements, normalize_cctv_requirements
from app.services.quote_engine import estimate_quote

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    customer_name: str = Field(min_length=1)
    site_name: str = Field(min_length=1)
    notes: str = ""
    requirements: CCTVRequirements
    survey: dict[str, Any] | None = None


def serialize_project(document: dict[str, Any]) -> dict[str, Any]:
    document = dict(document)
    document["id"] = str(document.pop("_id"))
    requirements = load_saved_cctv_requirements(document["requirements"])
    requirements = aggregate_camera_requirements(requirements)
    document["requirements"] = requirements.model_dump()
    # Old aggregate snapshots predate recording modes and camera detail. Returning
    # the engine's current result avoids displaying numbers from stale requirements.
    document["latest_estimate"] = estimate_quote(requirements).model_dump()
    if document.get("survey") is None:
        document["survey"] = {
            "client": document.get("customer_name", ""),
            "site": document.get("site_name", ""),
            "notes": document.get("notes", ""),
        }
    return document


@router.post("")
def create_project(project: ProjectCreate):
    requirements = aggregate_camera_requirements(normalize_cctv_requirements(project.requirements))
    estimate = estimate_quote(requirements)

    document = {
        "customer_name": project.customer_name,
        "site_name": project.site_name,
        "notes": project.notes,
        "requirements": requirements.model_dump(),
        "latest_estimate": estimate.model_dump(),
        "survey": project.survey,
        "status": "draft",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    result = db.projects.insert_one(document)
    document["_id"] = result.inserted_id
    return serialize_project(document)


@router.get("")
def list_projects():
    documents = db.projects.find().sort("created_at", -1).limit(100)
    return [serialize_project(document) for document in documents]


@router.get("/{project_id}")
def get_project(project_id: str):
    object_id = parse_project_id(project_id)
    document = db.projects.find_one({"_id": object_id})

    if not document:
        raise HTTPException(status_code=404, detail="Project not found")

    return serialize_project(document)


def parse_project_id(project_id: str) -> ObjectId:
    try:
        return ObjectId(project_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid project id") from exc


@router.put("/{project_id}")
def update_project(project_id: str, project: ProjectCreate):
    object_id = parse_project_id(project_id)
    document = db.projects.find_one({"_id": object_id})
    if not document:
        raise HTTPException(status_code=404, detail="Project not found")
    requirements = aggregate_camera_requirements(normalize_cctv_requirements(project.requirements))
    changes = {
        "customer_name": project.customer_name,
        "site_name": project.site_name,
        "notes": project.notes,
        "survey": project.survey,
        "requirements": requirements.model_dump(),
        "latest_estimate": estimate_quote(requirements).model_dump(),
        "updated_at": datetime.now(timezone.utc),
    }
    result = db.projects.update_one({"_id": object_id}, {"$set": changes})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Project not found")
    document = {**document, **changes}
    return serialize_project(document)
