"""
Test Gemini API Key — Kiểm tra Free Trial key hoạt động tới đâu
"""
import time
import sys

try:
    from google import genai
    from google.genai import types
except ImportError:
    print("⚠️  Cần cài google-genai: pip install google-genai")
    sys.exit(1)

API_KEY = ""
client = genai.Client(api_key=API_KEY)

print("=" * 60)
print("🧪 GEMINI FREE TRIAL KEY TEST")
print("=" * 60)

# ============================================================
# TEST 1: Chat — Gemini 2.5 Flash
# ============================================================
print("\n💬 TEST 1: Chat (gemini-2.5-flash)")
try:
    t0 = time.time()
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents="Bạn là hướng dẫn viên Đại học Trà Vinh. Trả lời ngắn: trường có mấy khoa?"
    )
    elapsed = time.time() - t0
    print(f"  ✅ Response ({elapsed:.2f}s):")
    print(f"     {response.text[:200]}")
    if hasattr(response, 'usage_metadata'):
        u = response.usage_metadata
        print(f"  📊 Tokens: in={u.prompt_token_count}, out={u.candidates_token_count}")
except Exception as e:
    print(f"  ❌ Lỗi: {e}")

# ============================================================
# TEST 2: Chat — Gemini 3.1 Flash Lite  
# ============================================================
print("\n💬 TEST 2: Chat (gemini-3.1-flash-lite)")
try:
    t0 = time.time()
    response = client.models.generate_content(
        model="gemini-3.1-flash-lite",
        contents="Giới thiệu ngắn gọn về Đại học Trà Vinh bằng tiếng Việt."
    )
    elapsed = time.time() - t0
    print(f"  ✅ Response ({elapsed:.2f}s):")
    print(f"     {response.text[:200]}")
except Exception as e:
    print(f"  ❌ Lỗi: {e}")

# ============================================================
# TEST 3: Embedding
# ============================================================
print("\n🔢 TEST 3: Embedding (gemini-embedding-001)")
try:
    t0 = time.time()
    result = client.models.embed_content(
        model="gemini-embedding-001",
        contents="Đại học Trà Vinh có bao nhiêu khoa?",
        config=types.EmbedContentConfig(
            task_type="QUESTION_ANSWERING",
            output_dimensionality=768
        )
    )
    elapsed = time.time() - t0
    vec = result.embeddings[0].values
    print(f"  ✅ Vector: {len(vec)} chiều ({elapsed:.2f}s)")
    print(f"     Preview: [{vec[0]:.6f}, {vec[1]:.6f}, ... {vec[-1]:.6f}]")
except Exception as e:
    print(f"  ❌ Lỗi: {e}")

# ============================================================
# TEST 4: Chat with Thinking (Gemini 2.5 Flash)
# ============================================================
print("\n🧠 TEST 4: Chat + Thinking Mode (gemini-2.5-flash)")
try:
    t0 = time.time()
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents="So sánh ngắn gọn 2 ngành CNTT và KTPM tại TVU.",
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(
                thinking_budget=1024
            )
        )
    )
    elapsed = time.time() - t0
    
    # Extract thinking and response
    for part in response.candidates[0].content.parts:
        if hasattr(part, 'thought') and part.thought:
            print(f"  🧠 Thinking: {part.text[:150]}...")
        else:
            print(f"  ✅ Response ({elapsed:.2f}s):")
            print(f"     {part.text[:200]}")
except Exception as e:
    print(f"  ❌ Lỗi: {e}")

# ============================================================
# TEST 5: TTS (Gemini 2.5 Flash TTS)
# ============================================================
print("\n🔊 TEST 5: TTS (gemini-2.5-flash-preview-tts)")
try:
    import wave, os
    t0 = time.time()
    response = client.models.generate_content(
        model="gemini-2.5-flash-preview-tts",
        contents="Chào bạn! Mình là trợ lý ảo của Đại học Trà Vinh.",
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name="Kore"
                    )
                )
            )
        )
    )
    elapsed = time.time() - t0
    audio_data = response.candidates[0].content.parts[0].inline_data.data
    
    out_path = os.path.join(os.path.dirname(__file__), "gemini_tts_test.wav")
    with wave.open(out_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(audio_data)
    
    audio_sec = len(audio_data) / (24000 * 2)
    print(f"  ✅ Audio: {audio_sec:.1f}s ({elapsed:.2f}s) | {len(audio_data)/1024:.0f}KB")
    print(f"     📁 {out_path}")
except Exception as e:
    print(f"  ❌ Lỗi: {e}")

# ============================================================
print(f"\n{'=' * 60}")
print("📊 TỔNG KẾT:")
print("  ✅ = Dùng được trên free trial")
print("  ❌ 429 = Hết quota free")  
print("  ❌ 403 = Key không có quyền")
print(f"{'=' * 60}")
