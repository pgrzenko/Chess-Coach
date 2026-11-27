import { spawn } from 'node:child_process';

const common = String.raw`$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
$message = [Console]::In.ReadToEnd()
$speaker = New-Object -ComObject SAPI.SpVoice
$voices = $speaker.GetVoices('Language=415')
if ($voices.Count -lt 1) { exit 1 }
$speaker.Voice = $voices.Item(0)
`;
const encode = script => Buffer.from(common + script, 'utf16le').toString('base64');
const speakCommand = encode(String.raw`# SpeechVoiceSpeakFlags 16 disables XML parsing.
[void]$speaker.Speak($message, 16)`);
const wavCommand = encode(String.raw`$stream = New-Object -ComObject SAPI.SpMemoryStream
$format = New-Object -ComObject SAPI.SpAudioFormat
$format.Type = 26 # SAFT24kHz16BitMono
$stream.Format = $format
$speaker.AudioOutputStream = $stream
[void]$speaker.Speak($message, 16)
[Console]::Write([Convert]::ToBase64String($stream.GetData()))`);

let playing;

function validText(text) {
  return process.platform === 'win32' && typeof text === 'string' && text.trim() &&
    text.length <= 180 && !/[\x00-\x1f]/.test(text);
}

function startSpeaker(command, buffered, signal) {
  return spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', command], {
    windowsHide: true, stdio: ['pipe', buffered ? 'pipe' : 'ignore', 'ignore'], signal,
  });
}

export function stopSpeech() {
  playing?.kill();
  playing = undefined;
}

export function speak(text) {
  if (!validText(text)) return Promise.resolve(false);
  stopSpeech();

  const child = startSpeaker(speakCommand, false);
  playing = child;
  return new Promise(resolve => {
    child.on('error', () => resolve(false));
    child.on('close', code => {
      if (playing === child) playing = undefined;
      resolve(code === 0);
    });
    child.stdin.on('error', () => resolve(false));
    child.stdin.end(text, 'utf8');
  });
}

export function pcmToWav(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(pcm.length + 36, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24);
  header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function synthesizeSpeech(text, signal) {
  if (!validText(text) || signal?.aborted) return Promise.resolve(null);
  const timeout = AbortSignal.timeout(10000);
  const stop = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const child = startSpeaker(wavCommand, true, stop);

  return new Promise(resolve => {
    const output = [];
    let length = 0;
    child.stdout.on('data', chunk => {
      length += chunk.length;
      if (length > 1_400_000) child.kill();
      else output.push(chunk);
    });
    child.on('error', () => resolve(null));
    child.stdin.on('error', () => resolve(null));
    child.on('close', code => {
      if (code !== 0 || stop.aborted) return resolve(null);
      const pcm = Buffer.from(Buffer.concat(output).toString('ascii'), 'base64');
      resolve(pcm.length > 0 && pcm.length % 2 === 0 ? pcmToWav(pcm) : null);
    });
    child.stdin.end(text, 'utf8');
  });
}
