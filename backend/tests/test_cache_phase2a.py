"""Tests for Admin Cache Phase 2A fingerprint contracts."""

import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from uuid import UUID

from app.services import cache_fingerprint_service as fingerprints
from app.services import cache_worker
from app.services import location_audio_service


MASCOT_ID = UUID("11111111-1111-1111-1111-111111111111")
LOCATION_ID = UUID("22222222-2222-2222-2222-222222222222")


def mascot(**overrides):
    data = {
        "id": MASCOT_ID,
        "name": "ViVy",
        "voice_name": "Leda",
        "voice_style": "friendly",
        "personality_prompt": "Ban la dai su ao cua TVU.",
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def question(text: str, sort_order: int = 0):
    return SimpleNamespace(question=text, sort_order=sort_order)


def location(**overrides):
    data = {
        "id": LOCATION_ID,
        "name": "Thu vien",
        "slug": "b7-thu-vien",
        "status": "active",
        "intro_message": "Minh la ViVy, rat vui duoc dan ban ghe tham Thu vien TVU.",
        "mascot": mascot(),
        "suggested_questions": [
            question("Thu vien mo cua may gio?", 0),
            question("Thu vien co may tang?", 1),
        ],
    }
    data.update(overrides)
    return SimpleNamespace(**data)


class CachePhase2AFingerprintTests(unittest.TestCase):
    def test_mascot_intro_fingerprint_changes_by_name_voice_and_prompt(self):
        base = fingerprints.mascot_intro_fingerprint(mascot())

        self.assertNotEqual(base, fingerprints.mascot_intro_fingerprint(mascot(name="Kaito")))
        self.assertNotEqual(base, fingerprints.mascot_intro_fingerprint(mascot(voice_name="Puck")))
        self.assertNotEqual(
            base,
            fingerprints.mascot_intro_fingerprint(mascot(personality_prompt="Ban la Kaito.")),
        )

    def test_location_qa_fingerprint_changes_by_suggested_question(self):
        base = fingerprints.location_suggested_qa_fingerprint(location())
        changed = fingerprints.location_suggested_qa_fingerprint(
            location(suggested_questions=[question("Thu vien co wifi khong?", 0)])
        )

        self.assertNotEqual(base, changed)

    def test_location_intro_fingerprint_changes_by_intro_message_and_voice(self):
        base_location = location()
        base = fingerprints.location_intro_fingerprint(base_location)

        self.assertNotEqual(
            base,
            fingerprints.location_intro_fingerprint(location(intro_message="Noi dung gioi thieu moi.")),
        )
        self.assertNotEqual(
            base,
            fingerprints.location_intro_fingerprint(location(mascot=mascot(voice_name="Puck"))),
        )

    def test_location_intro_fingerprint_changes_by_name_for_revisit_audio(self):
        base = fingerprints.location_intro_fingerprint(location())

        self.assertNotEqual(
            base,
            fingerprints.location_intro_fingerprint(location(name="Cong chinh")),
        )

    def test_revisit_audio_text_uses_pm_approved_template(self):
        self.assertEqual(
            location_audio_service.build_revisit_audio_text("Thư viện"),
            "Chào mừng bạn quay lại Thư viện.",
        )

    def test_location_intro_item_skips_uncacheable_locations(self):
        self.assertIsNotNone(fingerprints.build_location_intro_item(location()))
        self.assertIsNone(fingerprints.build_location_intro_item(location(intro_message="")))
        self.assertIsNone(fingerprints.build_location_intro_item(location(mascot=None)))
        self.assertIsNone(fingerprints.build_location_intro_item(location(status="inactive")))

    def test_qa_item_fingerprint_includes_tts_prompt_version(self):
        loc = location()
        base = fingerprints.qa_item_fingerprint(loc, loc.suggested_questions[0])
        original_version = fingerprints.TTS_PROMPT_VERSION
        try:
            fingerprints.TTS_PROMPT_VERSION = "tts-test-version"
            changed = fingerprints.qa_item_fingerprint(loc, loc.suggested_questions[0])
        finally:
            fingerprints.TTS_PROMPT_VERSION = original_version

        self.assertNotEqual(base, changed)

    def test_location_items_use_legacy_qa_cache_key_for_runtime_compatibility(self):
        loc = location()
        items = fingerprints.build_location_qa_items(loc)
        first_question = loc.suggested_questions[0].question
        expected_cache_key = fingerprints.qa_cache_lookup_key(first_question, loc.name)

        self.assertEqual(len(items), 4)
        self.assertEqual(items[0].qa_cache_key, expected_cache_key)
        self.assertEqual(items[0].item_key, f"qa:{loc.id}:{expected_cache_key}")
        self.assertEqual(items[0].artifact_type, "qa_answer")
        self.assertEqual(items[1].artifact_type, "qa_audio")


class CachePhase2BWorkerTests(unittest.TestCase):
    def test_job_type_mapping_uses_targeted_job_types(self):
        self.assertEqual(cache_worker.job_type_for("location", "questions"), "location_suggested_qa")
        self.assertEqual(cache_worker.job_type_for("location", "voice"), "location_qa_audio")
        self.assertEqual(cache_worker.job_type_for("mascot", "voice"), "mascot_intro_audio")
        self.assertEqual(cache_worker.job_type_for("mascot", "all"), "mascot_dependent_cache")

    def test_write_qa_cache_entry_atomic_preserves_existing_entries(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            cache_path = Path(tmp_dir) / "qa_cache.json"
            cache_path.write_text(
                json.dumps({"old": {"answer": "keep"}}, ensure_ascii=False),
                encoding="utf-8",
            )

            with (
                patch.object(cache_worker, "QA_CACHE_PATH", cache_path),
                patch.object(cache_worker.qa_cache_store, "reload") as reload_mock,
            ):
                asyncio.run(cache_worker._write_qa_cache_entry("new", {"answer": "added"}))

            data = json.loads(cache_path.read_text(encoding="utf-8"))
            self.assertEqual(data["old"]["answer"], "keep")
            self.assertEqual(data["new"]["answer"], "added")
            reload_mock.assert_called_once()


if __name__ == "__main__":
    unittest.main()
