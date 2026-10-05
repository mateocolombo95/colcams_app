from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.db.mongo import db
from app.models.quote import CCTVRequirements
from app.services.quote_engine import estimate_quote

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    customer_name: str = Field(min_length=1)
    site_name: str = Field(min_length=1)
    notes: str = ""
    requirements: CCTVRequirements


def serialize_project(document: dict[str, Any]) -> dict[str, Any]:
    document = dict(document)
    document["id"] = str(document.pop("_id"))
    return document


@router.post("")
def create_project(project: ProjectCreate):
    estimate = estimate_quote(project.requirements)

    document = {
        "customer_name": project.customer_name,
        "site_name": project.site_name,
        "notes": project.notes,
        "requirements": project.requirements.model_dump(),
        "latest_estimate": estimate.model_dump(),
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
    try:
        object_id = ObjectId(project_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid project id") from exc

    document = db.projects.find_one({"_id": object_id})

    if not document:
        raise HTTPException(status_code=404, detail="Project not found")

    return serialize_project(document)
