#!/usr/bin/env python3
"""Word (character) timestamps for Chinese speech.

    asr_words.py MODEL AUDIO [AUDIO …]

Two backends, picked by what is installed:
  * mlx-whisper      — Apple Silicon (repo id, e.g. mlx-community/whisper-large-v3-turbo)
  * faster-whisper   — CTranslate2, Windows/Linux with an NVIDIA card (repo id, e.g. Systran/faster-whisper-large-v3)

Prints one JSON line per file: {"file": …, "text": …, "words": [[word, start, end], …]}.
Runs offline (HF_HUB_OFFLINE=1 is set by the caller); the model must already be in the Hugging Face cache.
"""
import json, os, sys

MODEL = sys.argv[1]
FILES = sys.argv[2:]


def run_mlx():
    import mlx_whisper

    def one(path):
        r = mlx_whisper.transcribe(path, path_or_hf_repo=MODEL, language='zh', word_timestamps=True,
                                   initial_prompt='以下是普通话的句子。', condition_on_previous_text=False)
        words = [[w['word'], round(float(w['start']), 3), round(float(w['end']), 3)] for s in r['segments'] for w in s.get('words', [])]
        return r['text'], words

    return one


def run_faster():
    # CTranslate2 links against CUDA 12 (cublas64_12.dll, cuDNN 9). torch ships those DLLs but does not
    # put its lib dir on the search path for other packages, so point Windows at it explicitly.
    import os
    try:
        import torch
        lib = os.path.join(os.path.dirname(torch.__file__), 'lib')
        if os.path.isdir(lib):
            os.environ['PATH'] = lib + os.pathsep + os.environ.get('PATH', '')
            if hasattr(os, 'add_dll_directory'):
                os.add_dll_directory(lib)
    except Exception:
        pass
    from faster_whisper import WhisperModel
    models = {}

    def load(device, compute_type):
        if (device, compute_type) not in models:
            models[(device, compute_type)] = WhisperModel(MODEL, device=device, compute_type=compute_type, local_files_only=True)
        return models[(device, compute_type)]

    def one(path, state={'mode': ('cuda', 'float16')}):
        for attempt in (0, 1):
            try:
                m = load(*state['mode'])
                segs, _ = m.transcribe(path, language='zh', word_timestamps=True, initial_prompt='以下是普通话的句子。',
                                       condition_on_previous_text=False, vad_filter=True)
                # transcribe() returns a generator: the CUDA work (and any cublas error) happens here.
                words = [[w.word, round(w.start, 3), round(w.end, 3)] for s in segs for w in (s.words or [])]
                break
            except Exception as e:
                msg = str(e)
                if attempt == 0 and ('cublas' in msg or 'cudnn' in msg or 'uda' in msg):
                    state['mode'] = ('cpu', 'int8')
                    continue
                raise
        return ''.join(w[0] for w in words), words

    return one


def main():
    want = os.environ.get('ARTICLE2MEDIA_ASR_BACKEND', '').strip()
    if want == 'faster':
        one, backend = run_faster(), 'faster'
    elif want == 'mlx':
        one, backend = run_mlx(), 'mlx'
    else:
        try:
            one, backend = run_mlx(), 'mlx'
        except ImportError:
            one, backend = run_faster(), 'faster'
    print(json.dumps({'event': 'backend', 'backend': backend}), flush=True)
    for path in FILES:
        text, words = one(path)
        print(json.dumps({'file': path, 'text': text, 'words': words}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
