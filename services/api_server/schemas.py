from datetime import datetime
from typing import Literal

from pydantic import BaseModel
from pydantic import Field
from pydantic import model_validator

ParameterTypeLiteral = Literal["string", "number", "select", "boolean", "file"]
StepTypeLiteral = Literal["processing", "analysis", "reporting"]
VersionStatusLiteral = Literal["draft", "published"]


class ParameterIn(BaseModel):
    """
    Input model for creating or updating a workflow parameter.
    """

    name: str = Field(min_length=1, max_length=255)
    type: ParameterTypeLiteral
    description: str | None = None
    options: list[str] | None = None
    required: bool = False
    default_value: str | None = None

    @model_validator(mode="after")
    def _validate_options_and_default(self) -> "ParameterIn":
        if self.type == "select":
            if not self.options:
                raise ValueError("options is required when type='select'")
        else:
            if self.options is not None:
                raise ValueError("options must be null unless type='select'")
        if self.options is not None and self.default_value is not None:
            if self.default_value not in self.options:
                raise ValueError("default_value must be one of options")
        return self


class ParameterOut(ParameterIn):
    """
    Output model for a workflow parameter.
    """

    id: int
    archived_at: datetime | None = None


class WorkflowStepIn(BaseModel):
    """
    Input model for a workflow step.
    """

    step_order: int = Field(ge=0)
    step_name: str = Field(min_length=1, max_length=255)
    step_type: StepTypeLiteral


class WorkflowStepOut(WorkflowStepIn):
    """
    Output model for a workflow step.
    """

    id: int


class WorkflowVersionContentIn(BaseModel):
    """
    Parameters and steps that make up a version's payload.
    """

    parameter_ids: list[int] = Field(default_factory=list)
    steps: list[WorkflowStepIn] = Field(min_length=1)
    description: str | None = None

    @model_validator(mode="after")
    def _validate_step_orders(self) -> "WorkflowVersionContentIn":
        orders = [step.step_order for step in self.steps]
        if len(set(orders)) != len(orders):
            raise ValueError("steps must have unique step_order values")
        return self


class WorkflowVersionSummary(BaseModel):
    """
    Lightweight version summary for the workflow detail view.
    """

    id: int
    workflow_id: int
    version_number: int
    status: VersionStatusLiteral
    description: str | None
    created_at: datetime
    published_at: datetime | None
    archived_at: datetime | None


class WorkflowIn(BaseModel):
    """
    Input model for creating a workflow. Supplies metadata plus the contents of v1.
    """

    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    initial_version: WorkflowVersionContentIn


class WorkflowMetadataUpdateIn(BaseModel):
    """
    Update workflow metadata (name + description) only. Version content is edited
    via /workflow-versions endpoints. Optimistic-locked on workflows.revision.
    """

    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    revision: int


class WorkflowOut(BaseModel):
    """
    Full workflow detail with versions.
    """

    id: int
    name: str
    description: str | None
    revision: int
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None
    versions: list[WorkflowVersionSummary]


class WorkflowSummary(BaseModel):
    """
    Workflow list row.
    """

    id: int
    name: str
    description: str | None
    archived_at: datetime | None
    version_count: int
    latest_version_number: int | None
    latest_published_version_id: int | None
    latest_published_version_number: int | None
