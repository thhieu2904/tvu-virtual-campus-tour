"""
Test Gemini API — Key paid từ .env (AIzaSyDqjz3...)
"""
import time, sys

try:
    from google import genai
    from google.genai import types
except ImportError:
    print("⚠️  Cần: pip install google-genai")
    sys.exit(1)

API_KEY = ""
client = genai.Client(api_key=API_KEY)

print("=" * 60)
print("🧪 GEMINI PAID KEY TEST (từ .env)")
print("=" * 60)

# TEST 1: Chat
print("\n💬 TEST 1: Chat (gemini-2.5-flash)")
try:
    t0 = time.time()
    r = client.models.generate_content(
        model="gemini-2.5-flash",
        contents="Xin chào, bạn có hoạt động không? Trả lời 1 câu ngắn bằng tiếng Việt."
    )
    print(f"  ✅ ({time.time()-t0:.2f}s): {r.text[:200]}")
except Exception as e:
    print(f"  ❌ {str(e)[:200]}")

# TEST 2: Embedding
print("\n🔢 TEST 2: Embedding (gemini-embedding-001)")
try:
    t0 = time.time()
    r = client.models.embed_content(
        model="gemini-embedding-001",
        contents="Đại học Trà Vinh",
        config=types.EmbedContentConfig(task_type="QUESTION_ANSWERING", output_dimensionality=768)
    )
    vec = r.embeddings[0].values
    print(f"  ✅ ({time.time()-t0:.2f}s): {len(vec)} chiều")
except Exception as e:
    print(f"  ❌ {str(e)[:200]}")

# TEST 3: TTS
print("\n🔊 TEST 3: TTS (gemini-2.5-flash-preview-tts)")
try:
    t0 = time.time()
    r = client.models.generate_content(
        model="gemini-2.5-flash-preview-tts",
        contents="Xin chào!",
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Kore")
                )
            )
        )
    )
    audio = r.candidates[0].content.parts[0].inline_data.data
    print(f"  ✅ ({time.time()-t0:.2f}s): {len(audio)/1024:.0f}KB audio")
except Exception as e:
    print(f"  ❌ {str(e)[:200]}")

print(f"\n{'='*60}")
