#!/usr/bin/env python3
"""
post_production.py — Per-scene TTS + PIL Subtitles + BGM → final.mp4

Pipeline (v2 — daily-video-factory subtitle spec):
  1. Per-scene TTS with VTT timestamps → tts_durations.json
  2. SRT + PIL subtitle PNGs (48px white, ≤15 chars/line, y=1600)
  3. BGM preparation (loop or silence)
  4. FFmpeg: video + PIL subtitle overlays + TTS audio + BGM → final.mp4

Subtitle spec (from daily-video-factory SKILL.md):
  - Font size: 48px (vertical 1080×1920)
  - Color: white #FFFFFF
  - Position: y=1600 (lower third center)
  - Display: single-line sequential (not stacked)
  - Max chars per line: ≤15
  - Time base: TTS actual durations (tts_durations.json), NOT config estimates
  - Implementation: PIL PNG → FFmpeg overlay:enable='between(t,start,end)' chain
  - ❌ Forbidden: FFmpeg drawtext/ass/subtitles for Chinese rendering

Usage:
  python post_production.py --config config.json --video video-only.mp4
  python post_production.py --config config.json --video video-only.mp4 --bgm bgm.mp3
  python post_production.py --config config.json --video video-only.mp4 --no-bgm
"""

import argparse
import asyncio
import json
import math
import os
import subprocess
import sys
import tempfile
import shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

# ═══════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════

DEFAULT_VOICE = "zh-CN-YunjianNeural"
DEFAULT_RATE = "+20%"
DEFAULT_FFMPEG = shutil.which('ffmpeg') or r"D:\software\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe"
DEFAULT_BGM_VOLUME = 0.15
DEFAULT_TTS_VOLUME = 1.0

# Subtitle spec (daily-video-factory)
SUB_FONT_SIZE = 48
SUB_FONT_COLOR = (255, 255, 255)  # White #FFFFFF
SUB_Y_POSITION = 1600  # Lower third center for 1080×1920
SUB_MAX_CHARS = 15
SUB_FONT_PATH = r"C:\Windows\Fonts\msyhbd.ttc"  # 微软雅黑加粗
SUB_PADDING_X = 20
SUB_PADDING_Y = 10
SUB_BG_COLOR = (0, 0, 0, 160)  # Semi-transparent black background

OVERLAY_BATCH_SIZE = 5  # Max overlay filters per FFmpeg pass (avoids filter chain overflow)


# ═══════════════════════════════════════════════════════════
# UTILITY
# ═══════════════════════════════════════════════════════════

def get_duration(filepath, ffmpeg_path=DEFAULT_FFMPEG):
    """Get media duration in seconds using ffprobe"""
    ffprobe = ffmpeg_path.replace("ffmpeg.exe", "ffprobe.exe")
    cmd = [ffprobe, "-v", "quiet", "-print_format", "json", "-show_format", filepath]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr}")
    info = json.loads(result.stdout)
    return float(info["format"]["duration"])


def format_srt_time(seconds):
    """Format seconds to SRT timestamp (HH:MM:SS,mmm)"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def format_vtt_time(seconds):
    """Format seconds to VTT timestamp (HH:MM:SS.mmm)"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


# ═══════════════════════════════════════════════════════════
# STEP 1: EXTRACT NARRATION
# ═══════════════════════════════════════════════════════════

def extract_narration(config):
    """
    Extract narration text per scene from config.
    Returns list of dicts: {scene_id, layout, start_time, duration, text, text_lines}
    text_lines is a list of short phrases for subtitle splitting.
    """
    scenes_narration = []
    for scene in config.get("scenes", []):
        data = scene.get("data", {})
        layout = scene.get("layout", "")
        scene_id = scene.get("id", "s?")
        start = scene.get("startTime", 0)
        dur = scene.get("duration", 5)

        # Collect text parts in order
        text_parts = []  # (text, is_title) — titles don't go into subtitles

        # Kicker — treat as section marker, include in TTS but separate in subtitles
        kicker = data.get("kicker", "")
        if kicker:
            text_parts.append((kicker, True))

        # Title
        title = data.get("title", "")
        if title:
            text_parts.append((title, False))

        # Layout-specific
        content_parts = _extract_layout_content(layout, data)
        text_parts.extend(content_parts)

        # Build full narration text (for TTS)
        full_text = "。".join(p for p, _ in text_parts if p)

        # Build subtitle lines (separate each part, keep titles)
        sub_lines = []
        for text, _ in text_parts:
            if text:
                sub_lines.append(text)

        if full_text:
            scenes_narration.append({
                "scene_id": scene_id,
                "layout": layout,
                "start_time": start,
                "duration": dur,
                "text": full_text,
                "sub_lines": sub_lines,
            })

    return scenes_narration


def _extract_layout_content(layout, data):
    """Extract content tuples (text, is_title) for a specific layout"""
    parts = []

    if layout == "cover":
        if data.get("subtitle"):
            parts.append((data["subtitle"], False))
    elif layout in ("bullets", "numbered-list"):
        items = data.get("items", [])
        for item in items:
            if item:
                parts.append((str(item), False))
    elif layout == "toc":
        for item in data.get("items", []):
            if isinstance(item, dict):
                t = item.get("title", "")
                if t:
                    parts.append((t, False))
            else:
                parts.append((str(item), False))
    elif layout == "comparison":
        for col in data.get("cols", []):
            for key in ("name", "use", "save"):
                v = col.get(key, "")
                if v:
                    parts.append((v, False))
    elif layout == "process-steps":
        for step in data.get("steps", []):
            if step:
                parts.append((str(step), False))
    elif layout == "big-quote":
        if data.get("quote"):
            parts.append((data["quote"], False))
    elif layout == "stat-highlight":
        for key in ("big", "value", "label", "desc"):
            v = data.get(key, "")
            if v:
                parts.append((str(v), False))
    elif layout == "kpi-grid":
        for kpi in data.get("kpis", []):
            v = kpi.get("value", "")
            l = kpi.get("label", "")
            if v:
                parts.append((f"{v} {l}" if l else str(v), False))
    elif layout == "highlight-box":
        if data.get("text"):
            parts.append((data["text"], False))
    elif layout == "pros-cons":
        pros = data.get("pros", [])
        cons = data.get("cons", [])
        if pros:
            parts.append(("优点：" + "、".join(pros), False))
        if cons:
            parts.append(("缺点：" + "、".join(cons), False))
    elif layout == "timeline":
        for item in data.get("items", []):
            if isinstance(item, dict):
                t = item.get("text", "")
                if t:
                    parts.append((t, False))
            else:
                parts.append((str(item), False))
    elif layout == "icon-grid":
        for item in data.get("items", []):
            if isinstance(item, dict):
                t = item.get("label", "")
                if t:
                    parts.append((t, False))
            else:
                parts.append((str(item), False))
    elif layout == "cta":
        # CTA: content already captured by title above, skip layout-specific
        pass
    elif layout == "data-table":
        for row in data.get("rows", []):
            if isinstance(row, list):
                parts.append((" ".join(str(c) for c in row), False))
            else:
                parts.append((str(row), False))
    elif layout == "code":
        if data.get("code"):
            parts.append(("代码示例", False))
    elif layout == "terminal":
        if data.get("commands"):
            parts.append(("终端命令", False))
    elif layout in ("chart-bar", "chart-line", "chart-pie", "chart-radar"):
        parts.append(("数据图表", False))
    elif layout in ("flow-diagram", "arch-diagram", "mindmap", "roadmap", "gantt"):
        parts.append(("示意图", False))
    elif layout == "image-hero":
        if data.get("caption"):
            parts.append((data["caption"], False))
    elif layout == "fullscreen-stat":
        for key in ("big", "value", "label"):
            v = data.get(key, "")
            if v:
                parts.append((str(v), False))
    elif layout == "two-column":
        left = data.get("left", {})
        right = data.get("right", {})
        if left.get("title"):
            parts.append((left["title"], False))
        if right.get("title"):
            parts.append((right["title"], False))
    elif layout == "three-column":
        for col in data.get("cols", []):
            if col.get("title"):
                parts.append((col["title"], False))

    return parts


# ═══════════════════════════════════════════════════════════
# STEP 2: PER-SCENE TTS WITH PRECISE TIMESTAMPS
# ═══════════════════════════════════════════════════════════

async def generate_tts_with_timestamps(text, output_path, voice=DEFAULT_VOICE, rate=DEFAULT_RATE):
    """
    Generate TTS audio + sentence-level timestamps using edge-tts.
    edge-tts 7.x only provides SentenceBoundary (not WordBoundary).
    Returns list of dicts: [{text, start_s, end_s}, ...]
    """
    import edge_tts
    communicate = edge_tts.Communicate(text, voice, rate=rate)

    timestamps = []
    audio_data = bytearray()

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data.extend(chunk["data"])
        elif chunk["type"] == "SentenceBoundary":
            offset = chunk["offset"] / 10_000_000  # 100ns → seconds
            duration = chunk["duration"] / 10_000_000
            timestamps.append({
                "text": chunk["text"],
                "start_s": round(offset, 3),
                "end_s": round(offset + duration, 3),
            })

    # Write audio file
    with open(output_path, "wb") as f:
        f.write(audio_data)

    return timestamps


def generate_per_scene_tts(scenes_narration, work_dir, voice=DEFAULT_VOICE, rate=DEFAULT_RATE):
    """
    Generate TTS for each scene separately.
    Returns tts_durations: [{scene_id, audio_path, audio_dur_s, words: [{text, start_s, end_s}]}]
    """
    tts_durations = []
    global_offset = 0.0  # Running offset for concatenating per-scene audio

    for i, scene in enumerate(scenes_narration):
        audio_path = os.path.join(work_dir, f"tts_scene_{i:02d}.mp3")
        text = scene["text"]

        if not text.strip():
            tts_durations.append({
                "scene_id": scene["scene_id"],
                "audio_path": None,
                "audio_dur_s": 0,
                "words": [],
                "global_offset_s": global_offset,
            })
            continue

        # Generate TTS with timestamps
        sentence_timestamps = asyncio.run(
            generate_tts_with_timestamps(text, audio_path, voice, rate)
        )

        # Get actual audio duration
        audio_dur = get_duration(audio_path) if os.path.exists(audio_path) else 0

        # Calculate global offset for this scene
        # We'll use scene.startTime from config to place audio correctly
        scene_global_start = scene["start_time"]

        entry = {
            "scene_id": scene["scene_id"],
            "layout": scene["layout"],
            "audio_path": audio_path,
            "audio_dur_s": round(audio_dur, 3),
            "sentences": sentence_timestamps,
            "global_offset_s": scene_global_start,
        }
        tts_durations.append(entry)
        global_offset = scene_global_start + audio_dur

        print(f"    Scene {scene['scene_id']}: {audio_dur:.1f}s, {len(sentence_timestamps)} sentences")

    # Save tts_durations.json
    durations_path = os.path.join(work_dir, "tts_durations.json")
    # Remove audio_path for JSON (not serializable-friendly with temp paths)
    json_data = []
    for entry in tts_durations:
        e = {k: v for k, v in entry.items() if k not in ("audio_path",)}
        json_data.append(e)
    with open(durations_path, "w", encoding="utf-8") as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)

    print(f"  tts_durations.json saved: {durations_path}")
    return tts_durations


# ═══════════════════════════════════════════════════════════
# STEP 3: SRT + PIL SUBTITLE GENERATION
# ═══════════════════════════════════════════════════════════

def split_subtitle_line(text, max_chars=SUB_MAX_CHARS):
    """
    Split a single text string into subtitle lines (≤max_chars each).
    Rules:
    - Don't break English words mid-word
    - Prefer breaking at Chinese/English boundaries
    - Prefer breaking at punctuation marks
    - Strip pure-punctuation lines
    """
    if not text:
        return []

    # Remove leading/trailing punctuation-only content
    text = text.strip()
    if not text:
        return []

    lines = []
    current = ""
    i = 0

    while i < len(text):
        char = text[i]

        # If adding this char would exceed limit and we have content
        if len(current) + 1 > max_chars and current:
            # Try to find a good break point in the last portion
            break_idx = -1
            search_start = max(0, len(current) - 5)

            for j in range(len(current) - 1, search_start - 1, -1):
                if current[j] in "，,、；;：: ":
                    break_idx = j + 1
                    break

            if break_idx > 0:
                # Smart English word boundary: if text after break is short English (like "AI "),
                # it will look orphaned. Push it to next line by breaking earlier.
                remaining = current[break_idx:]
                remaining_stripped = remaining.strip()

                # Check if remaining is a short English fragment (like "AI ", "API ")
                is_short_english = (
                    remaining_stripped and
                    len(remaining_stripped) <= 5 and
                    all(c.isascii() for c in remaining_stripped)
                )

                if is_short_english:
                    # Try to find an earlier break point that leaves a cleaner line
                    earlier_break = -1
                    for j in range(break_idx - 1, max(0, break_idx - 10), -1):
                        if current[j] in "，,、；;：: ":
                            earlier_break = j + 1
                            break
                    if earlier_break > 0 and earlier_break != break_idx:
                        break_idx = earlier_break
                    # else: no better break point, accept the comma break
                    # The short English word on this line is OK, it just means
                    # next line starts with the rest of the English word

                lines.append(current[:break_idx])
                current = current[break_idx:]
            else:
                # Check if we're in the middle of an English word
                # Look ahead: if current ends with partial English word and next chars are also English
                last_char_is_alpha = current[-1].isascii() and current[-1].isalpha()
                next_char_is_alpha = char.isascii() and char.isalpha()

                if last_char_is_alpha and next_char_is_alpha:
                    # Find the start of the current English word
                    word_start = len(current) - 1
                    while word_start > 0 and current[word_start - 1].isascii() and current[word_start - 1].isalpha():
                        word_start -= 1

                    # If the word started recently, push the whole word to next line
                    if word_start > 0:
                        lines.append(current[:word_start])
                        current = current[word_start:]
                    else:
                        # Word is the entire current line, just break it
                        lines.append(current)
                        current = ""
                else:
                    lines.append(current)
                    current = ""

        current += char
        i += 1

    if current.strip():
        lines.append(current)

    # Filter out pure-punctuation lines (like standalone "。")
    lines = [l for l in lines if l.strip() and not all(c in "。！？，、；：,.!?;:" for c in l.strip())]

    # Merge too-short trailing lines (≤2 chars) into previous line
    merged = []
    for l in lines:
        if merged and len(l.strip()) <= 2 and len(merged[-1]) + len(l) <= max_chars + 2:
            merged[-1] = merged[-1] + l
        else:
            merged.append(l)
    lines = merged

    return lines


def generate_subtitles_from_tts(scenes_narration, tts_durations, work_dir):
    """
    Generate SRT and PIL subtitle PNGs using TTS word-level timestamps.

    Time base: TTS actual durations (tts_durations), NOT config estimates.

    Returns: list of SubtitleEntry {index, start_s, end_s, text, png_path}
    """
    subtitle_entries = []
    sub_index = 1

    # Create sub-PNGs directory
    png_dir = os.path.join(work_dir, "sub_pngs")
    os.makedirs(png_dir, exist_ok=True)

    # Load font
    try:
        font = ImageFont.truetype(SUB_FONT_PATH, SUB_FONT_SIZE)
    except Exception:
        font = ImageFont.truetype("msyhbd.ttc", SUB_FONT_SIZE)

    for scene_idx, scene in enumerate(scenes_narration):
        tts_info = tts_durations[scene_idx] if scene_idx < len(tts_durations) else None
        if not tts_info:
            continue

        global_offset = tts_info["global_offset_s"]
        sentences = tts_info.get("sentences", [])
        sub_lines = scene.get("sub_lines", [])

        if sentences and sub_lines:
            # We have sentence-level timestamps from TTS.
            # Strategy: pair each sub_line with a sentence by order.
            # If more sub_lines than sentences, distribute remaining evenly.
            # If more sentences than sub_lines, merge extra sentences into last sub_line.

            # Build subtitle display lines
            all_display_lines = []
            for line_text in sub_lines:
                dls = split_subtitle_line(line_text, SUB_MAX_CHARS)
                all_display_lines.extend(dls)

            if not all_display_lines:
                continue

            # Distribute sentence timestamps across display lines
            # Method: proportional allocation based on character count
            total_audio_dur = sentences[-1]["end_s"] if sentences else 0
            total_chars = sum(len(dl) for dl in all_display_lines)

            if total_chars == 0:
                continue

            current_time = global_offset
            for dl in all_display_lines:
                frac = len(dl) / total_chars
                dl_dur = total_audio_dur * frac
                dl_start = current_time
                dl_end = current_time + dl_dur

                png_path = _render_subtitle_png(dl, sub_index, png_dir, font)
                subtitle_entries.append({
                    "index": sub_index,
                    "start_s": round(dl_start, 3),
                    "end_s": round(dl_end, 3),
                    "text": dl,
                    "png_path": png_path,
                })
                sub_index += 1
                current_time = dl_end

        elif sub_lines:
            # Fallback: no word timestamps, distribute evenly within scene duration
            scene_start = scene["start_time"]
            scene_dur = scene["duration"]

            all_display_lines = []
            for line_text in sub_lines:
                display_lines = split_subtitle_line(line_text, SUB_MAX_CHARS)
                all_display_lines.extend(display_lines)

            if not all_display_lines:
                continue

            line_dur = scene_dur / len(all_display_lines)
            for i, dl in enumerate(all_display_lines):
                dl_start = scene_start + i * line_dur
                dl_end = dl_start + line_dur

                png_path = _render_subtitle_png(dl, sub_index, png_dir, font)
                subtitle_entries.append({
                    "index": sub_index,
                    "start_s": round(dl_start, 3),
                    "end_s": round(dl_end, 3),
                    "text": dl,
                    "png_path": png_path,
                })
                sub_index += 1

    # Generate SRT file
    srt_path = os.path.join(work_dir, "subtitles.srt")
    _write_srt(subtitle_entries, srt_path)

    print(f"  Subtitle entries: {len(subtitle_entries)}")
    print(f"  SRT: {srt_path}")
    print(f"  PNG dir: {png_dir}")

    return subtitle_entries, srt_path


def _render_subtitle_png(text, index, png_dir, font):
    """
    Render a single subtitle line as a PNG with semi-transparent background.
    Specs: 48px white text on semi-transparent black, centered horizontally.
    """
    # Calculate text size
    bbox = font.getbbox(text)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    # PNG dimensions: text + padding, full width for centering in overlay
    img_w = text_w + SUB_PADDING_X * 2
    img_h = text_h + SUB_PADDING_Y * 2

    # Create RGBA image
    img = Image.new("RGBA", (img_w, img_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Draw background rectangle
    draw.rounded_rectangle(
        [(0, 0), (img_w - 1, img_h - 1)],
        radius=8,
        fill=SUB_BG_COLOR,
    )

    # Draw text
    text_x = SUB_PADDING_X
    text_y = SUB_PADDING_Y
    draw.text((text_x, text_y), text, font=font, fill=SUB_FONT_COLOR + (255,))

    # Save PNG
    png_path = os.path.join(png_dir, f"sub_{index:04d}.png")
    img.save(png_path, "PNG")

    return png_path


def _write_srt(subtitle_entries, srt_path):
    """Write SRT file from subtitle entries"""
    lines = []
    for entry in subtitle_entries:
        lines.append(str(entry["index"]))
        lines.append(f"{format_srt_time(entry['start_s'])} --> {format_srt_time(entry['end_s'])}")
        lines.append(entry["text"])
        lines.append("")

    with open(srt_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


# ═══════════════════════════════════════════════════════════
# STEP 4: BGM PREPARATION
# ═══════════════════════════════════════════════════════════

def generate_silence(duration, output_path, ffmpeg_path=DEFAULT_FFMPEG):
    """Generate silence audio file"""
    cmd = [
        ffmpeg_path, "-y",
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-t", str(duration),
        "-c:a", "libmp3lame", "-b:a", "128k",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg silence generation failed: {result.stderr}")
    return output_path


def loop_bgm_to_duration(bgm_path, target_duration, output_path, ffmpeg_path=DEFAULT_FFMPEG):
    """Loop BGM to match target duration"""
    cmd = [
        ffmpeg_path, "-y",
        "-stream_loop", "-1",
        "-i", bgm_path,
        "-t", str(target_duration),
        "-c:a", "libmp3lame", "-b:a", "128k",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg BGM loop failed: {result.stderr}")
    return output_path


# ═══════════════════════════════════════════════════════════
# STEP 5: CONCATENATE PER-SCENE TTS
# ═══════════════════════════════════════════════════════════

def concatenate_tts(tts_durations, video_duration, work_dir, ffmpeg_path=DEFAULT_FFMPEG):
    """
    Concatenate per-scene TTS audio files with proper timing.
    Insert silence gaps to align with video timeline.
    Returns path to concatenated TTS audio file.
    """
    # Build a concat file with proper offsets
    # Use adelay filter to place each scene's TTS at the right time

    # Collect non-empty scene audio
    scene_audios = [(e["global_offset_s"], e["audio_path"], e["audio_dur_s"])
                    for e in tts_durations if e.get("audio_path")]

    if not scene_audios:
        # No TTS at all, generate silence
        silence_path = os.path.join(work_dir, "tts_full.mp3")
        generate_silence(video_duration, silence_path, ffmpeg_path)
        return silence_path

    # Method: use adelay to place each scene audio at correct offset,
    # then amix all together
    # Simpler method: concat with silence padding

    concat_parts = []
    current_time = 0.0

    for offset, audio_path, audio_dur in scene_audios:
        # Insert silence gap if needed
        if offset > current_time + 0.05:
            gap_dur = offset - current_time
            gap_path = os.path.join(work_dir, f"gap_{len(concat_parts)}.mp3")
            generate_silence(gap_dur, gap_path, ffmpeg_path)
            concat_parts.append(gap_path)
            current_time = offset

        concat_parts.append(audio_path)
        current_time = offset + audio_dur

    # Pad to video duration if TTS is shorter
    if current_time < video_duration - 0.5:
        gap_dur = video_duration - current_time
        gap_path = os.path.join(work_dir, "gap_final.mp3")
        generate_silence(gap_dur, gap_path, ffmpeg_path)
        concat_parts.append(gap_path)

    # Concatenate using FFmpeg
    concat_file = os.path.join(work_dir, "tts_concat.txt")
    with open(concat_file, "w", encoding="utf-8") as f:
        for p in concat_parts:
            # Use forward slashes for FFmpeg concat
            p_escaped = p.replace("\\", "/")
            f.write(f"file '{p_escaped}'\n")

    tts_full_path = os.path.join(work_dir, "tts_full.mp3")
    cmd = [
        ffmpeg_path, "-y",
        "-f", "concat", "-safe", "0",
        "-i", concat_file,
        "-c:a", "libmp3lame", "-b:a", "128k",
        tts_full_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"TTS concatenation failed: {result.stderr}")

    return tts_full_path


# ═══════════════════════════════════════════════════════════
# STEP 6: FINAL MIX WITH PIL SUBTITLE OVERLAYS
# ═══════════════════════════════════════════════════════════

def apply_subtitle_overlays(video_path, subtitle_entries, output_path, ffmpeg_path=DEFAULT_FFMPEG):
    """
    Apply PIL subtitle PNG overlays using FFmpeg overlay:enable='between(t,start,end)' chain.
    Process in batches of OVERLAY_BATCH_SIZE to avoid filter chain overflow.

    Subtitle spec: centered horizontally at y=SUB_Y_POSITION (1600).
    """
    if not subtitle_entries:
        # No subtitles, just copy
        shutil.copy2(video_path, output_path)
        return output_path

    # Process in batches
    current_video = video_path
    batch_num = 0

    for batch_start in range(0, len(subtitle_entries), OVERLAY_BATCH_SIZE):
        batch = subtitle_entries[batch_start:batch_start + OVERLAY_BATCH_SIZE]
        batch_num += 1

        if batch_start + OVERLAY_BATCH_SIZE < len(subtitle_entries):
            temp_output = output_path + f".batch_{batch_num}.mp4"
        else:
            temp_output = output_path

        # Build FFmpeg filter complex
        inputs = ["-i", current_video]
        for entry in batch:
            inputs.extend(["-i", entry["png_path"]])

        # Build overlay chain
        filter_parts = []
        prev_label = "0:v"

        for i, entry in enumerate(batch):
            overlay_idx = i + 1
            out_label = f"v{i}" if i < len(batch) - 1 else "vout"

            # Center horizontally: x = (W - overlay_w) / 2
            enable = f"between(t,{entry['start_s']:.3f},{entry['end_s']:.3f})"
            filter_parts.append(
                f"[{prev_label}][{overlay_idx}:v]"
                f"overlay=(W-overlay_w)/2:{SUB_Y_POSITION}"
                f":enable='{enable}'"
                f"[{out_label}]"
            )
            prev_label = out_label

        filter_complex = ";".join(filter_parts)

        cmd = [
            ffmpeg_path, "-y",
            *inputs,
            "-filter_complex", filter_complex,
            "-map", "[vout]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-r", "30",
            temp_output,
        ]

        print(f"  Overlay batch {batch_num}: {len(batch)} subtitles")
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"Subtitle overlay batch {batch_num} failed: {result.stderr}")

        # Update current_video for next batch
        if current_video != video_path and os.path.exists(current_video):
            os.remove(current_video)
        current_video = temp_output

    return current_video


def final_mix(video_with_subs_path, tts_path, bgm_path, output_path,
              tts_volume=DEFAULT_TTS_VOLUME, bgm_volume=DEFAULT_BGM_VOLUME,
              ffmpeg_path=DEFAULT_FFMPEG):
    """
    Final mix: video (with subtitles) + TTS + BGM → final.mp4
    """
    # Audio mixing
    audio_filter = (
        f"[0:a]volume={tts_volume}[tts];"
        f"[1:a]volume={bgm_volume}[bgm];"
        f"[tts][bgm]amix=inputs=2:duration=longest:dropout_transition=2[aout]"
    )

    cmd = [
        ffmpeg_path, "-y",
        "-i", video_with_subs_path,
        "-i", tts_path,
        "-i", bgm_path,
        "-filter_complex", audio_filter,
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        output_path,
    ]

    print(f"  Mixing: video+subs + TTS + BGM → {output_path}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        # Fallback: two-step mix
        print(f"  amix failed, trying two-step approach...")
        _final_mix_twostep(video_with_subs_path, tts_path, bgm_path, output_path,
                          tts_volume, bgm_volume, ffmpeg_path)

    return output_path


def _final_mix_twostep(video_path, tts_path, bgm_path, output_path,
                       tts_volume, bgm_volume, ffmpeg_path):
    """Fallback two-step mixing"""
    temp_audio = output_path + ".temp_audio.m4a"

    # Step 1: Mix TTS + BGM
    audio_filter = (
        f"[0:a]volume={tts_volume}[tts];"
        f"[1:a]volume={bgm_volume}[bgm];"
        f"[tts][bgm]amix=inputs=2:duration=longest[aout]"
    )
    cmd = [
        ffmpeg_path, "-y",
        "-i", tts_path,
        "-i", bgm_path,
        "-filter_complex", audio_filter,
        "-map", "[aout]",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        temp_audio,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Audio mix failed: {result.stderr}")

    # Step 2: Merge video + audio
    cmd = [
        ffmpeg_path, "-y",
        "-i", video_path,
        "-i", temp_audio,
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        "-map", "0:v",
        "-map", "1:a",
        "-shortest",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Video+audio merge failed: {result.stderr}")

    if os.path.exists(temp_audio):
        os.remove(temp_audio)


# ═══════════════════════════════════════════════════════════
# MAIN PIPELINE
# ═══════════════════════════════════════════════════════════

def run_pipeline(config_path, video_path, output_path=None,
                 bgm_path=None, no_bgm=False, no_tts=False, no_subs=False,
                 burn_subs=False,
                 voice=DEFAULT_VOICE, rate=DEFAULT_RATE,
                 ffmpeg_path=DEFAULT_FFMPEG,
                 bgm_volume=DEFAULT_BGM_VOLUME,
                 tts_volume=DEFAULT_TTS_VOLUME):
    """Run the full post-production pipeline (v2)"""

    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)

    title = config.get("title", "视频")
    if not output_path:
        output_path = os.path.join(os.path.dirname(video_path), "final.mp4")

    work_dir = tempfile.mkdtemp(prefix="postprod_")
    print(f"=== Post-Production Pipeline v2 ===")
    print(f"  Config: {config_path}")
    print(f"  Video:  {video_path}")
    print(f"  Output: {output_path}")
    print(f"  Voice:  {voice} @ {rate}")
    print(f"  Subs:   {'OFF' if no_subs else 'SRT + PIL PNG' + (' (burn-in)' if burn_subs else ' (external)')}")

    try:
        video_dur = get_duration(video_path, ffmpeg_path)
        print(f"  Video duration: {video_dur:.1f}s")

        # ── Step 1: Extract narration ──
        print(f"\n[1/6] Extracting narration...")
        scenes_narration = extract_narration(config)
        print(f"  Scenes with narration: {len(scenes_narration)}")
        for s in scenes_narration:
            print(f"    {s['scene_id']} ({s['layout']}): {len(s['text'])} chars, {len(s['sub_lines'])} lines")

        # ── Step 2: Per-scene TTS ──
        if no_tts:
            print(f"\n[2/6] TTS skipped (--no-tts)")
            tts_durations = []
            tts_full_path = os.path.join(work_dir, "tts_full.mp3")
            generate_silence(video_dur, tts_full_path, ffmpeg_path)
        else:
            print(f"\n[2/6] Generating per-scene TTS (voice={voice}, rate={rate})...")
            tts_durations = generate_per_scene_tts(scenes_narration, work_dir, voice, rate)
            total_tts = sum(e["audio_dur_s"] for e in tts_durations)
            print(f"  Total TTS: {total_tts:.1f}s across {len(tts_durations)} scenes")

            # Concatenate with timing
            print(f"  Concatenating TTS with scene timing...")
            tts_full_path = concatenate_tts(tts_durations, video_dur, work_dir, ffmpeg_path)
            tts_full_dur = get_duration(tts_full_path, ffmpeg_path)
            print(f"  TTS full duration: {tts_full_dur:.1f}s")

        # ── Step 3: Generate SRT + PIL subtitles ──
        if no_subs:
            print(f"\n[3/6] Subtitles skipped (--no-subs)")
            subtitle_entries = []
            srt_path = None
        else:
            print(f"\n[3/6] Generating subtitles (PIL PNG, {SUB_FONT_SIZE}px, y={SUB_Y_POSITION})...")
            subtitle_entries, srt_path = generate_subtitles_from_tts(
                scenes_narration, tts_durations, work_dir
            )

        # ── Step 4: Prepare BGM ──
        bgm_final_path = os.path.join(work_dir, "bgm.mp3")
        if no_bgm:
            print(f"\n[4/6] BGM skipped (--no-bgm)")
            generate_silence(video_dur, bgm_final_path, ffmpeg_path)
        elif bgm_path and os.path.exists(bgm_path):
            print(f"\n[4/6] Processing BGM: {bgm_path}")
            loop_bgm_to_duration(bgm_path, video_dur, bgm_final_path, ffmpeg_path)
        else:
            print(f"\n[4/6] No BGM file, generating silence...")
            generate_silence(video_dur, bgm_final_path, ffmpeg_path)

        # ── Step 5: Apply subtitle overlays (only if --burn-subs) ──
        video_with_subs_path = os.path.join(work_dir, "video_with_subs.mp4")
        if no_subs or not subtitle_entries or not burn_subs:
            print(f"\n[5/6] Subtitle overlay {'skipped' if (no_subs or not subtitle_entries) else 'not requested (use --burn-subs to burn in)'}")
            video_with_subs_path = video_path
        else:
            print(f"\n[5/6] Burning {len(subtitle_entries)} subtitle overlays into video (re-encoding)...")
            apply_subtitle_overlays(
                video_path, subtitle_entries, video_with_subs_path, ffmpeg_path
            )
            subs_dur = get_duration(video_with_subs_path, ffmpeg_path)
            print(f"  Video with subs: {subs_dur:.1f}s")

        # ── Step 6: Final mix ──
        print(f"\n[6/6] Final mix: video + TTS + BGM...")
        final_mix(
            video_with_subs_path, tts_full_path, bgm_final_path, output_path,
            tts_volume, bgm_volume, ffmpeg_path,
        )

        # ── Verify ──
        final_dur = get_duration(output_path, ffmpeg_path)
        final_size = os.path.getsize(output_path)
        print(f"\n=== Complete! ===")
        print(f"  Output: {output_path}")
        print(f"  Duration: {final_dur:.1f}s")
        print(f"  Size: {final_size / 1024 / 1024:.1f} MB")

        # Copy SRT next to output
        if srt_path and os.path.exists(srt_path):
            srt_output = os.path.splitext(output_path)[0] + ".srt"
            shutil.copy2(srt_path, srt_output)
            print(f"  SRT: {srt_output}")

        # Copy tts_durations.json next to output
        dur_json_src = os.path.join(work_dir, "tts_durations.json")
        if os.path.exists(dur_json_src):
            dur_json_dst = os.path.splitext(output_path)[0] + "_tts_durations.json"
            shutil.copy2(dur_json_src, dur_json_dst)
            print(f"  TTS durations: {dur_json_dst}")

        # Duration check
        if abs(final_dur - video_dur) > 1.0:
            print(f"  ⚠️ Duration mismatch: video={video_dur:.1f}s vs final={final_dur:.1f}s")

        return output_path

    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(
        description="Post-production v2: Per-scene TTS + PIL Subtitles + BGM → final.mp4"
    )
    parser.add_argument("--config", required=True, help="Scene config JSON")
    parser.add_argument("--video", required=True, help="Input video-only.mp4")
    parser.add_argument("--output", "-o", help="Output final.mp4")
    parser.add_argument("--bgm", help="BGM audio file")
    parser.add_argument("--no-bgm", action="store_true", help="Skip BGM")
    parser.add_argument("--no-tts", action="store_true", help="Skip TTS")
    parser.add_argument("--no-subs", action="store_true", help="Skip subtitle generation")
    parser.add_argument("--burn-subs", action="store_true", help="Burn PIL subtitle overlays into video (slow, re-encodes)")
    parser.add_argument("--voice", default=DEFAULT_VOICE)
    parser.add_argument("--rate", default=DEFAULT_RATE)
    parser.add_argument("--ffmpeg-path", default=DEFAULT_FFMPEG)
    parser.add_argument("--bgm-volume", type=float, default=DEFAULT_BGM_VOLUME)
    parser.add_argument("--tts-volume", type=float, default=DEFAULT_TTS_VOLUME)

    args = parser.parse_args()

    if not os.path.exists(args.config):
        print(f"Error: Config not found: {args.config}", file=sys.stderr)
        sys.exit(1)
    if not os.path.exists(args.video):
        print(f"Error: Video not found: {args.video}", file=sys.stderr)
        sys.exit(1)

    run_pipeline(
        config_path=args.config,
        video_path=args.video,
        output_path=args.output,
        bgm_path=args.bgm,
        no_bgm=args.no_bgm,
        no_tts=args.no_tts,
        no_subs=args.no_subs,
        burn_subs=args.burn_subs,
        voice=args.voice,
        rate=args.rate,
        ffmpeg_path=args.ffmpeg_path,
        bgm_volume=args.bgm_volume,
        tts_volume=args.tts_volume,
    )


if __name__ == "__main__":
    main()
