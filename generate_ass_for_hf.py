#!/usr/bin/env python3
"""
generate_ass_for_hf.py - 从 config.json 生成 ASS 字幕文件
  适配 html-ppt-to-video (HyperFrames) 项目

基于 daily-video-factory generate_ass.py v8.0 改造：
- 读取 per-scene-output 的 config.json
- 使用 narration 字段作为字幕文本
- 按标点优先断句，长句用jieba分词
- 时间轴按字符比例分配

用法: python generate_ass_for_hf.py <config.json> <output.ass>
"""

import json, sys, os, re

try:
    import jieba
    HAS_JIEBA = True
except ImportError:
    HAS_JIEBA = False


# ── 配置 ──────────────────────────────────────────────
MAX_CHARS_PER_LINE = 15      # 每行最多15字 (daily-video-factory 规范)
FONT_SIZE = 42               # 竖屏字号 (daily-video-factory: 52→42 for HF)
MARGIN_V = 120               # 底部边距 (daily-video-factory: 308→120 for HF)
PLAY_RES_Y = 1920            # 竖屏分辨率


def _split_by_punctuation(text):
    """按标点符号断句"""
    text = text.replace('、', ' ')
    
    pattern = r'([\uff0c\u3002\uff01\uff1f\uff1b\uff1a\u201c\u201d\u2018\u2019\uff08\uff09\u3010\u3011\u300a\u300b\u2026\u2014,\.!?;:\'"()\[\]<>-])'
    parts = re.split(pattern, text)
    
    sentences = []
    current = ''
    
    for part in parts:
        if not part:
            continue
        if re.match(pattern, part):
            if current.strip():
                sentences.append(current.strip())
            current = ''
        else:
            current += part
    
    if current.strip():
        sentences.append(current.strip())
    
    return sentences


def _jieba_split(text, max_len=15):
    """用jieba分词，按max_len组行"""
    # 数字前后加空格
    text = re.sub(r'(\D)(\d)', r'\1 \2', text)
    text = re.sub(r'(\d)(\D)', r'\1 \2', text)
    
    words = list(jieba.cut(text))
    
    lines = []
    current = ''
    
    for word in words:
        word = word.strip()
        if not word:
            continue
        
        if len(word) > max_len:
            if current:
                lines.append(current)
                current = ''
            for i in range(0, len(word), max_len):
                lines.append(word[i:i+max_len])
            continue
        
        limit = max_len + 2 if len(current) < 8 else max_len
        
        if not current:
            current = word
        elif len(current + word) <= limit:
            current += word
        else:
            lines.append(current)
            current = word
    
    if current:
        lines.append(current)
    
    return lines


def _simple_split(text, max_len=15):
    """无jieba时的简单断句：按标点优先，超长强制截断"""
    sentences = _split_by_punctuation(text)
    result = []
    for sent in sentences:
        if not sent:
            continue
        if len(sent) <= max_len:
            result.append(sent)
        else:
            # 强制截断
            while len(sent) > max_len:
                result.append(sent[:max_len])
                sent = sent[max_len:]
            if sent:
                result.append(sent)
    return result


def smart_split(text, max_len=MAX_CHARS_PER_LINE):
    """
    v8.0 智能字幕断句：
    1. 先按标点断句
    2. 短句(<=max_len)直接保留
    3. 长句用jieba分词（或简单截断）
    """
    # 预处理
    text = text.replace('\r\n', '，').replace('\n', '，').replace('\r', '，')
    text = text.replace('"', '').replace("'", '').replace('`', '')
    text = re.sub(r'\s+', ' ', text).strip()
    
    if not text:
        return ['']
    
    # 第一步：按标点断句
    sentences = _split_by_punctuation(text)
    
    # 第二步：处理每个句子
    result = []
    for sent in sentences:
        if not sent:
            continue
        if len(sent) <= max_len:
            result.append(sent)
        elif HAS_JIEBA:
            sub_lines = _jieba_split(sent, max_len)
            result.extend(sub_lines)
        else:
            sub_lines = _simple_split(sent, max_len)
            result.extend(sub_lines)
    
    return result if result else [text[:max_len]]


def format_ass_time(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    return f'{h}:{m:02d}:{s:02d}.{cs:02d}'


def generate_ass(config_path, output_ass, tts_durations=None):
    """主函数：从 config.json 生成 ASS 字幕文件
    
    Args:
        config_path: config.json 路径
        output_ass: 输出 ASS 文件路径
        tts_durations: 可选，每场景 TTS 实际时长列表（秒），用于对齐配音
                       优先级高于 config.json 中的 duration
    """
    
    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)
    
    scenes = config.get('scenes', [])
    
    # ASS 文件头
    ass_header = f"""[Script Info]
Title: Subtitles
ScriptType: v4.00+
PlayResY: {PLAY_RES_Y}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Microsoft YaHei Bold,{FONT_SIZE},&H00FFFFFF,&H000000FF,&H00404040,&H80000000,-1,0,0,0,100,100,0,0,1,2,0,2,10,10,{MARGIN_V},1
Style: Subtitle,Microsoft YaHei Bold,{FONT_SIZE},&H00FFFFFF,&H000000FF,&H00404040,&H80000000,-1,0,0,0,100,100,0,0,1,2,0,2,10,10,{MARGIN_V},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    
    current_time = 0.0
    events = []
    total_lines = 0
    
    for i, scene in enumerate(scenes):
        scene_data = scene.get('data', scene)
        
        # 优先用 narration（配音同步文本），fallback 到 subtitle/script/text
        text = scene_data.get('narration', '') or \
               scene_data.get('subtitle', '') or \
               scene_data.get('script', '') or \
               scene.get('text', '')
        
        # 优先使用 TTS 实际时长（字幕与配音同步），否则 fallback 到 config duration
        scene_idx = i  # 场景索引，用于 tts_durations 查找
        if tts_durations and scene_idx < len(tts_durations):
            duration = tts_durations[i]
        else:
            duration = scene.get('duration', 5.0)
        
        if not text:
            current_time += duration
            continue
        
        # 智能断句
        lines = smart_split(text, max_len=MAX_CHARS_PER_LINE)
        total_lines += len(lines)
        
        if not lines:
            lines = [text[:MAX_CHARS_PER_LINE]]
        
        # 时间轴按字符比例分配（daily-video-factory 方式）
        total_chars = sum(len(l) for l in lines)
        scene_start = current_time
        
        for i, line_text in enumerate(lines):
            if i < len(lines) - 1:
                # 按字数比例分配时间
                sub_dur = duration * len(line_text) / max(total_chars, 1)
            else:
                # 最后一行填满剩余时间
                sub_dur = (scene_start + duration) - current_time
            
            sub_start = current_time
            sub_end = current_time + sub_dur
            
            events.append(
                f'Dialogue: 0,{format_ass_time(sub_start)},{format_ass_time(sub_end)},Subtitle,,0,0,0,,{line_text}'
            )
            current_time = sub_end
    
    # 写入文件
    with open(output_ass, 'w', encoding='utf-8') as f:
        f.write(ass_header)
        for event in events:
            f.write(event + '\n')
    
    avg_lines = round(total_lines / len(scenes), 1) if scenes else 0
    print(f'Generated {len(events)} ASS subtitles ({avg_lines} lines/scene avg), total {current_time:.1f}s')
    return len(events)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Generate ASS subtitles from config.json')
    parser.add_argument('config', help='config.json path')
    parser.add_argument('output', help='output .ass file path')
    parser.add_argument('--tts-durations', type=str, default=None,
                        help='Comma-separated TTS durations per scene (seconds). '
                             'Example: --tts-durations 5.9,5.06,7.39')
    args = parser.parse_args()
    
    tts_durs = None
    if args.tts_durations:
        tts_durs = [float(x.strip()) for x in args.tts_durations.split(',') if x.strip()]
    
    count = generate_ass(args.config, args.output, tts_durations=tts_durs)
    if count > 0:
        print(f'ASS file written to {args.output}')
    else:
        print(f'No subtitles generated')
        sys.exit(1)
