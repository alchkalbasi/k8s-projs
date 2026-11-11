from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Comment, Environment, Priority, Status, Ticket, TicketType, utcnow
from ..schemas import (
    CommentCreate,
    CommentOut,
    Stats,
    TicketCreate,
    TicketDetail,
    TicketOut,
    TicketPage,
    TicketUpdate,
)

router = APIRouter(prefix="/api/tickets", tags=["tickets"])

DB = Annotated[Session, Depends(get_db)]

_DONE = {Status.resolved, Status.closed}


def _get_ticket_or_404(db: Session, ticket_id: int) -> Ticket:
    ticket = db.get(Ticket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail=f"Ticket {ticket_id} not found")
    return ticket


@router.get("", response_model=TicketPage)
def list_tickets(
    db: DB,
    status_: Annotated[Status | None, Query(alias="status")] = None,
    priority: Priority | None = None,
    type_: Annotated[TicketType | None, Query(alias="type")] = None,
    environment: Environment | None = None,
    assignee: str | None = None,
    q: Annotated[str | None, Query(max_length=200, description="Search title/description/service")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    stmt = select(Ticket)
    if status_:
        stmt = stmt.where(Ticket.status == status_)
    if priority:
        stmt = stmt.where(Ticket.priority == priority)
    if type_:
        stmt = stmt.where(Ticket.type == type_)
    if environment:
        stmt = stmt.where(Ticket.environment == environment)
    if assignee:
        stmt = stmt.where(Ticket.assignee == assignee)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(Ticket.title.ilike(like), Ticket.description.ilike(like), Ticket.service.ilike(like))
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(
        stmt.order_by(Ticket.priority.asc(), Ticket.created_at.desc()).limit(limit).offset(offset)
    ).all()
    return TicketPage(items=items, total=total, limit=limit, offset=offset)


@router.get("/stats", response_model=Stats)
def ticket_stats(db: DB):
    def grouped(col) -> dict[str, int]:
        rows = db.execute(select(col, func.count()).group_by(col)).all()
        return {k.value: v for k, v in rows}

    open_p1 = db.scalar(
        select(func.count()).where(Ticket.priority == Priority.p1, Ticket.status.not_in(_DONE))
    )
    by_status = grouped(Ticket.status)
    return Stats(
        total=sum(by_status.values()),
        by_status={s.value: by_status.get(s.value, 0) for s in Status},
        by_priority=grouped(Ticket.priority),
        by_type=grouped(Ticket.type),
        open_p1=open_p1 or 0,
    )


@router.post("", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
def create_ticket(payload: TicketCreate, db: DB):
    ticket = Ticket(**payload.model_dump())
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


@router.get("/{ticket_id}", response_model=TicketDetail)
def get_ticket(ticket_id: int, db: DB):
    ticket = db.scalar(
        select(Ticket).options(selectinload(Ticket.comments)).where(Ticket.id == ticket_id)
    )
    if ticket is None:
        raise HTTPException(status_code=404, detail=f"Ticket {ticket_id} not found")
    return ticket


@router.patch("/{ticket_id}", response_model=TicketOut)
def update_ticket(ticket_id: int, payload: TicketUpdate, db: DB):
    ticket = _get_ticket_or_404(db, ticket_id)
    changes = payload.model_dump(exclude_unset=True)

    if "status" in changes and changes["status"] is None:
        raise HTTPException(status_code=422, detail="status cannot be null")

    for field, value in changes.items():
        setattr(ticket, field, value)

    if "status" in changes:
        if ticket.status in _DONE and ticket.resolved_at is None:
            ticket.resolved_at = utcnow()
        elif ticket.status not in _DONE:
            ticket.resolved_at = None

    db.commit()
    db.refresh(ticket)
    return ticket


@router.delete("/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ticket(ticket_id: int, db: DB):
    ticket = _get_ticket_or_404(db, ticket_id)
    db.delete(ticket)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{ticket_id}/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
def add_comment(ticket_id: int, payload: CommentCreate, db: DB):
    ticket = _get_ticket_or_404(db, ticket_id)
    comment = Comment(ticket_id=ticket.id, **payload.model_dump())
    db.add(comment)
    ticket.updated_at = utcnow()
    db.commit()
    db.refresh(comment)
    return comment
