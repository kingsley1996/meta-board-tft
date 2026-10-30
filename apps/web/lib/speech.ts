// The speech text pipeline lives in the shared package so the API chunking an
// answer and the browser reading one cannot drift apart (task #85).
export { chunkForSpeech, maxSpeechChunkCharacters, spokenText } from '@tftiq/shared/speech-text';
