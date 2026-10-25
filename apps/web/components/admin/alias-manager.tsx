'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AdminPageHeader, AdminTable, btnQuiet } from '@/components/admin/ui';

const entityTypes = ['champion', 'item', 'trait', 'augment', 'comp'] as const;
type EntityType = (typeof entityTypes)[number];
const isEntityType = (value: string): value is EntityType => entityTypes.some((type) => type === value);

export type AliasEntity = { id: string; type: EntityType; name: string };
export type AliasEntry = {
  id: number;
  alias: string;
  entityType: EntityType;
  entityId: string;
  targetName: string;
  createdAt: string;
};
export type UnresolvedAlias = {
  id: number;
  name: string;
  entityType: EntityType | 'unknown';
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

const inputCls =
  'smooth w-full rounded-lg border border-line bg-page px-3 py-2 text-sm text-fog placeholder:text-mist focus:border-brand-soft focus:outline-none';

type AudioCaptureSession = {
  stream: MediaStream;
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: AudioWorkletNode;
  chunks: Float32Array[];
  sampleCount: number;
  maxSamples: number;
  tooLong: boolean;
};

function closeCaptureSession(session: AudioCaptureSession): Promise<void> {
  session.processor.port.onmessage = null;
  session.processor.disconnect();
  session.source.disconnect();
  session.stream.getTracks().forEach((track) => track.stop());
  return session.audioContext.close();
}

function samplesToBuffer(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(samples.length * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(buffer);
  samples.forEach((sample, index) => view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, sample, true));
  return buffer;
}

export function AliasManager({
  initialAliases,
  initialUnresolved,
  entities,
}: {
  initialAliases: AliasEntry[];
  initialUnresolved: UnresolvedAlias[];
  entities: AliasEntity[];
}) {
  const [aliases, setAliases] = useState(initialAliases);
  const [unresolved, setUnresolved] = useState(initialUnresolved);
  const [entityType, setEntityType] = useState<EntityType>('champion');
  const [targetQuery, setTargetQuery] = useState('');
  const [selected, setSelected] = useState<AliasEntity | null>(null);
  const [alias, setAlias] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [audioError, setAudioError] = useState('');
  const [transcript, setTranscript] = useState('');
  const captureRef = useRef<AudioCaptureSession | null>(null);
  const [pendingTypes, setPendingTypes] = useState<Record<number, EntityType>>({});
  const [pendingTargets, setPendingTargets] = useState<Record<number, string>>({});

  const options = useMemo(() => {
    const query = targetQuery.trim().toLowerCase();
    return entities
      .filter((entity) => entity.type === entityType && (!query || entity.name.toLowerCase().includes(query)))
      .slice(0, 30);
  }, [entities, entityType, targetQuery]);

  const chooseType = (value: EntityType) => {
    setEntityType(value);
    setSelected(null);
    setTargetQuery('');
  };

  useEffect(
    () => () => {
      const session = captureRef.current;
      captureRef.current = null;
      if (session) void closeCaptureSession(session).catch((caught: unknown) => console.error('Could not close alias-test audio session', caught));
    },
    []
  );

  const startAudioTest = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext || !window.OfflineAudioContext || !window.AudioWorkletNode) {
      setAudioError('This browser does not support microphone recording.');
      return;
    }
    setAudioError('');
    setNotice('');
    setTranscript('');
    let stream: MediaStream | undefined;
    let audioContext: AudioContext | undefined;
    try {
      const statusResponse = await fetch('/api/voice/status', { cache: 'no-store' });
      if (!statusResponse.ok) throw new Error(`Voice status request failed (${statusResponse.status}).`);
      const status = (await statusResponse.json()) as { available?: boolean };
      if (!status.available) {
        setAudioError('Speech recognition is not configured on the API server. Set a provider key or download the local model before testing audio.');
        return;
      }

      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      audioContext = new AudioContext();
      await audioContext.resume();
      await audioContext.audioWorklet.addModule('/audio-capture-processor.js');
      const source = audioContext.createMediaStreamSource(stream);
      const processor = new AudioWorkletNode(audioContext, 'metaboard-audio-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      const session: AudioCaptureSession = {
        stream,
        audioContext,
        source,
        processor,
        chunks: [],
        sampleCount: 0,
        maxSamples: Math.ceil(audioContext.sampleRate * 60),
        tooLong: false,
      };
      processor.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        const samples = new Float32Array(event.data);
        const remaining = session.maxSamples - session.sampleCount;
        if (remaining <= 0) {
          session.tooLong = true;
          return;
        }
        const chunk = samples.slice(0, Math.min(samples.length, remaining));
        session.chunks.push(chunk);
        session.sampleCount += chunk.length;
        if (chunk.length < samples.length) session.tooLong = true;
      };
      source.connect(processor);
      processor.connect(audioContext.destination);
      captureRef.current = session;
      setRecording(true);
    } catch (caught) {
      stream?.getTracks().forEach((track) => track.stop());
      if (audioContext && audioContext.state !== 'closed') await audioContext.close();
      if (caught instanceof DOMException && caught.name === 'NotAllowedError') {
        setAudioError('Microphone permission was denied. Allow microphone access and try again.');
      } else if (caught instanceof DOMException && ['NotFoundError', 'NotReadableError', 'OverconstrainedError'].includes(caught.name)) {
        setAudioError('No usable microphone was found.');
      } else {
        setAudioError(caught instanceof Error ? caught.message : 'Could not start microphone recording.');
      }
    }
  };

  const stopAudioTest = async () => {
    const session = captureRef.current;
    if (!session) return;
    captureRef.current = null;
    setRecording(false);
    setTranscribing(true);
    setAudioError('');
    try {
      await closeCaptureSession(session);
      if (session.tooLong) {
        setAudioError('Recording exceeded the 60-second limit. Record a shorter sample.');
        return;
      }
      if (!session.sampleCount) {
        setAudioError('No audio was captured. Check your microphone and try again.');
        return;
      }

      const samples = new Float32Array(session.sampleCount);
      let offset = 0;
      for (const chunk of session.chunks) {
        samples.set(chunk, offset);
        offset += chunk.length;
      }
      const outputLength = Math.ceil((samples.length * 16_000) / session.audioContext.sampleRate);
      const offlineContext = new OfflineAudioContext(1, outputLength, 16_000);
      const audioBuffer = offlineContext.createBuffer(1, samples.length, session.audioContext.sampleRate);
      audioBuffer.copyToChannel(samples, 0);
      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offlineContext.destination);
      source.start();
      const resampled = await offlineContext.startRendering();
      const response = await fetch('/api/voice/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-Sample-Rate': '16000' },
        body: samplesToBuffer(resampled.getChannelData(0)),
      });
      const result = (await response.json()) as { text?: unknown; error?: unknown };
      if (!response.ok || typeof result.text !== 'string') {
        const message =
          result.error === 'stt_not_configured'
            ? 'Speech recognition is not configured on the API server.'
            : result.error === 'no_speech'
              ? 'No speech was recognized. Try speaking more clearly or closer to the microphone.'
              : result.error === 'transcription_busy'
                ? 'Speech recognition is busy. Try again in a moment.'
                : result.error === 'audio_too_long'
                  ? 'Audio is too long. Record a shorter sample.'
                  : `Speech recognition failed (${response.status}).`;
        setAudioError(message);
        return;
      }
      setTranscript(result.text.trim());
    } catch (caught) {
      console.error('Alias audio test failed', caught);
      setAudioError(caught instanceof Error ? caught.message : 'Could not transcribe the recording.');
    } finally {
      setTranscribing(false);
    }
  };

  const addAlias = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) {
      setError('Choose an entity first.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/aliases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ alias, entityType, entityId: selected.id }),
      });
      const data = (await response.json()) as { alias?: AliasEntry; error?: string };
      const created = data.alias;
      if (!response.ok || !created) throw new Error(data.error ?? `Request failed (${response.status}).`);
      setAliases((current) => [...current, { ...created, targetName: selected.name }]);
      setAlias('');
      setNotice(`Added “${created.alias}” for ${selected.name}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add alias.');
    } finally {
      setBusy(false);
    }
  };

  const removeAlias = async (entry: AliasEntry) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/aliases/${entry.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? `Request failed (${response.status}).`);
      }
      setAliases((current) => current.filter((aliasEntry) => aliasEntry.id !== entry.id));
      setNotice(`Removed “${entry.alias}”.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove alias.');
    } finally {
      setBusy(false);
    }
  };

  const pendingType = (entry: UnresolvedAlias): EntityType =>
    pendingTypes[entry.id] ?? (entry.entityType !== 'unknown' ? entry.entityType : 'champion');

  const approvePending = async (entry: UnresolvedAlias) => {
    const chosenType = pendingType(entry);
    const entityId = pendingTargets[entry.id];
    if (!entityId) {
      setError(`Choose a canonical entity for “${entry.name}” first.`);
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/aliases/unresolved/${entry.id}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entityType: chosenType, entityId }),
      });
      const data = (await response.json()) as { alias?: AliasEntry; error?: string };
      const approved = data.alias;
      if (!response.ok || !approved) throw new Error(data.error ?? `Request failed (${response.status}).`);
      setAliases((current) => [...current, approved]);
      setUnresolved((current) => current.filter((candidate) => candidate.id !== entry.id));
      setNotice(`Approved “${approved.alias}” for ${approved.targetName}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not approve the unresolved name.');
    } finally {
      setBusy(false);
    }
  };

  const dismissPending = async (entry: UnresolvedAlias) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/aliases/unresolved/${entry.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? `Request failed (${response.status}).`);
      }
      setUnresolved((current) => current.filter((candidate) => candidate.id !== entry.id));
      setNotice(`Dismissed “${entry.name}”.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not dismiss the unresolved name.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AdminPageHeader title="Coach entity aliases" sub="Add alternate names the Coach AI should recognize for champions, items, traits, augments, and comps." />
      <form onSubmit={addAlias} className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-mist">
            Entity type
            <select
              className={inputCls}
              value={entityType}
              onChange={(event) => {
                const value = event.target.value;
                if (isEntityType(value)) chooseType(value);
              }}
            >
              {entityTypes.map((type) => (
                <option key={type} value={type}>
                  {type[0].toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-mist">
            Find entity
            <input
              className={inputCls}
              value={selected?.name ?? targetQuery}
              placeholder={`Search ${entityType}s...`}
              onChange={(event) => {
                setSelected(null);
                setTargetQuery(event.target.value);
              }}
            />
            {targetQuery && !selected ? (
              <div className="max-h-52 overflow-y-auto rounded-lg border border-line bg-page">
                {options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setSelected(option);
                      setTargetQuery('');
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-fog hover:bg-util"
                  >
                    {option.name}
                  </button>
                ))}
                {!options.length ? <p className="px-3 py-2 text-xs text-mist">No matching entities.</p> : null}
              </div>
            ) : null}
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-mist">
            Alias
            <input className={inputCls} value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="e.g. old name or nickname" minLength={2} maxLength={80} required />
          </label>
        </div>
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-mist">{selected ? `Alias will point to ${selected.name}.` : 'Choose the canonical entity this alias refers to.'}</p>
          <button type="submit" disabled={busy || !selected || !alias.trim()} className={btnQuiet}>
            {busy ? 'Saving…' : 'Add alias'}
          </button>
        </div>
        {error ? <p role="alert" className="text-sm text-tier-s">{error}</p> : null}
        {notice ? <p role="status" className="text-sm text-brand-soft">{notice}</p> : null}
      </form>
      <section className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-5" aria-labelledby="alias-audio-test-title">
        <div>
          <h2 id="alias-audio-test-title" className="text-base font-bold text-fog">Test a spoken name</h2>
          <p className="mt-1 text-xs text-mist">
            Record a name with the Vietnamese speech recognizer configured on the API. If it is transcribed incorrectly, edit the transcript and add it as an alias for the selected entity.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={transcribing}
            onClick={() => (recording ? void stopAudioTest() : void startAudioTest())}
            className={btnQuiet}
          >
            {recording ? 'Stop and transcribe' : transcribing ? 'Transcribing…' : 'Record spoken name'}
          </button>
          <span aria-live="polite" className="text-xs text-mist">
            {recording ? 'Recording… maximum 60 seconds.' : transcribing ? 'Sending recording for transcription…' : 'Select the intended entity above before adding a transcript as an alias.'}
          </span>
        </div>
        {audioError ? <p role="alert" className="text-sm text-tier-s">{audioError}</p> : null}
        {transcript ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="alias-audio-transcript" className="text-xs font-semibold text-mist">
              Recognized text (editable)
            </label>
            <textarea
              id="alias-audio-transcript"
              className={`${inputCls} min-h-20 resize-y`}
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-mist">{selected ? `Target: ${selected.name}` : 'Select an entity above to use this text as its alias.'}</p>
              <button
                type="button"
                disabled={!selected || !transcript.trim() || busy}
                onClick={() => {
                  setAlias(transcript.trim());
                  setError('');
                  setNotice('');
                }}
                className={btnQuiet}
              >
                Use transcript as alias
              </button>
            </div>
          </div>
        ) : null}
      </section>
      <section className="flex flex-col gap-4" aria-labelledby="unresolved-aliases-title">
        <div>
          <h2 id="unresolved-aliases-title" className="font-display text-xl font-bold uppercase tracking-tight text-fog">
            Unresolved names
            {unresolved.length ? <span className="ml-2 rounded-full bg-brand-hot/15 px-2 py-0.5 text-sm text-brand-soft">{unresolved.length}</span> : null}
          </h2>
          <p className="mt-1 text-xs text-mist">
            Coach AI adds a name here when its entity lookup cannot resolve an LLM-extracted name. Review the suggestion, select the correct entity, or dismiss it. Unreviewed names are not used as aliases.
          </p>
        </div>
        {unresolved.length ? (
          <div className="flex flex-col gap-3">
            {unresolved.map((entry) => {
              const chosenType = pendingType(entry);
              const targetId = pendingTargets[entry.id] ?? '';
              const targetOptions = entities.filter((entity) => entity.type === chosenType);
              return (
                <div key={entry.id} className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-fog">{entry.name}</p>
                    <p className="text-xs text-mist">
                      Type hint: <span className="capitalize">{entry.entityType === 'unknown' ? 'not specified' : entry.entityType}</span>
                      {' · '}Seen {entry.occurrences} {entry.occurrences === 1 ? 'time' : 'times'}
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[minmax(120px,0.7fr)_minmax(220px,1.3fr)_auto]">
                    <label className="flex flex-col gap-1 text-xs font-semibold text-mist">
                      Entity type
                      <select
                        className={inputCls}
                        value={chosenType}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (!isEntityType(value)) return;
                          setPendingTypes((current) => ({ ...current, [entry.id]: value }));
                          setPendingTargets((current) => ({ ...current, [entry.id]: '' }));
                        }}
                      >
                        {entityTypes.map((type) => (
                          <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-semibold text-mist">
                      Correct entity
                      <select
                        className={inputCls}
                        value={targetId}
                        onChange={(event) => setPendingTargets((current) => ({ ...current, [entry.id]: event.target.value }))}
                      >
                        <option value="">Select canonical entity…</option>
                        {targetOptions.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
                      </select>
                    </label>
                    <div className="flex items-end justify-end gap-2">
                      <button type="button" disabled={busy} onClick={() => void dismissPending(entry)} className={btnQuiet}>Dismiss</button>
                      <button type="button" disabled={busy || !targetId} onClick={() => void approvePending(entry)} className={btnQuiet}>Approve alias</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl border border-line bg-panel p-4 text-sm text-mist">No unresolved entity names to review.</p>
        )}
      </section>
      <AdminTable head={['Alias', 'Type', 'Canonical entity', '']}>
        {aliases.map((entry) => (
          <tr key={entry.id}>
            <td className="font-semibold text-fog">{entry.alias}</td>
            <td className="capitalize text-mist">{entry.entityType}</td>
            <td className="text-mist">{entry.targetName}</td>
            <td>
              <div className="flex justify-end">
                <button type="button" disabled={busy} onClick={() => void removeAlias(entry)} className={btnQuiet}>
                  Remove
                </button>
              </div>
            </td>
          </tr>
        ))}
      </AdminTable>
      {!aliases.length ? <p className="text-xs text-mist">No custom aliases yet.</p> : null}
    </>
  );
}
