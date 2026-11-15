#!/usr/bin/env python3
"""Batch speech generation with a local VoxCPM2 model. Two backends, picked automatically:

  * mlx_audio  — Apple Silicon (MLX). Preferred when installed.
  * voxcpm     — PyTorch/CUDA (Windows, Linux + NVIDIA). Falls back here otherwise.

    voxcpm_batch.py JOBS.json

JOBS.json: {"model": "/path/VoxCPM2-8bit", "reference": "ref.wav", "transcript": "逐字稿", "cfg": 2.0, "steps": 12,   (items may override reference / transcript)
            "items": [{"text": "…", "seed": 1, "out": "/abs/out.wav", "mode": "combined|reference|design", "instruct": "…"}, …]}
Modes (VoxCPM2 official):
  combined   Hi-Fi clone: reference audio + verbatim transcript; closest to the voice; bracket instructions are ignored
  reference  controllable clone: reference audio + optional instruct, e.g. "极度愤怒，东北话"
  design     voice from a text description only (instruct is the description)
Prints one JSON line per item. The model is loaded once; items whose output already exists are skipped.
"""
import json, os, sys, time


def load_model(path):
    """Return (generate_fn, sample_rate, seed_fn) for whichever backend is installed."""
    try:
        import mlx.core as mx
        from mlx_audio.tts.utils import load
        m = load(path)
        sr = None

        def gen(text, mode, it, job):
            kw = {'text': text, 'inference_timesteps': int(it.get('steps', job.get('steps', 10))),
                  'cfg_value': float(it.get('cfg', job.get('cfg', 2.0))), 'max_tokens': len(text) * 6 + 10}
            if mode == 'design':
                kw['instruct'] = it.get('instruct') or job.get('design')
            elif mode == 'reference':
                kw['ref_audio'] = it.get('reference') or job['reference']
                if it.get('instruct'):
                    kw['instruct'] = it['instruct']
            else:
                ref = it.get('reference') or job['reference']
                kw.update(ref_audio=ref, prompt_audio=ref, prompt_text=it.get('transcript') or job['transcript'])
            mx.random.seed(int(it.get('seed', 0)))
            import numpy as np
            res = list(m.generate(**kw))
            audio = np.concatenate([np.asarray(r.audio) for r in res]).astype(np.float32)
            return audio, res[0].sample_rate

        return gen, mx.random.seed, 'mlx'
    except ImportError:
        pass

    import numpy as np, torch, soundfile as sf
    try:
        import torchaudio

        # torchaudio 2.9 delegates load() to torchcodec, whose Windows wheel needs FFmpeg
        # shared DLLs. soundfile reads wav/flac directly, which is all this needs.
        def _sf_load(p, *a, **k):
            data, srate = sf.read(str(p), dtype='float32', always_2d=True)
            return torch.from_numpy(np.ascontiguousarray(data.T)), srate
        torchaudio.load = _sf_load
    except Exception:
        pass

    from voxcpm import VoxCPM
    m = VoxCPM.from_pretrained(path, load_denoiser=False)
    sample_rate = m.tts_model.sample_rate
    is_v2 = '2' in os.path.basename(path.rstrip('\\/'))

    def gen(text, mode, it, job):
        torch.manual_seed(int(it.get('seed', 0)))
        kw = {'text': text, 'cfg_value': float(it.get('cfg', job.get('cfg', 2.0))),
              'inference_timesteps': int(it.get('steps', job.get('steps', 10)))}
        ref = it.get('reference') or job.get('reference')
        if mode == 'design':
            kw['text'] = '(%s)%s' % (it.get('instruct') or job.get('design') or '', text)
        elif mode == 'reference' and is_v2:
            kw['reference_wav_path'] = ref
            if it.get('instruct'):
                kw['text'] = '(%s)%s' % (it['instruct'], text)
        elif ref:
            kw.update(prompt_wav_path=ref, prompt_text=it.get('transcript') or job.get('transcript'))
            if mode == 'reference' and it.get('instruct'):
                kw['text'] = '(%s)%s' % (it['instruct'], text)
        audio = m.generate(**kw)
        return np.asarray(audio, dtype=np.float32), sample_rate

    def seed(n):
        torch.manual_seed(n)

    return gen, seed, 'cuda'


def main():
    job = json.load(open(sys.argv[1]))
    import numpy as np, soundfile as sf
    t0 = time.time()
    gen, seed, backend = load_model(job['model'])
    print(json.dumps({'event': 'loaded', 'backend': backend, 'seconds': round(time.time() - t0, 1)}), flush=True)
    for it in job['items']:
        if os.path.exists(it['out']):
            print(json.dumps({'out': it['out'], 'skipped': True}), flush=True)
            continue
        text = it['text']
        mode = it.get('mode') or job.get('mode') or 'combined'
        t1 = time.time()
        audio, sr = gen(text, mode, it, job)
        tmp = it['out'] + '.tmp.wav'
        sf.write(tmp, audio, sr, subtype='PCM_16')
        os.replace(tmp, it['out'])
        print(json.dumps({'out': it['out'], 'mode': mode, 'seconds': round(time.time() - t1, 1),
                          'duration': round(len(audio) / sr, 3), 'sr': sr}), flush=True)


if __name__ == '__main__':
    main()
