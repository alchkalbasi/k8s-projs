import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TicketType(str, enum.Enum):
    incident = "incident"
    deployment = "deployment"
    access_request = "access_request"
    infra_change = "infra_change"
    bug = "bug"
    task = "task"


class Priority(str, enum.Enum):
    p1 = "P1"  # critical
    p2 = "P2"  # high
    p3 = "P3"  # medium
    p4 = "P4"  # low


class Status(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    blocked = "blocked"
    resolved = "resolved"
    closed = "closed"


class Environment(str, enum.Enum):
    dev = "dev"
    staging = "staging"
    production = "production"


def _enum(e: type[enum.Enum]) -> Enum:
    # Store enum *values* as plain strings (portable across SQLite/PostgreSQL).
    return Enum(e, values_callable=lambda x: [m.value for m in x], native_enum=False, length=32)


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    type: Mapped[TicketType] = mapped_column(_enum(TicketType), default=TicketType.task, index=True)
    priority: Mapped[Priority] = mapped_column(_enum(Priority), default=Priority.p3, index=True)
    status: Mapped[Status] = mapped_column(_enum(Status), default=Status.open, index=True)
    environment: Mapped[Environment] = mapped_column(_enum(Environment), default=Environment.dev)
    service: Mapped[str] = mapped_column(String(100), default="")
    reporter: Mapped[str] = mapped_column(String(100))
    assignee: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    comments: Mapped[list["Comment"]] = relationship(
        back_populates="ticket", cascade="all, delete-orphan", order_by="Comment.created_at"
    )


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    author: Mapped[str] = mapped_column(String(100))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    ticket: Mapped[Ticket] = relationship(back_populates="comments")
