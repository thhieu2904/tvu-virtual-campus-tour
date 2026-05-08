"""
ORM Table definitions — SQLAlchemy models mapping to Supabase PostgreSQL.
Based on plan/v1/task_1.3_database_schema.md
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Text, Float, Boolean, Integer, DateTime, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


class Mascot(Base):
    __tablename__ = "mascots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    model_3d_url = Column(Text, nullable=False)
    voice_name = Column(String(100), nullable=False, default="Kore")
    voice_style = Column(Text, nullable=False, default="")
    personality_prompt = Column(Text, nullable=False, default="")
    is_default = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    locations = relationship("Location", back_populates="mascot")


class Location(Base):
    __tablename__ = "locations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=False, default="")
    intro_message = Column(Text, nullable=False, default="")
    intro_audio_url = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="active")  # active | inactive
    is_start_node = Column(Boolean, nullable=False, default=False)
    mascot_id = Column(UUID(as_uuid=True), ForeignKey("mascots.id", ondelete="SET NULL"), nullable=True)
    background_url = Column(Text, nullable=False, default="")
    camera_config = Column(JSON, nullable=False, default={})  # 360° camera initial view
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    mascot = relationship("Mascot", back_populates="locations")
    documents = relationship("Document", back_populates="location")
    media = relationship("Media", back_populates="location")
    suggested_questions = relationship("SuggestedQuestion", back_populates="location", cascade="all, delete-orphan")


class LocationLink(Base):
    __tablename__ = "location_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id", ondelete="CASCADE"), nullable=False)
    to_location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id", ondelete="CASCADE"), nullable=False)
    label = Column(String(255), nullable=False, default="")
    
    __table_args__ = (
        UniqueConstraint("from_location_id", "to_location_id", name="uix_location_links_from_to"),
    )


class SuggestedQuestion(Base):
    __tablename__ = "suggested_questions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id", ondelete="CASCADE"), nullable=True)
    question = Column(Text, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)

    location = relationship("Location", back_populates="suggested_questions")


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(500), nullable=False)
    file_url = Column(Text, nullable=False)
    file_type = Column(String(10), nullable=False, default="pdf")  # pdf | docx
    file_size = Column(Integer, nullable=False, default=0)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(20), nullable=False, default="pending")  # pending | processing | ready | error
    chunk_count = Column(Integer, nullable=False, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    location = relationship("Location", back_populates="documents")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    content = Column(Text, nullable=False)
    chunk_index = Column(Integer, nullable=False, default=0)
    metadata_ = Column("metadata", JSON, nullable=False, default=dict)
    
    # Import locally to avoid crashing if pgvector is missing during basic imports
    from pgvector.sqlalchemy import Vector
    embedding = Column(Vector(768))  # Gemini embedding size is 768
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    document = relationship("Document", back_populates="chunks")


class Media(Base):
    __tablename__ = "media"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(10), nullable=False)  # image | video | gif
    url = Column(Text, nullable=False)
    caption = Column(Text, nullable=False, default="")
    keywords = Column(JSON, nullable=False, default=list)
    is_intro = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    location = relationship("Location", back_populates="media")


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    started_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    ended_at = Column(DateTime(timezone=True), nullable=True)
    is_kiosk = Column(Boolean, nullable=False, default=False)
    start_location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    message_count = Column(Integer, nullable=False, default=0)
    device_info = Column(Text, nullable=False, default="")

    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    role = Column(String(20), nullable=False)  # user | assistant
    content = Column(Text, nullable=False)
    input_type = Column(String(10), nullable=False, default="text")  # text | voice
    response_time_ms = Column(Integer, nullable=True)
    tool_calls = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    session = relationship("ChatSession", back_populates="messages")
