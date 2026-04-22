"""
ORM Table definitions — SQLAlchemy models mapping to Supabase PostgreSQL.
Based on plan/v1/task_1.3_database_schema.md
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, Float, Boolean, Integer, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


class Location(Base):
    __tablename__ = "locations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    status = Column(String(20), default="active")  # active | inactive
    is_start_node = Column(Boolean, default=False)
    map_x = Column(Float, default=0.0)
    map_y = Column(Float, default=0.0)
    description = Column(Text, default="")
    intro_message = Column(Text, default="")
    background_url = Column(Text, nullable=True)
    suggested_questions = Column(JSON, default=list)
    voice_config = Column(JSON, nullable=True)  # TTS config per location mascot
    camera_config = Column(JSON, nullable=True)  # 360° camera initial view
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    documents = relationship("Document", back_populates="location")
    media = relationship("Media", back_populates="location")


class LocationLink(Base):
    __tablename__ = "location_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False)
    to_location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False)
    label = Column(String(255), default="")
    path_points = Column(JSON, default=list)  # [{x, y}, ...] for map animation


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(500), nullable=False)
    file_url = Column(Text, nullable=False)
    file_type = Column(String(10))  # pdf | docx
    file_size = Column(Integer, default=0)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True)
    status = Column(String(20), default="pending")  # pending | processing | ready | error
    chunk_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    location = relationship("Location", back_populates="documents")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True)
    content = Column(Text, nullable=False)
    chunk_index = Column(Integer, default=0)
    metadata_ = Column("metadata", JSON, default=dict)
    # embedding = Column(Vector(768))  # pgvector — uncomment when pgvector extension is ready
    created_at = Column(DateTime, default=datetime.utcnow)

    document = relationship("Document", back_populates="chunks")


class Media(Base):
    __tablename__ = "media"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False)
    type = Column(String(10), nullable=False)  # image | video | gif
    url = Column(Text, nullable=False)
    caption = Column(Text, default="")
    keywords = Column(JSON, default=list)
    is_intro = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    location = relationship("Location", back_populates="media")


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    is_kiosk = Column(Boolean, default=False)

    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True)
    role = Column(String(20), nullable=False)  # user | assistant
    content = Column(Text, nullable=False)
    input_type = Column(String(10), default="text")  # text | voice
    response_time_ms = Column(Integer, nullable=True)
    tool_calls = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("ChatSession", back_populates="messages")
