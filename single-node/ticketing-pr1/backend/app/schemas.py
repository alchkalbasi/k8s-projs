from datetime import datetime, timezone
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from .models import Environment, Priority, Status, TicketType

# SQLite drops tzinfo; values are always stored as UTC, so re-attach it so the
# JSON carries an explicit offset and browsers don't treat it as local time.
UTCDatetime = Annotated[
    datetime, AfterValidator(lambda d: d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d)
]


class CommentCreate(BaseModel):
    author: str = Field(min_length=1, max_length=100)
    body: str = Field(min_length=1, max_length=10_000)


class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ticket_id: int
    author: str
    body: str
    created_at: UTCDatetime


class TicketBase(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=20_000)
    type: TicketType = TicketType.task
    priority: Priority = Priority.p3
    environment: Environment = Environment.dev
    service: str = Field(default="", max_length=100)
    assignee: str | None = Field(default=None, max_length=100)


class TicketCreate(TicketBase):
    reporter: str = Field(min_length=1, max_length=100)


class TicketUpdate(BaseModel):
    """Partial update — only provided fields are changed."""

    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=20_000)
    type: TicketType | None = None
    priority: Priority | None = None
    status: Status | None = None
    environment: Environment | None = None
    service: str | None = Field(default=None, max_length=100)
    assignee: str | None = Field(default=None, max_length=100)


class TicketOut(TicketBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: Status
    reporter: str
    created_at: UTCDatetime
    updated_at: UTCDatetime
    resolved_at: UTCDatetime | None


class TicketDetail(TicketOut):
    comments: list[CommentOut] = []


class TicketPage(BaseModel):
    items: list[TicketOut]
    total: int
    limit: int
    offset: int


class Stats(BaseModel):
    total: int
    by_status: dict[str, int]
    by_priority: dict[str, int]
    by_type: dict[str, int]
    open_p1: int
